#!/bin/bash
# Rebuild a self-contained local Mac app from the synchronized packaging snapshot.
set -euo pipefail
umask 022

usage() {
  cat <<'USAGE'
Usage: bash launchers/macos/native/build-app.sh [--motion-games] [--desktop-copy] [--dry-run]

Build a new Simple Playground.app in a fresh system temporary directory on this Mac.
Downloads and verifies pinned official Node.js 24, restores locked dependencies
and vision assets, runs the web build/tests, compiles Swift, then signs/verifies
the new app. Requires macOS 13.5+, Xcode Command Line Tools and network access.
An installed Node.js is not required. The app and camera are never launched.

  --motion-games  Build the offline motion edition with separate app identity,
                  port, settings, and no credential access.
  --desktop-copy  Also copy the verified app to
                  ~/Desktop/Simple Playground Spooky Host.app.
                  Refuse an existing destination; never replace an older app.
  --dry-run       Show the recipe without downloading, writing or compiling.
                  Works on Linux too; the actual build requires a Mac.
  --help, -h      Show this help.
USAGE
}

fail() { printf 'Build stopped: %s\n' "$*" >&2; exit 1; }
motion_games=0
desktop_copy=0
dry_run=0
for argument in "$@"; do
  case "$argument" in
    --motion-games) motion_games=1 ;;
    --desktop-copy) desktop_copy=1 ;;
    --dry-run) dry_run=1 ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown argument: $argument. Use --help." ;;
  esac
done

native_source="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
snapshot="$native_source/Playground"
node_version=24.22.1
minimum_macos=13.5
desktop_destination="$HOME/Desktop/Simple Playground Spooky Host.app"
if [ "$motion_games" -eq 1 ]; then desktop_destination="$HOME/Desktop/Simple Playground Motion Games.app"; fi
case "$(uname -m)" in
  arm64|aarch64)
    node_arch=arm64
    swift_arch=arm64
    pinned_sha256=89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7
    ;;
  x86_64)
    node_arch=x64
    swift_arch=x86_64
    pinned_sha256=d132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035
    ;;
  *) fail 'Only Apple Silicon (arm64) and Intel (x86_64) builds are supported.' ;;
esac
node_release="node-v$node_version-darwin-$node_arch"
node_archive="$node_release.tar.gz"
node_url="https://nodejs.org/dist/v$node_version"

if [ "$desktop_copy" -eq 1 ]; then
  [ ! -e "$desktop_destination" ] && [ ! -L "$desktop_destination" ] ||
    fail "Desktop destination already exists: $desktop_destination. Leave it intact and move it yourself before retrying."
fi

if [ "$dry_run" -eq 1 ]; then
  printf 'Source: %s\n' "$snapshot"
  printf 'Fresh build: %s/simple-playground-build.XXXXXX/Simple Playground.app\n' "${TMPDIR:-/tmp}"
  printf 'Runtime: %s/%s\nSHA-256: %s\n' "$node_url" "$node_archive" "$pinned_sha256"
  printf 'Target: %s-apple-macosx%s (build on the target Mac)\n' "$swift_arch" "$minimum_macos"
  printf '%s\n' \
    'Verify pinned SHA-256 against the official release checksums and downloaded archive.' \
    'Copy snapshot source to fresh staging; omit local credentials and state.' \
    'Use bundled npm: npm ci, npm run assets, npm run build, npm test.' \
    'Bundle production dist, host modules, native runner, ws, Node and license notices.' \
    'Compile Cocoa/Security launcher, generate icon, ad hoc sign, verify signature.' \
    'No app, browser, camera or online host session is started.'
  if [ "$desktop_copy" -eq 1 ]; then printf 'Copy verified app, refusing an existing destination: %s\n' "$desktop_destination"; fi
  exit 0
fi

[ "$(uname -s)" = Darwin ] || fail 'Native compilation requires macOS. Use --dry-run to inspect the recipe here.'
for tool in xcrun curl shasum tar rsync git; do
  command -v "$tool" >/dev/null 2>&1 || fail "Required tool is unavailable: $tool. Install Apple Command Line Tools through the normal macOS setup flow."
