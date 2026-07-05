const assert = require("node:assert/strict");
const { resolveDataPath, legacyDataDirs } = require("../dist/main/paths");
const {
  buildBackupConfigArgs,
  buildBisyncArgs,
  buildCreateRemoteArgs,
  buildMkdirArgs,
  defaultRemotePathForVault,
  remotePathSegmentsToCreate,
  buildCryptArgs,
  buildDeleteRemoteArgs,
  buildRestoreConfigArgs,
  buildUpdateRemoteArgs,
  conflictSuffix,
  defaultSelectiveSync,
  filterLinesForVault,
  obscureArgs,
  parseProviders,
  remoteTarget,
  selectiveSyncExcludePatterns,
  withRcloneConfig
} = require("../dist/main/sync");
const { defaultConflictStrategy } = require("../dist/shared/types");
const { DEFAULT_REMOTE_PREFIX } = require("../dist/shared/remote-paths");
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

// Portable exe now uses the stable per-OS userData dir, NOT a folder next to the exe.
assert.deepEqual(
  resolveDataPath({ appIsPackaged: true, userDataPath: "C:\\Users\\me\\AppData\\oos", env: { PORTABLE_EXECUTABLE_DIR: "D:\\SyncApp" } }),
  { dataPath: "C:\\Users\\me\\AppData\\oos", portableMode: false }
);
// Explicit override still wins (portable-on-a-stick / dev).
assert.deepEqual(
  resolveDataPath({ appIsPackaged: true, userDataPath: "C:\\x", env: { OPEN_OBSIDIAN_SYNC_DATA_DIR: "E:\\custom" } }),
  { dataPath: "E:\\custom", portableMode: true }
);
assert.deepEqual(
  resolveDataPath({ appIsPackaged: false, userDataPath: "C:\\Users\\me\\AppData", env: {} }),
  { dataPath: "C:\\Users\\me\\AppData", portableMode: false }
);
// Legacy next-to-exe dir is listed for one-time migration.
assert.deepEqual(legacyDataDirs({ PORTABLE_EXECUTABLE_DIR: "D:\\SyncApp" }), ["D:\\SyncApp\\open-obsidian-sync-data"]);
assert.deepEqual(legacyDataDirs({}), []);

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
assert.deepEqual(cryptArgs, ["config", "create", "secure", "crypt", "remote=gdrive:Vault", "password=OBS1", "password2=OBS2", "--non-interactive", "--obscure"]);
assert.deepEqual(buildCryptArgs("secure", "gdrive:Vault", "OBS1"), [
  "config",
  "create",
  "secure",
  "crypt",
  "remote=gdrive:Vault",
  "password=OBS1",
  "--non-interactive",
  "--obscure"
]);
assert.deepEqual(buildCreateRemoteArgs("proton", "protondrive", { password: "x" }, false, true), [
  "config",
  "create",
  "proton",
  "protondrive",
  "password=x",
  "--non-interactive",
  "--obscure"
]);
assert.deepEqual(buildUpdateRemoteArgs("proton", { password: "new", username: "me@pm.me" }, true), [
  "config",
  "update",
  "proton",
  "password=new",
  "username=me@pm.me",
  "--non-interactive",
  "--obscure"
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

// Explicit oauth flag overrides the built-in backend set.
assert(!buildCreateRemoteArgs("m", "mega", {}, true).includes("--non-interactive"));
assert(buildCreateRemoteArgs("m", "mega", {}, false).includes("--non-interactive"));
assert(buildCreateRemoteArgs("m", "mega", {}).includes("--non-interactive")); // unknown backend defaults non-interactive
assert(!buildCreateRemoteArgs("g", "drive", {}).includes("--non-interactive")); // known oauth backend

// parseProviders maps rclone's `config providers` JSON to the UI shape.
const providers = parseProviders(
  JSON.stringify([
    {
      Name: "mega",
      Description: "Mega",
      Options: [
        { Name: "user", Help: "User name.", Required: true, IsPassword: false, Advanced: false, DefaultStr: "", Examples: null },
        { Name: "pass", Help: "Password.", Required: true, IsPassword: true, Advanced: false, DefaultStr: "" },
        { Name: "debug", Help: "Debug.", Advanced: true, DefaultStr: "false" },
        { Name: "hidden", Help: "Hidden.", Hide: 1 }
      ]
    },
    {
      Name: "box",
      Description: "Box",
      Options: [
        { Name: "token", Help: "OAuth Access Token as a JSON blob.", Advanced: false },
        { Name: "box_sub_type", Help: "Sub type.", Advanced: false, Exclusive: true, Examples: [{ Value: "user" }, { Value: "enterprise" }], DefaultStr: "user" }
      ]
    }
  ])
);
assert.equal(providers.length, 2);
const mega = providers.find((p) => p.name === "mega");
assert.equal(mega.oauth, false);
assert.equal(mega.options.length, 3); // hidden filtered out
assert.equal(mega.options.find((o) => o.name === "pass").isPassword, true);
assert.equal(mega.options.find((o) => o.name === "debug").advanced, true);
const box = providers.find((p) => p.name === "box");
assert.equal(box.oauth, true);
assert.deepEqual(box.options.find((o) => o.name === "box_sub_type").examples, ["user", "enterprise"]);
assert.equal(box.options.find((o) => o.name === "box_sub_type").exclusive, true);


assert.deepEqual(remotePathSegmentsToCreate("open-obsidian-sync/ps-sdk"), ["open-obsidian-sync", "open-obsidian-sync/ps-sdk"]);
assert.deepEqual(buildMkdirArgs("proton", "open-obsidian-sync/ps-sdk"), ["mkdir", "proton:open-obsidian-sync/ps-sdk"]);
assert.deepEqual(buildMkdirArgs("proton:", "Obsidian/ps-sdk"), ["mkdir", "proton:Obsidian/ps-sdk"]);
assert.equal(defaultRemotePathForVault("C:\Vaults\PS SDK", "PS SDK"), "open-obsidian-sync/ps-sdk");
assert.equal(DEFAULT_REMOTE_PREFIX, "open-obsidian-sync");

console.log("sync self-check passed");
