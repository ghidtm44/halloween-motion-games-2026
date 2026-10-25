# Build the Simple Playground Mac app

Run this from the repository on the target Mac:

```sh
bash launchers/macos/native/build-app.sh --desktop-copy
```

The result is a self-contained **Simple Playground Spooky Host.app** on the Desktop. Finder presents this `.app` directory as one application. It includes Node, the production web app, local vision assets, and its server dependencies; no installed Node or Terminal commands are needed to play. Google Chrome must be installed at `/Applications/Google Chrome.app` when the app is opened.

The script requires **macOS 13.5 or later**, Apple Xcode Command Line Tools with `swiftc` and the macOS SDK, and network access during the build. It supports the Mac's current `arm64` or `x86_64` architecture. It does not install or change global tools, launch the app/browser, start a camera, or make model requests. Check the available Apple tools with `xcode-select -p`, `xcrun --find swiftc`, and `xcrun --sdk macosx --show-sdk-path`.

Every attempt uses a new ignored `launchers/macos/native/build/local.XXXXXX/` directory. The verified original output remains there as `Simple Playground.app`. `--desktop-copy` creates the separately named Desktop app and **refuses an existing destination**, including a symlink; an older Desktop Simple Playground remains untouched. Omit the option to build only. An interrupted copy can leave a partial new destination; inspect and move that new folder before retrying.

```sh
# Review without downloads, writes, compilation, or app launch; also works on Linux.
bash launchers/macos/native/build-app.sh --dry-run --desktop-copy

# Build and verify into the fresh build directory only.
bash launchers/macos/native/build-app.sh
```

The inputs are the synchronized `Playground/` packaging snapshot and the native Swift sources. Develop in `apps/simple-playground-v1/`, test changes there, then explicitly synchronize its first-party files into the snapshot while preserving `scripts/native-runner.mjs`. The script refuses a snapshot missing either Spooky Host server module. It restores locked npm dependencies, verifies pinned MediaPipe assets, runs the production build and Node tests in staging, and packages `dist/`, `server.mjs`, `host-provider.mjs`, `host-session.mjs`, the native runner, `ws`, and license notices. Development dependencies, tests, personal runtime state, and local `.env` files are excluded from the finished app.

