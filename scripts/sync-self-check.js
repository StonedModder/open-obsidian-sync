const assert = require("node:assert/strict");
const { resolveDataPath } = require("../dist/main/paths");
const {
  buildBackupConfigArgs,
  buildBisyncArgs,
  buildCreateRemoteArgs,
  buildCryptArgs,
  buildDeleteRemoteArgs,
  buildRestoreConfigArgs,
  conflictSuffix,
  defaultSelectiveSync,
  filterLinesForVault,
  obscureArgs,
  remoteTarget,
  selectiveSyncExcludePatterns,
  withRcloneConfig
} = require("../dist/main/sync");
const { defaultConflictStrategy } = require("../dist/shared/types");
const { rcloneAssetName, rcloneDownloadUrl, rcloneBinaryName } = require("../dist/main/rclone-install");

const vault = {
  id: "test",
  name: "Notes",
  localPath: "C:\\Vaults\\Notes",
  provider: "google-drive",
  remote: "gdrive",
  remotePath: "Obsidian/Notes",
  includeObsidianConfig: true,
  selectiveSync: defaultSelectiveSync(),
  conflictStrategy: defaultConflictStrategy,
  excludePatterns: [".trash/**"],
  syncIntervalMinutes: 10,
  autoSync: true,
  paused: false,
  firstRunDone: false,
  status: "idle",
  fileCount: 0,
  pendingChanges: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

assert.equal(remoteTarget(vault), "gdrive:Obsidian/Notes");
assert.deepEqual(filterLinesForVault(vault), ["- .obsidian/workspace.json", "- .obsidian/workspace-mobile.json", "- .trash/**"]);
assert.deepEqual(selectiveSyncExcludePatterns({ images: false, audio: true, videos: false, pdfs: true }), [
  "**.{bmp,png,jpg,jpeg,gif,svg,webp}",
  "**.{mp4,webm,ogv,mov,mkv}"
]);

const args = buildBisyncArgs(vault, { resync: true }, "filters.txt", "workdir");
assert(args.includes("bisync"));
assert(args.includes("--resync"));
assert(args.includes("--resync-mode"));
assert(args.includes("--conflict-resolve"));
assert.equal(args[args.indexOf("--conflict-resolve") + 1], defaultConflictStrategy);
assert.equal(args[args.indexOf("--conflict-loser") + 1], "num");
assert.equal(args[args.indexOf("--conflict-suffix") + 1], conflictSuffix);
assert(args.includes("--filters-file"));
assert(!args.includes("--filter-from"));
assert(args.includes("--ignore-case"));
assert.deepEqual(withRcloneConfig(["listremotes"], "C:\\App\\rclone.conf"), ["--config", "C:\\App\\rclone.conf", "listremotes"]);

assert.deepEqual(
  resolveDataPath({ appIsPackaged: true, userDataPath: "C:\\Users\\me\\AppData", env: { PORTABLE_EXECUTABLE_DIR: "D:\\SyncApp" } }),
  { dataPath: "D:\\SyncApp\\open-obsidian-sync-data", portableMode: true }
);
assert.deepEqual(
  resolveDataPath({ appIsPackaged: false, userDataPath: "C:\\Users\\me\\AppData", env: {} }),
  { dataPath: "C:\\Users\\me\\AppData", portableMode: false }
);

// OAuth backend: no --non-interactive so rclone can open the browser.
assert.deepEqual(buildCreateRemoteArgs("gdrive", "drive"), ["config", "create", "gdrive", "drive"]);
// Non-oauth backend gets --non-interactive and key=value options.
assert.deepEqual(buildCreateRemoteArgs("proton", "protondrive", { username: "me" }), [
  "config",
  "create",
  "proton",
  "protondrive",
  "username=me",
  "--non-interactive"
]);
assert.deepEqual(obscureArgs("hunter2"), ["obscure", "hunter2"]);
const cryptArgs = buildCryptArgs("secure", "gdrive:Vault", "OBS1", "OBS2");
assert.deepEqual(cryptArgs, ["config", "create", "secure", "crypt", "remote=gdrive:Vault", "password=OBS1", "password2=OBS2", "--non-interactive"]);
assert.deepEqual(buildCryptArgs("secure", "gdrive:Vault", "OBS1"), [
  "config",
  "create",
  "secure",
  "crypt",
  "remote=gdrive:Vault",
  "password=OBS1",
  "--non-interactive"
]);
assert.deepEqual(buildDeleteRemoteArgs("gdrive"), ["config", "delete", "gdrive"]);
const backup = buildBackupConfigArgs("C:\\Data", "gdrive:backup");
assert.equal(backup[0], "copy");
assert.equal(backup[1], "C:\\Data");
assert.equal(backup[2], "gdrive:backup");
assert(backup.includes("/config.json"));
assert(backup.includes("/rclone/rclone.conf"));
const restore = buildRestoreConfigArgs("gdrive:backup", "C:\\Data");
assert.equal(restore[1], "gdrive:backup");
assert.equal(restore[2], "C:\\Data");

// rclone auto-install URL/name mapping
assert.equal(rcloneAssetName("win32", "x64"), "rclone-current-windows-amd64.zip");
assert.equal(rcloneAssetName("win32", "arm64"), "rclone-current-windows-arm64.zip");
assert.equal(rcloneAssetName("darwin", "arm64"), "rclone-current-osx-arm64.zip");
assert.equal(rcloneAssetName("darwin", "x64"), "rclone-current-osx-amd64.zip");
assert.equal(rcloneAssetName("linux", "arm"), "rclone-current-linux-arm-v7.zip");
assert.equal(rcloneAssetName("linux", "x64"), "rclone-current-linux-amd64.zip");
assert.equal(rcloneDownloadUrl("linux", "x64"), "https://downloads.rclone.org/rclone-current-linux-amd64.zip");
assert.equal(rcloneBinaryName("win32"), "rclone.exe");
assert.equal(rcloneBinaryName("linux"), "rclone");

console.log("sync self-check passed");
