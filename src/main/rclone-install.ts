import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { net } from "electron";

// ---- pure URL/name helpers (unit-tested in sync-self-check) ----

// Map Node platform/arch to rclone's release asset naming.
export const rcloneAssetName = (platform: NodeJS.Platform, arch: string): string => {
  const osPart = platform === "win32" ? "windows" : platform === "darwin" ? "osx" : "linux";
  const archPart = arch === "arm64" ? "arm64" : arch === "arm" ? "arm-v7" : arch === "ia32" ? "386" : "amd64";
  return `rclone-current-${osPart}-${archPart}.zip`;
};

export const rcloneDownloadUrl = (platform: NodeJS.Platform, arch: string): string =>
  `https://downloads.rclone.org/${rcloneAssetName(platform, arch)}`;

export const rcloneBinaryName = (platform: NodeJS.Platform): string => (platform === "win32" ? "rclone.exe" : "rclone");

// ---- runtime install ----

export interface EnsureRcloneOptions {
  dataDir: string;
  currentPath: string;
  onLog: (message: string) => void;
  onProgress?: (percent: number, receivedBytes: number, totalBytes: number) => void;
}

export const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
};

const runVersion = (executable: string): Promise<boolean> =>
  new Promise((resolve) => {
    try {
      const child = spawn(executable, ["version"], { windowsHide: true });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });

const downloadFile = (
  url: string,
  dest: string,
  onProgress?: (percent: number, received: number, total: number) => void
): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = net.request(url); // electron net follows redirects automatically
    request.on("response", (response) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        reject(new Error(`Download failed: HTTP ${status}`));
        return;
      }
      const total = Number(response.headers["content-length"] ?? 0);
      let received = 0;
      const out = fs.createWriteStream(dest);
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        out.write(chunk);
        if (onProgress) onProgress(total > 0 ? Math.round((received / total) * 100) : 0, received, total);
      });
      response.on("end", () => out.end(() => resolve()));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });

const extractZip = (zipPath: string, destDir: string): Promise<void> =>
  new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    const [cmd, args] =
      process.platform === "win32"
        ? ["powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`]]
        : // tar (libarchive) reads zips on modern macOS and Linux; no extra dependency.
          ["tar", ["-xf", zipPath, "-C", destDir]];
    const child = spawn(cmd as string, args as string[], { windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Extraction failed (code ${code})`))));
  });

const findBinary = (root: string, name: string): string | undefined => {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === name) return full;
    }
  }
  return undefined;
};

// Fast, network-free probe: is a working rclone already available (previously
// downloaded copy, bundled binary, or PATH)? Returns its path or undefined.
export const resolveExistingRclone = async (dataDir: string, currentPath: string): Promise<string | undefined> => {
  const installedPath = path.join(dataDir, "bin", rcloneBinaryName(process.platform));
  if (fs.existsSync(installedPath) && (await runVersion(installedPath))) return installedPath;
  if (await runVersion(currentPath)) return currentPath;
  return undefined;
};

// Returns a working rclone path. Downloads + extracts rclone if the current path
// (bundled binary or PATH lookup) does not run. Idempotent: a previously
// downloaded binary is reused without hitting the network.
export const ensureRclone = async ({ dataDir, currentPath, onLog, onProgress }: EnsureRcloneOptions): Promise<string> => {
  const binName = rcloneBinaryName(process.platform);
  const installedPath = path.join(dataDir, "bin", binName);

  const existing = await resolveExistingRclone(dataDir, currentPath);
  if (existing) return existing;

  const url = rcloneDownloadUrl(process.platform, process.arch);
  onLog(`rclone engine not found. Fetching ${rcloneAssetName(process.platform, process.arch)} from downloads.rclone.org…`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oos-rclone-"));
  const zipPath = path.join(tmp, "rclone.zip");

  try {
    let lastLoggedTenth = -1;
    await downloadFile(url, zipPath, (percent, received, total) => {
      onProgress?.(percent, received, total);
      // Verbose but not spammy: one log line per 10% crossed.
      const tenth = Math.floor(percent / 10);
      if (tenth !== lastLoggedTenth && total > 0) {
        lastLoggedTenth = tenth;
        onLog(`Downloading rclone… ${percent}% (${formatBytes(received)} / ${formatBytes(total)})`);
      }
    });
    onLog("Download complete. Extracting archive…");
    await extractZip(zipPath, tmp);

    const found = findBinary(tmp, binName);
    if (!found) throw new Error("rclone binary was not found in the downloaded archive.");
    onLog(`Extracted ${binName} (${formatBytes(fs.statSync(found).size)}). Installing…`);

    fs.mkdirSync(path.dirname(installedPath), { recursive: true });
    fs.copyFileSync(found, installedPath);
    if (process.platform !== "win32") fs.chmodSync(installedPath, 0o755);

    onLog("Verifying rclone binary…");
    if (!(await runVersion(installedPath))) throw new Error("Downloaded rclone did not run.");
    onLog(`rclone ready at ${installedPath}`);
    return installedPath;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};
