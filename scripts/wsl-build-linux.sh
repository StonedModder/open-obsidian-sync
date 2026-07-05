#!/usr/bin/env bash
# Verified WSL2 recipe: Linux Node only (Windows node.exe → AppImage EPERM on symlinks).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_DIR="${OPEN_OBSIDIAN_SYNC_NODE_DIR:-$HOME/.local/node-v22}"
NODE_VERSION="${OPEN_OBSIDIAN_SYNC_NODE_VERSION:-v22.14.0}"

ensure_linux_node() {
  if [ -x "$NODE_DIR/bin/npm" ]; then
    export PATH="$NODE_DIR/bin:$PATH"
    return 0
  fi
  if command -v node >/dev/null && [ "$(node -p process.platform)" = "linux" ]; then
    return 0
  fi
  echo "Installing portable Linux Node $NODE_VERSION to $NODE_DIR …"
  mkdir -p "$(dirname "$NODE_DIR")"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/node.tar.xz" "https://nodejs.org/dist/$NODE_VERSION/node-${NODE_VERSION}-linux-x64.tar.xz"
  tar -xJf "$tmp/node.tar.xz" -C "$tmp"
  rm -rf "$NODE_DIR"
  mv "$tmp/node-${NODE_VERSION}-linux-x64" "$NODE_DIR"
  rm -rf "$tmp"
  export PATH="$NODE_DIR/bin:$PATH"
}

ensure_linux_node
if [ "$(node -p process.platform)" != "linux" ]; then
  echo "ERROR: Need Linux Node on PATH. Set OPEN_OBSIDIAN_SYNC_NODE_DIR or install node under ~/.local/node-v22"
  exit 1
fi

cd "$ROOT"
bash scripts/download-rclone.sh
npm ci
npm test
rm -rf release/linux-unpacked release/__appImage*
npm run build:linux
ls -lah release/*.AppImage release/*.deb 2>/dev/null || ls -lah release/