done
macos_version="$(/usr/bin/sw_vers -productVersion)"
macos_major="${macos_version%%.*}"
macos_remainder="${macos_version#*.}"
macos_minor="${macos_remainder%%.*}"
if [ "$macos_major" -lt 13 ] || { [ "$macos_major" -eq 13 ] && [ "$macos_minor" -lt 5 ]; }; then
  fail "Node.js $node_version requires macOS $minimum_macos or later; found $macos_version."
fi
native_sdk="$(xcrun --sdk macosx --show-sdk-path)" || fail 'The macOS SDK is unavailable.'
xcrun --find swiftc >/dev/null || fail 'The Swift compiler is unavailable.'
for entry in src public scripts tests server.mjs host-provider.mjs host-session.mjs package.json package-lock.json tsconfig.json vite.config.ts index.html THIRD-PARTY-NOTICES.md; do
  [ -e "$snapshot/$entry" ] || fail "Packaging snapshot is incomplete: $entry. Synchronize the tested primary app before packaging."
done
[ -f "$snapshot/scripts/native-runner.mjs" ] || fail 'The native runner is missing from the snapshot.'
if git -C "$native_source" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$native_source" check-ignore -q -- "$native_source/build/.ignore-probe" || fail 'The build/ directory must be ignored by Git.'
fi
if [ "$desktop_copy" -eq 1 ]; then [ -d "$HOME/Desktop" ] || fail 'The Desktop directory does not exist.'; fi

# Managed Desktop/Documents may add FinderInfo to .app directories repeatedly.
# Assemble and sign outside those sync roots; never weaken signature validation.
native_build="$(mktemp -d "${TMPDIR:-/tmp}/simple-playground-build.XXXXXX")"
printf 'Fresh build directory: %s\n' "$native_build"
# Keep a failed build available for diagnosis; never remove another build or app.
trap 'printf "Build interrupted or failed; staging remains at: %s\n" "$native_build" >&2' ERR
native_stage="$native_build/Playground"
mkdir -p "$native_stage" "$native_build/downloads" "$native_build/module-cache" "$native_build/npm-cache"

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --retry 3 --connect-timeout 30 --max-time 600 \
  "$node_url/SHASUMS256.txt" -o "$native_build/downloads/SHASUMS256.txt"
official_sha256="$(awk -v filename="$node_archive" '$2 == filename { print $1 }' "$native_build/downloads/SHASUMS256.txt")"
[ "$official_sha256" = "$pinned_sha256" ] || fail 'Official Node release checksum differs from the pinned SHA-256. Stop and review the release.'
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --retry 3 --connect-timeout 30 --max-time 600 \
  "$node_url/$node_archive" -o "$native_build/downloads/$node_archive"
printf '%s  %s\n' "$pinned_sha256" "$node_archive" > "$native_build/downloads/node.sha256"
(cd "$native_build/downloads" && shasum -a 256 -c node.sha256)
tar -xzf "$native_build/downloads/$node_archive" -C "$native_build/downloads"
native_node_release="$native_build/downloads/$node_release"
native_node="$native_node_release/bin/node"
[ "$("$native_node" --version)" = "v$node_version" ] || fail 'The extracted Node version does not match.'
[ "$("$native_node" -p 'process.arch')" = "$node_arch" ] || fail 'The extracted Node architecture does not match.'

# Explicit top-level inputs exclude settings, logs, .env, an existing dist, and
# runtime binaries. Exclude local secret files within those source directories too.
for entry in src public scripts tests server.mjs host-provider.mjs host-session.mjs package.json package-lock.json tsconfig.json vite.config.ts index.html THIRD-PARTY-NOTICES.md; do
  rsync -a --exclude='.env' --exclude='.env.*' --exclude='*.pem' --exclude='*.key' \
    --exclude='*.p12' --exclude='.DS_Store' --exclude='.git' \
    "$snapshot/$entry" "$native_stage/"
done

