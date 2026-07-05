#!/usr/bin/env bash
# Linux release build (AppImage + deb). Run on Linux or WSL2 with Node/npm installed.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v npm >/dev/null || { echo "npm missing"; exit 1; }
bash scripts/download-rclone.sh
npm install
npm run typecheck
npm test
rm -rf release/linux-unpacked
npm run build:linux
ls -lah release/