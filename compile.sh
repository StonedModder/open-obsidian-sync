#!/usr/bin/env bash
# Linux release build (AppImage + deb). Prefer scripts/wsl-build-linux.sh on WSL.
set -euo pipefail
cd "$(dirname "$0")"
if [ -x "$HOME/.local/node-v22/bin/npm" ]; then
  export PATH="$HOME/.local/node-v22/bin:$PATH"
fi
cd ..
command -v npm >/dev/null || { echo "npm missing — on WSL run: bash scripts/wsl-build-linux.sh"; exit 1; }
if command -v node >/dev/null && [ "$(node -p process.platform 2>/dev/null || echo linux)" != "linux" ]; then
  echo "WARNING: non-Linux Node detected; AppImage may fail. Use scripts/wsl-build-linux.sh"
fi
bash scripts/download-rclone.sh
npm install
npm run typecheck
npm test
rm -rf release/linux-unpacked release/__appImage*
npm run build:linux
ls -lah release/