# Keep developer/API secrets and VITE_* values out of the build environment.
# Retain supported proxy and corporate CA settings without printing their values.
build_environment=(
  "PATH=$native_node_release/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  "HOME=$HOME" "TMPDIR=${TMPDIR:-/tmp}" "NODE_USE_ENV_PROXY=1"
  "npm_config_cache=$native_build/npm-cache" "npm_config_audit=false" "npm_config_fund=false"
  "NO_PROXY=${NO_PROXY:+$NO_PROXY,}127.0.0.1,localhost,::1"
  "no_proxy=${no_proxy:+$no_proxy,}127.0.0.1,localhost,::1"
)
for variable in HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy NODE_EXTRA_CA_CERTS SSL_CERT_FILE SSL_CERT_DIR npm_config_proxy npm_config_https_proxy npm_config_cafile npm_config_registry; do
  if [ -n "${!variable:-}" ]; then build_environment+=("$variable=${!variable}"); fi
done
run_npm() {
  (cd "$native_stage" && env -i "${build_environment[@]}" "$native_node" "$native_node_release/lib/node_modules/npm/bin/npm-cli.js" "$@")
}
run_npm ci
run_npm run assets
run_npm run build
run_npm test

native_bundle="$native_build/Simple Playground.app"
native_contents="$native_bundle/Contents"
bundle_playground="$native_contents/Resources/Playground"
mkdir -p "$native_contents/MacOS" "$bundle_playground/scripts" "$bundle_playground/runtime" "$bundle_playground/node_modules"
cp "$native_source/Info.plist" "$native_contents/Info.plist"
# Node 24's official Darwin binaries require 13.5, unlike the historical bundle.
/usr/bin/plutil -replace LSMinimumSystemVersion -string "$minimum_macos" "$native_contents/Info.plist"
if [ "$motion_games" -eq 1 ]; then
  /usr/bin/plutil -insert PlaygroundEdition -string motion "$native_contents/Info.plist"
  /usr/bin/plutil -replace CFBundleIdentifier -string com.local.simpleplayground.motiongames "$native_contents/Info.plist"
  /usr/bin/plutil -replace CFBundleName -string "Simple Playground Motion Games" "$native_contents/Info.plist"
  /usr/bin/plutil -replace CFBundleDisplayName -string "Simple Playground Motion Games" "$native_contents/Info.plist"
fi
/usr/bin/plutil -lint "$native_contents/Info.plist"
cp "$native_source/PkgInfo" "$native_contents/PkgInfo"
if [ "$motion_games" -eq 1 ]; then
  cp "$native_source/MOTION START HERE.txt" "$native_contents/Resources/START HERE.txt"
else
  cp "$native_source/START HERE.txt" "$native_contents/Resources/START HERE.txt"
fi
for entry in dist server.mjs host-provider.mjs host-session.mjs package.json package-lock.json THIRD-PARTY-NOTICES.md; do
  cp -R "$native_stage/$entry" "$bundle_playground/$entry"
done
cp "$native_stage/scripts/native-runner.mjs" "$bundle_playground/scripts/native-runner.mjs"
cp -R "$native_stage/node_modules/ws" "$bundle_playground/node_modules/ws"
cp "$native_node" "$bundle_playground/runtime/node"
cp "$native_node_release/LICENSE" "$bundle_playground/runtime/NODE-LICENSE.txt"
cp "$native_stage/node_modules/ws/LICENSE" "$bundle_playground/runtime/WS-LICENSE.txt"
# Correct the historical runtime line in the new artifact, preserving source notes.
"$native_node" --input-type=module - "$bundle_playground/THIRD-PARTY-NOTICES.md" "$node_version" "$node_arch" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const [path, version, arch] = process.argv.slice(2);
const line = `- **Node.js ${version}**, Mac ${arch} executable bundled in \`runtime/node\`. License and bundled third-party notices: \`runtime/NODE-LICENSE.txt\`. Upstream: https://nodejs.org/`;
const original = readFileSync(path, 'utf8');
if (!/^- \*\*Node\.js .*$/m.test(original)) throw new Error('Expected Node license notice is missing.');
writeFileSync(path, original.replace(/^- \*\*Node\.js .*$/m, line));
JS
chmod 755 "$bundle_playground/runtime/node"

