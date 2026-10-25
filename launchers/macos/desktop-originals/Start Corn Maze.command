#!/bin/bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
exec /bin/bash "$repo_root/apps/corn-maze/Start Playground.command"
