#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
exec ./runtime/node ./scripts/launch.mjs
