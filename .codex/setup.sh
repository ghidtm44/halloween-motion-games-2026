#!/usr/bin/env bash
set -euo pipefail

cloud_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$cloud_repo_root"
node -e 'const major=Number(process.versions.node.split(".")[0]); if(major<22){console.error("Node.js 22 or newer is required."); process.exit(1);}'

# Setup needs npm, storage.googleapis.com and raw.githubusercontent.com.
# The asset installer verifies pinned hashes and does not install a Mac runtime.
for cloud_app in apps/simple-playground-v1 apps/corn-maze; do
  (
    cd -- "$cloud_repo_root/$cloud_app"
    npm ci --no-audit --no-fund
    npm run assets
    PLAYGROUND_NO_BROWSER=1 npm run check
  )
done
printf '%s\n' 'Both applications are installed, built and checked. No server, camera or AI session was started.'
