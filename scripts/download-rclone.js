#!/usr/bin/env node
/** Download rclone for the current platform into resources/rclone/ */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const rcloneAssetName = (platform, arch) => {
  const osPart = platform === "win32" ? "windows" : platform === "darwin" ? "osx" : "linux";
  const archPart = arch === "arm64" ? "arm64" : arch === "arm" ? "arm-v7" : arch === "ia32" ? "386" : "amd64";
  return `rclone-current-${osPart}-${archPart}.zip`;
};

const binName = process.platform === "win32" ? "rclone.exe" : "rclone";
const destDir = path.join(__dirname, "..", "resources", "rclone");
const dest = path.join(destDir, binName);
const url = `https://downloads.rclone.org/${rcloneAssetName(process.platform, process.arch)}`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oos-rclone-dl-"));
const zipPath = path.join(tmp, "rclone.zip");

const curl = spawnSync("curl", ["-fsSL", url, "-o", zipPath], { stdio: "inherit" });
if (curl.status !== 0) process.exit(curl.status || 1);

fs.mkdirSync(destDir, { recursive: true });
if (process.platform === "win32") {
  spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${tmp}\\out' -Force`],
    { stdio: "inherit" }
  );
} else {
  spawnSync("tar", ["-xf", zipPath, "-C", tmp], { stdio: "inherit" });
}

const findBin = (root) => {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === binName) return full;
    }
  }
  return undefined;
};

const found = findBin(tmp);
if (!found) {
  console.error("rclone binary not found in archive");
  process.exit(1);
}
fs.copyFileSync(found, dest);
if (process.platform !== "win32") fs.chmodSync(dest, 0o755);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Installed ${dest}`);