The runtime is pinned to **Node.js 24.22.1**. The script fetches the Darwin archive and `SHASUMS256.txt` from the [official release](https://nodejs.org/dist/v24.22.1/), requires the official digest to match its checked-in pin, then verifies the archive before extraction. Downloads and caches stay inside a fresh system temporary build directory, outside managed Desktop/Documents. The included Node license comes from that exact release. Node 24's [documented Darwin requirement](https://github.com/nodejs/node/blob/v24.22.1/BUILDING.md#platform-list) is macOS 13.5; the new bundle's metadata and compiler target use 13.5. The original preserved bundle used Node 22.23.1 ARM64 and declared macOS 13.0; this is a new package, not a byte-identical reconstruction.

Standard HTTP/HTTPS proxy variables and corporate CA configuration are retained for downloads and npm/Node asset installation. Node's environment-proxy support is enabled, with loopback hosts excluded. The web build receives a limited environment that excludes API credentials and `VITE_*` values. No secret is included in the app. The runtime launcher also forwards supported proxy settings for explicitly started online host sessions.

The script compiles the launcher with Cocoa and Security, generates its procedural icon, signs the newly copied Node executable and app **ad hoc**, and runs `codesign --verify --deep --strict`. Node's existing entitlements, including its JavaScript execution permissions, are preserved. The signed runtime must successfully execute a JavaScript smoke check before any Desktop copy. The script repeats signature verification after that copy. This provides local integrity; it is not Developer ID signing or notarization and does not establish Gatekeeper acceptance. Nothing disables Gatekeeper or changes quarantine attributes. `Contents/Resources/BUILD-INFO.txt` records the runtime, source revision/edits, compiler, and completed build checks.

The host starts in a safe, camera-off state. Offline scenes and Scripted rehearsal do not need an API key. The native menu **Save Spooky Host API Key…** stores a key in the current user's login Keychain; restart the app after saving. Future launches read it automatically. If the login Keychain is locked or an updated ad hoc signature needs authorization, **Authorize Saved Spooky Host Key…** requests access to the existing item. A stable Developer ID identity is preferable for distributed updates. Explicit process `OPENAI_API_KEY` or `SPOOKY_HOST_API_KEY` values take precedence over the Keychain entry.

For a local setup agent, the final signed executable supports `--import-spooky-host-key-stdin` (pipe a locally available key through standard input) and `--check-spooky-host-key` (exit 0 when saved and readable, otherwise nonzero). These modes exit before opening the app and make no network requests. Never put the key in a command argument, committed file, build input, or chat. Check an existing entry without displaying it:

```sh
"$HOME/Applications/Simple Playground Spooky Host.app/Contents/MacOS/SimplePlayground" --check-spooky-host-key
```

Cloud validation covers shell syntax, read-only dry runs, refusal to overwrite Desktop destinations, and a clear Linux build guard:

```sh
bash -n launchers/macos/native/build-app.sh
node --test launchers/macos/native/tests/build-app.test.mjs
```

Actual Swift/AppKit compilation, ad hoc signature verification, Keychain access across restarts, macOS permissions, and a Desktop launch require the Mac build and rehearsal. They have not been established by these Linux checks. Browser/live-provider evidence elsewhere in the repository also does not prove real webcam, physical HDMI, or sustained event behavior. The historical native-runner tests exercise server lifecycle and ownership only; run them separately in an isolated copy with fresh state when validating a built runtime.

Native signal regression checks can be run separately against an assembled app:

```sh
python3 launchers/macos/native/tests/native-app-signals.py \
  "/absolute/path/to/Simple Playground.app"
```

These Mac-only checks open the native launcher with isolated settings and no browser. An invalid synthetic environment override is rejected before any Keychain lookup, so the checks do not read or change saved credentials. They verify SIGTERM, SIGINT, repeated signals, and preservation of a server owned by another launcher. Native signal handling schedules termination through the AppKit run loop, allowing asynchronous child cleanup to finish during `terminateLater`.

Some File Provider-managed Desktop/Documents locations repeatedly add a `com.apple.FinderInfo` package flag to `.app` directories. Strict signature verification rejects that metadata even when the signed files are intact. Do not weaken strict checks or remove quarantine to work around it. Inspect the actual destination after copying; if metadata is continually restored, report the filesystem limitation and arrange a separately approved installation location. Verification of a clean staging copy alone does not verify the Desktop destination.

For a subsequent local upgrade:

1. Test and synchronize the active source, then run `bash launchers/macos/native/build-app.sh` without the Desktop-copy option. Record the build path and strict signature result.
2. Inspect the running session. Quit the native app normally when safe, preserve a recoverable previous bundle, and install into the approved user Applications location. Keep the existing Desktop shortcut pointing there.
3. Verify the actual installed bundle immediately and after at least 15 seconds. Test cold launch, normal Quit/relaunch and signal shutdown with isolated settings and the invalid synthetic override, avoiding Keychain access and paid requests.
4. Leave live-camera, API and saved-key checks to an authorized rehearsal. If an updated ad hoc signature needs permission for the existing saved key, the user can use **Authorize Saved Spooky Host Key…** in the native macOS app menu. Do not read, replace or re-enter the key as part of a packaging test.
5. Record current results separately from historical cloud evidence. Do not claim real visitor recognition, voice quality or physical HDMI testing from synthetic checks.

## Installed local revision (October 24)

The approved installation is `~/Applications/Simple Playground Spooky Host.app`, reached through `~/Desktop/Launch Spooky Host.app`. Preserve that shortcut and a recoverable previous bundle when upgrading. Build/sign in a fresh temporary directory outside File Provider-managed Desktop/Documents, then verify the actual installed bundle with strict validation after at least 15 seconds. Do not remove quarantine or weaken verification.

Use the native **Simple Playground** menu in the macOS menu bar for secure key entry/authorization, not the browser control room. Setup agents must obtain applicable action-time authorization before key access/configuration and must never recover keys from chats or logs. Synthetic packaging tests use the invalid test-only override documented by the signal regression script, which bypasses Keychain reads without configuring any credential.

## Separate offline Motion Games edition

Build with `bash launchers/macos/native/build-app.sh --motion-games`. This selects a separate bundle ID, display name, port 4328 and `Simple Playground Motion Games` Application Support directory. It skips Keychain/environment credential loading, hides key menus and rejects host commands server-side. Its only selectable worlds are jungle, underwater and space. The default host build is unchanged.

Install the new result into `~/Applications/Simple Playground Motion Games.app` and point `~/Desktop/Play Motion Games.app` to it. Refuse existing destinations until inspected; preserve previous artifacts on upgrades. Do not replace the installed Spooky Host, Corn Maze or original Desktop apps. Verify the actual installed bundle immediately and after at least 15 seconds, then test shortcut launch, normal Quit/relaunch and the signal regression. Motion tests need no credential override because this edition never loads a key. The native signal script automatically detects the bundle edition.

See [Motion Games](../../../docs/MOTION-GAMES.md) for operator instructions and live rehearsal limits.
