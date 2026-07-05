#!/usr/bin/env bash
# Fetch rclone for the current OS/arch into resources/rclone/ (dev + electron-builder extraResources).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/resources/rclone"
mkdir -p "$DEST"

platform="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
case "$platform" in
  linux) os=linux ;;
  darwin) os=osx ;;
  *) echo "Unsupported OS: $platform" >&2; exit 1 ;;
esac
case "$arch" in
  x86_64|amd64) a=amd64 ;;
  aarch64|arm64) a=arm64 ;;
  armv7l|arm) a=arm-v7 ;;
  *) echo "Unsupported arch: $arch" >&2; exit 1 ;;
esac

zip="rclone-current-${os}-${a}.zip"
url="https://downloads.rclone.org/${zip}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $url"
curl -fsSL "$url" -o "$tmp/rclone.zip"
unzip -q "$tmp/rclone.zip" -d "$tmp/extract"
bin="$(find "$tmp/extract" -name rclone -type f | head -1)"
install -m 0755 "$bin" "$DEST/rclone"
echo "Installed $DEST/rclone"