xcrun swiftc -sdk "$native_sdk" -target "$swift_arch-apple-macosx$minimum_macos" \
  -module-cache-path "$native_build/module-cache" -framework Cocoa -framework Security \
  "$native_source/Launcher.swift" -o "$native_contents/MacOS/SimplePlayground"
xcrun swiftc -sdk "$native_sdk" -target "$swift_arch-apple-macosx$minimum_macos" \
  -module-cache-path "$native_build/module-cache" -framework Cocoa \
  "$native_source/Icon.swift" -o "$native_build/MakeIcon"
"$native_build/MakeIcon" "$native_build/AppIcon.iconset"
/usr/bin/iconutil -c icns "$native_build/AppIcon.iconset" -o "$native_contents/Resources/AppIcon.icns"
chmod 755 "$native_contents/MacOS/SimplePlayground"

{
  printf 'Motion games edition: %s\n' "$motion_games"
  printf 'Node.js: %s (%s)\nMinimum macOS: %s\n' "$node_version" "$node_arch" "$minimum_macos"
  printf 'Official Node archive: %s/%s\nSHA-256: %s\n' "$node_url" "$node_archive" "$pinned_sha256"
  printf 'Source revision: %s\n' "$(git -C "$native_source" rev-parse HEAD 2>/dev/null || printf 'unavailable')"
  printf 'Source edits at build time:\n'
  git -C "$native_source" status --short -- . 2>/dev/null || true
  printf 'Compiler:\n'
  xcrun swiftc --version
  printf 'Validation: locked dependency install; verified vision assets; web production build; Node test suite.\n'
  printf 'Signing: ad hoc, for local use; no Developer ID or notarization.\n'
} > "$native_contents/Resources/BUILD-INFO.txt"

for entry in dist/index.html dist/vision-worker.js dist/models/pose_landmarker_lite.task dist/models/manifest.json dist/wasm/vision_wasm_internal.wasm host-provider.mjs host-session.mjs scripts/native-runner.mjs node_modules/ws/package.json runtime/node runtime/NODE-LICENSE.txt runtime/WS-LICENSE.txt; do
  [ -s "$bundle_playground/$entry" ] || fail "Assembled bundle is missing: $entry."
done
# The signature is applied only to these freshly created copies.
/usr/bin/codesign --force --sign - --preserve-metadata=entitlements "$bundle_playground/runtime/node"
/usr/bin/codesign --force --sign - "$native_bundle"
/usr/bin/codesign --verify --strict --verbose=2 "$bundle_playground/runtime/node"
/usr/bin/codesign --verify --deep --strict --verbose=2 "$native_bundle"
[ "$(env -i PATH=/usr/bin:/bin "$bundle_playground/runtime/node" --version)" = "v$node_version" ] || fail 'The signed bundled runtime did not start correctly.'
env -i PATH=/usr/bin:/bin "$bundle_playground/runtime/node" --input-type=module -e 'let total=0;for(let i=0;i<1000000;i++)total+=i;if(total!==499999500000)process.exit(1);console.log("Signed bundled Node executed JavaScript successfully.");'

if [ "$desktop_copy" -eq 1 ]; then
  # mkdir reserves the exact name atomically; ditto never targets an existing app.
  mkdir "$desktop_destination" || fail "Desktop destination now exists: $desktop_destination. It was left intact."
  /usr/bin/ditto --norsrc --noextattr "$native_bundle" "$desktop_destination"
  /usr/bin/codesign --verify --deep --strict --verbose=2 "$desktop_destination"
  printf 'Copied verified app: %s\n' "$desktop_destination"
fi
printf 'Built and verified: %s\n' "$native_bundle"
printf '%s\n' 'The app has not been launched. Camera, TV, Keychain and live host validation require a Mac rehearsal.'
