import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, safeStorage, shell, Tray } from "electron";
import chokidar, { type FSWatcher } from "chokidar";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildBackupConfigArgs,
  buildBisyncArgs,
  buildCreateRemoteArgs,
  buildCryptArgs,
  buildDeleteRemoteArgs,
  buildRestoreConfigArgs,
  defaultSelectiveSync,
  launchRcloneConfig,
  normalizeRemotePath,
  obscureArgs,
  remoteTarget,
  runRclone,
  writeFiltersFile
} from "./sync";
import { ensureRclone, formatBytes, resolveExistingRclone } from "./rclone-install";
import { resolveDataPath } from "./paths";
import { JsonStore } from "./store";
import {
  defaultConflictStrategy,
  type ActivityEntry,
  type AddVaultInput,
  type ApiResult,
  type AppState,
  type BackupInput,
  type CreateCryptInput,
  type CreateRemoteInput,
  type LogLevel,
  type VaultConfig
} from "../shared/types";

// Software-render for the offscreen smoke/screenshot harness — GPU capturePage
// readback can crash the Viz process in headless CI. No effect on normal launches.
if (process.env.OPEN_OBSIDIAN_SYNC_SMOKE) app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let store: JsonStore;
let rclonePath = "";
let dataPath = "";
let rcloneConfigPath = "";
let portableMode = false;
let rcloneAvailable = false;
let rcloneInstalling = false;
let rcloneDownloadPercent: number | undefined;
let rcloneDownloadDetail: string | undefined;

const watchers = new Map<string, FSWatcher>();
const intervals = new Map<string, NodeJS.Timeout>();
const debounceTimers = new Map<string, NodeJS.Timeout>();
const runningVaults = new Set<string>();

const now = () => new Date().toISOString();

const assetPath = (name: string) =>
  app.isPackaged ? path.join(process.resourcesPath, "assets", name) : path.join(app.getAppPath(), "assets", name);

const resolveRclonePath = () => {
  const exe = process.platform === "win32" ? "rclone.exe" : "rclone";
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, "rclone", exe)
    : path.join(app.getAppPath(), "resources", "rclone", exe);

  return fs.existsSync(bundled) ? bundled : exe;
};

const state = (): AppState => ({
  vaults: store.snapshot.vaults,
  logs: store.snapshot.logs,
  rclonePath,
  rcloneConfigPath,
  dataPath,
  portableMode,
  secureStorageAvailable: safeStorage.isEncryptionAvailable(),
  rcloneConfigPasswordSet: Boolean(store.snapshot.encryptedRcloneConfigPassword),
  rcloneAvailable,
  rcloneInstalling,
  rcloneDownloadPercent,
  rcloneDownloadDetail,
  version: app.getVersion()
});

const sendState = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("state:changed", state());
  }
};

const log = (level: LogLevel, message: string, vaultId?: string, detail?: string) => {
  const entry: ActivityEntry = { id: randomUUID(), level, message, vaultId, detail, createdAt: now() };
  store.addLog(entry);
  sendState();
};

const saveVault = (vault: VaultConfig) => {
  store.updateVault({ ...vault, updatedAt: now() });
  startVaultServices(vault.id);
  sendState();
};

const vaultById = (id: string) => store.snapshot.vaults.find((vault) => vault.id === id);

const readRcloneConfigPassword = () => {
  const encrypted = store.snapshot.encryptedRcloneConfigPassword;
  if (!encrypted) return undefined;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage is unavailable, so the rclone config password cannot be decrypted.");
  }

  return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
};

const rcloneEnv = (): NodeJS.ProcessEnv | undefined => {
  const password = readRcloneConfigPassword();
  return password ? { RCLONE_CONFIG_PASS: password } : undefined;
};

const validateVaultPath = (localPath: string): string | undefined => {
  if (!localPath || !fs.existsSync(localPath)) return "Folder does not exist.";
  if (!fs.statSync(localPath).isDirectory()) return "Path is not a folder.";
  if (!fs.existsSync(path.join(localPath, ".obsidian"))) return "This folder is missing a .obsidian directory.";
  return undefined;
};

const countVaultFiles = (localPath: string) => {
  let count = 0;
  const stack = [localPath];

  // ponytail: O(n) scan on add/sync; replace with indexed watcher stats only if huge vaults make it slow.
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else count += 1;
    }
  }

  return count;
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#111111",
    title: "Open Obsidian Sync",
    icon: assetPath(process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    log("error", `Renderer failed to load: ${description} (${code}) ${url}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log("error", `Renderer process gone: ${details.reason}`);
  });
  if (process.env.OPEN_OBSIDIAN_SYNC_SMOKE) {
    mainWindow.webContents.on("did-finish-load", () => {
      const delay = Number(process.env.OPEN_OBSIDIAN_SYNC_SHOT_DELAY ?? 2000);
      setTimeout(() => {
        void mainWindow?.webContents
          .executeJavaScript("document.body.innerText.replace(/\\s+/g,' ').slice(0,400)")
          .then(async (text) => {
            const ok = String(text).includes("Cloud setup");
            console.log(`SMOKE ok=${ok} text=${JSON.stringify(text)}`);
            if (process.env.OPEN_OBSIDIAN_SYNC_SHOT && mainWindow) {
              const image = await mainWindow.webContents.capturePage();
              fs.writeFileSync(process.env.OPEN_OBSIDIAN_SYNC_SHOT, image.toPNG());
              console.log(`SMOKE shot=${process.env.OPEN_OBSIDIAN_SYNC_SHOT}`);
            }
            app.quit();
          });
      }, delay);
    });
    mainWindow.webContents.on("console-message", (_e, level, message) => {
      if (level >= 2) console.log(`SMOKE renderer-console[${level}] ${message}`);
    });
  }

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
};

const createTray = () => {
  const image = nativeImage.createFromPath(assetPath("icon.png"));
  tray = new Tray(image.resize({ width: 18, height: 18 }));
  tray.setToolTip("Open Obsidian Sync");
  refreshTrayMenu();
};

const refreshTrayMenu = () => {
  if (!tray) return;

  const vaultItems = store.snapshot.vaults.slice(0, 8).map((vault) => ({
    label: `${vault.paused ? "Resume" : "Sync"} ${vault.name}`,
    click: () => {
      if (vault.paused) {
        void setPaused(vault.id, false);
      } else {
        void syncVault(vault.id, { resync: !vault.firstRunDone });
      }
    }
  }));

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open", click: () => mainWindow?.show() },
      { label: "Sync all", click: () => store.snapshot.vaults.forEach((vault) => void syncVault(vault.id, { resync: !vault.firstRunDone })) },
      { type: "separator" },
      ...vaultItems,
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ])
  );
};

const stopVaultServices = (vaultId: string) => {
  void watchers.get(vaultId)?.close();
  watchers.delete(vaultId);

  const interval = intervals.get(vaultId);
  if (interval) clearInterval(interval);
  intervals.delete(vaultId);

  const timer = debounceTimers.get(vaultId);
  if (timer) clearTimeout(timer);
  debounceTimers.delete(vaultId);
};

const startVaultServices = (vaultId: string) => {
  stopVaultServices(vaultId);
  const vault = vaultById(vaultId);
  if (!vault || vault.paused || !vault.autoSync) return;

  const watcher = chokidar.watch(vault.localPath, {
    ignoreInitial: true,
    ignored: /(^|[/\\])(\.git|node_modules)([/\\]|$)/
  });

  watcher.on("all", (_event, changedPath) => {
    if (changedPath.includes(`${path.sep}.obsidian${path.sep}workspace`)) return;
    const fresh = vaultById(vault.id);
    if (fresh) {
      store.updateVault({ ...fresh, pendingChanges: fresh.pendingChanges + 1, updatedAt: now() });
      sendState();
    }
    scheduleSync(vault.id, "Local change detected");
  });

  watchers.set(vault.id, watcher);

  if (vault.syncIntervalMinutes > 0) {
    intervals.set(
      vault.id,
      setInterval(() => scheduleSync(vault.id, "Scheduled sync"), vault.syncIntervalMinutes * 60_000)
    );
  }
};

const startAllVaultServices = () => {
  store.snapshot.vaults.forEach((vault) => startVaultServices(vault.id));
};

const scheduleSync = (vaultId: string, reason: string) => {
  const existing = debounceTimers.get(vaultId);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    vaultId,
    setTimeout(() => {
      debounceTimers.delete(vaultId);
      log("info", reason, vaultId);
      void syncVault(vaultId, { resync: false });
    }, 6_000)
  );
};

const interestingRcloneLine = (line: string) =>
  /ERROR|WARNING|NOTICE|Bisync successful|Synching|Queue|conflict|deleted|newer|new\b/i.test(line);

const syncVault = async (vaultId: string, options: { resync?: boolean }): Promise<ApiResult> => {
  const vault = vaultById(vaultId);
  if (!vault) return { ok: false, error: "Vault not found." };
  if (vault.paused) return { ok: false, error: "Vault is paused." };
  if (runningVaults.has(vaultId)) return { ok: false, error: "Sync already running." };
  if (rcloneInstalling) return { ok: false, error: "rclone is still being set up. Try again in a moment." };
  if (!rcloneAvailable) return { ok: false, error: "rclone is not available yet. Open Cloud setup to install it." };
  if (!net.isOnline()) return { ok: false, error: "Network is offline." };

  const validationError = validateVaultPath(vault.localPath);
  if (validationError) {
    saveVault({ ...vault, status: "error", lastError: validationError });
    log("error", validationError, vault.id);
    return { ok: false, error: validationError };
  }

  runningVaults.add(vaultId);
  saveVault({ ...vault, status: "syncing", lastError: undefined });

  const resync = options.resync || !vault.firstRunDone;
  const workDir = path.join(dataPath, "bisync", vault.id);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    const filters = writeFiltersFile(dataPath, vault);
    const args = buildBisyncArgs(vault, { resync }, filters, workDir);
    log("info", `${resync ? "First/resync" : "Sync"} started: ${remoteTarget(vault)}`, vault.id);

    const result = await runRclone(rclonePath, args, (line) => {
      if (interestingRcloneLine(line)) log(line.includes("ERROR") ? "error" : "info", line, vault.id);
    }, rcloneConfigPath, rcloneEnv());

    const fresh = vaultById(vaultId);
    if (!fresh) return { ok: false, error: "Vault removed during sync." };

    if (result.code === 0) {
      saveVault({
        ...fresh,
        status: "synced",
        firstRunDone: true,
        fileCount: countVaultFiles(fresh.localPath),
        pendingChanges: 0,
        lastSyncedAt: now(),
        lastError: undefined
      });
      log("success", "Sync complete", vault.id);
      return { ok: true };
    }

    const message = result.output.trim().split(/\r?\n/).slice(-4).join("\n") || `rclone exited with code ${result.code}`;
    saveVault({ ...fresh, status: "error", lastError: message });
    log("error", "Sync failed", vault.id, message);
    return { ok: false, error: message };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fresh = vaultById(vaultId) ?? vault;
    saveVault({ ...fresh, status: "error", lastError: message });
    log("error", "Sync failed", vault.id, message);
    return { ok: false, error: message };
  } finally {
    runningVaults.delete(vaultId);
    refreshTrayMenu();
  }
};

const setPaused = async (vaultId: string, paused: boolean): Promise<ApiResult> => {
  const vault = vaultById(vaultId);
  if (!vault) return { ok: false, error: "Vault not found." };

  saveVault({ ...vault, paused, status: paused ? "paused" : "idle" });
  if (paused) stopVaultServices(vaultId);
  else startVaultServices(vaultId);
  log(paused ? "warning" : "info", paused ? "Vault paused" : "Vault resumed", vaultId);
  refreshTrayMenu();
  return { ok: true };
};

const installRclone = async (): Promise<ApiResult> => {
  if (rcloneInstalling) return { ok: false, error: "rclone setup already in progress." };

  // Fast probe first — if rclone is already usable, no toast/progress flicker.
  const existing = await resolveExistingRclone(dataPath, rclonePath);
  if (existing) {
    rclonePath = existing;
    rcloneAvailable = true;
    sendState();
    return { ok: true };
  }

  rcloneInstalling = true;
  rcloneDownloadPercent = undefined;
  rcloneDownloadDetail = undefined;
  sendState();
  try {
    rclonePath = await ensureRclone({
      dataDir: dataPath,
      currentPath: rclonePath,
      onLog: (message) => log("info", message),
      onProgress: (percent, received, total) => {
        rcloneDownloadPercent = percent;
        rcloneDownloadDetail = total > 0 ? `${formatBytes(received)} / ${formatBytes(total)}` : formatBytes(received);
        sendState();
      }
    });
    rcloneAvailable = true;
    return { ok: true };
  } catch (error) {
    rcloneAvailable = false;
    const message = error instanceof Error ? error.message : String(error);
    log("error", "rclone setup failed", undefined, message);
    return { ok: false, error: message };
  } finally {
    rcloneInstalling = false;
    rcloneDownloadPercent = undefined;
    rcloneDownloadDetail = undefined;
    sendState();
  }
};

app.whenReady().then(() => {
  const resolvedData = resolveDataPath({
    appIsPackaged: app.isPackaged,
    userDataPath: app.getPath("userData"),
    env: process.env
  });
  dataPath = resolvedData.dataPath;
  portableMode = resolvedData.portableMode;
  rcloneConfigPath = path.join(dataPath, "rclone", "rclone.conf");
  fs.mkdirSync(path.dirname(rcloneConfigPath), { recursive: true });
  store = new JsonStore(dataPath);
  rclonePath = resolveRclonePath();
  createWindow();
  createTray();
  startAllVaultServices();
  log("info", "App started");
  // Auto-detect / download rclone so the user never has to install it by hand.
  void installRclone();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  [...watchers.keys()].forEach(stopVaultServices);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:get-state", (): AppState => state());

ipcMain.handle("vault:choose-folder", async (): Promise<ApiResult<string>> => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory"],
    title: "Choose an Obsidian vault"
  });

  if (result.canceled || result.filePaths.length === 0) return { ok: false, error: "No folder selected." };

  const selected = result.filePaths[0];
  const error = validateVaultPath(selected);
  return error ? { ok: false, error } : { ok: true, value: selected };
});

ipcMain.handle("vault:add", (_event, input: AddVaultInput): ApiResult<VaultConfig> => {
  const validationError = validateVaultPath(input.localPath);
  if (validationError) return { ok: false, error: validationError };
  if (!input.remote.trim()) return { ok: false, error: "Choose or enter an rclone remote." };

  const timestamp = now();
  const vault: VaultConfig = {
    id: randomUUID(),
    name: input.name?.trim() || path.basename(input.localPath),
    localPath: input.localPath,
    provider: input.provider,
    remote: input.remote.replace(/:$/, "").trim(),
    remotePath: input.remotePath.trim() || `Obsidian/${path.basename(input.localPath)}`,
    includeObsidianConfig: input.includeObsidianConfig,
    selectiveSync: input.selectiveSync ?? defaultSelectiveSync(),
    conflictStrategy: input.conflictStrategy ?? defaultConflictStrategy,
    excludePatterns: input.excludePatterns,
    syncIntervalMinutes: Math.max(1, input.syncIntervalMinutes || 10),
    autoSync: input.autoSync,
    paused: false,
    firstRunDone: false,
    status: "idle",
    fileCount: countVaultFiles(input.localPath),
    pendingChanges: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  store.addVault(vault);
  startVaultServices(vault.id);
  refreshTrayMenu();
  log("success", "Vault added", vault.id);
  sendState();
  return { ok: true, value: vault };
});

ipcMain.handle("vault:update", (_event, next: VaultConfig): ApiResult<VaultConfig> => {
  const current = vaultById(next.id);
  if (!current) return { ok: false, error: "Vault not found." };

  const validationError = validateVaultPath(next.localPath);
  if (validationError) return { ok: false, error: validationError };

  const settingsChanged =
    current.remote !== next.remote ||
    current.remotePath !== next.remotePath ||
    current.includeObsidianConfig !== next.includeObsidianConfig ||
    JSON.stringify(current.selectiveSync) !== JSON.stringify(next.selectiveSync) ||
    current.excludePatterns.join("\n") !== next.excludePatterns.join("\n");

  const vault = { ...next, firstRunDone: settingsChanged ? false : next.firstRunDone, updatedAt: now() };
  saveVault(vault);
  refreshTrayMenu();
  log("info", settingsChanged ? "Vault settings saved. Run resync once." : "Vault settings saved", vault.id);
  return { ok: true, value: vault };
});

ipcMain.handle("vault:remove", (_event, vaultId: string): ApiResult => {
  stopVaultServices(vaultId);
  store.removeVault(vaultId);
  refreshTrayMenu();
  sendState();
  return { ok: true };
});

ipcMain.handle("sync:run", (_event, vaultId: string, resync: boolean): Promise<ApiResult> => syncVault(vaultId, { resync }));

ipcMain.handle("sync:pause", (_event, vaultId: string, paused: boolean): Promise<ApiResult> => setPaused(vaultId, paused));

ipcMain.handle("rclone:install", (): Promise<ApiResult> => installRclone());

ipcMain.handle("rclone:open-config", (): ApiResult<string> => {
  try {
    launchRcloneConfig(rclonePath, rcloneConfigPath, rcloneEnv());
    log("info", "Opened rclone config");
    return { ok: true, value: rcloneConfigPath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("rclone:list-remotes", async (): Promise<ApiResult<string[]>> => {
  try {
    const result = await runRclone(rclonePath, ["listremotes"], () => undefined, rcloneConfigPath, rcloneEnv());
    // A missing config just means "no remotes yet" — not an error worth alarming the user with.
    const value = result.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.endsWith(":"))
      .map((line) => line.replace(/:$/, ""));
    if (result.code !== 0 && value.length === 0 && !/not found|no such file|using defaults/i.test(result.output)) {
      return { ok: false, error: result.output || "Unable to list remotes." };
    }
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

const runRcloneCommand = async (args: string[]): Promise<{ code: number; output: string }> =>
  runRclone(rclonePath, args, (line) => log("info", line), rcloneConfigPath, rcloneEnv());

const captureRclone = async (args: string[]): Promise<string> => {
  const chunks: string[] = [];
  const result = await runRclone(rclonePath, args, (line) => chunks.push(line), rcloneConfigPath, rcloneEnv());
  if (result.code !== 0) throw new Error(result.output.trim() || `rclone exited with code ${result.code}`);
  return result.output.trim() || chunks.join("").trim();
};

ipcMain.handle("rclone:create-remote", async (_event, input: CreateRemoteInput): Promise<ApiResult<string>> => {
  try {
    if (!input.name.trim() || !input.type.trim()) return { ok: false, error: "Remote name and type are required." };
    const name = input.name.replace(/:$/, "").trim();
    log("info", `Creating remote "${name}" (${input.type}). A browser may open to authorize.`);
    const result = await runRcloneCommand(buildCreateRemoteArgs(name, input.type.trim(), input.options ?? {}));
    if (result.code !== 0) return { ok: false, error: result.output.trim() || "rclone could not create the remote." };
    log("success", `Remote "${name}" created`);
    sendState();
    return { ok: true, value: name };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("rclone:create-crypt", async (_event, input: CreateCryptInput): Promise<ApiResult<string>> => {
  try {
    const name = input.name.replace(/:$/, "").trim();
    const base = input.baseRemote.replace(/:$/, "").trim();
    if (!name || !base || !input.password) return { ok: false, error: "Crypt name, base remote, and password are required." };

    const folder = normalizeRemotePath(input.basePath);
    const baseTarget = folder ? `${base}:${folder}` : `${base}:`;
    const password = await captureRclone(obscureArgs(input.password));
    const password2 = input.password2 ? await captureRclone(obscureArgs(input.password2)) : undefined;

    log("info", `Creating encrypted remote "${name}" over ${baseTarget}`);
    const result = await runRcloneCommand(buildCryptArgs(name, baseTarget, password, password2));
    if (result.code !== 0) return { ok: false, error: result.output.trim() || "rclone could not create the crypt remote." };
    log("success", `Encrypted remote "${name}" created`);
    sendState();
    return { ok: true, value: name };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("rclone:delete-remote", async (_event, name: string): Promise<ApiResult> => {
  try {
    const result = await runRcloneCommand(buildDeleteRemoteArgs(name.replace(/:$/, "").trim()));
    if (result.code !== 0) return { ok: false, error: result.output.trim() || "rclone could not delete the remote." };
    log("warning", `Remote "${name}" deleted`);
    sendState();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

const backupTarget = (input: BackupInput): string => {
  const folder = normalizeRemotePath(input.remotePath) || "OpenObsidianSync/settings-backup";
  return `${input.remote.replace(/:$/, "").trim()}:${folder}`;
};

ipcMain.handle("rclone:backup-settings", async (_event, input: BackupInput): Promise<ApiResult<string>> => {
  try {
    if (!input.remote.trim()) return { ok: false, error: "Choose a remote to back up to." };
    const target = backupTarget(input);
    log("info", `Backing up settings to ${target}`);
    const result = await runRcloneCommand(buildBackupConfigArgs(dataPath, target));
    if (result.code !== 0) return { ok: false, error: result.output.trim() || "Settings backup failed." };
    log("success", `Settings backed up to ${target}`);
    return { ok: true, value: target };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("rclone:restore-settings", async (_event, input: BackupInput): Promise<ApiResult<string>> => {
  try {
    if (!input.remote.trim()) return { ok: false, error: "Choose a remote to restore from." };
    const target = backupTarget(input);
    log("info", `Restoring settings from ${target}`);
    const result = await runRcloneCommand(buildRestoreConfigArgs(target, dataPath));
    if (result.code !== 0) return { ok: false, error: result.output.trim() || "Settings restore failed." };

    store.reload();
    [...watchers.keys()].forEach(stopVaultServices);
    startAllVaultServices();
    refreshTrayMenu();
    log("success", `Settings restored from ${target}. Existing vaults reloaded.`);
    sendState();
    return { ok: true, value: target };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("rclone:set-config-password", (_event, password: string): ApiResult => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: "Secure storage is unavailable on this system." };
    if (!password) return { ok: false, error: "Enter the rclone config password first." };

    store.setEncryptedRcloneConfigPassword(safeStorage.encryptString(password).toString("base64"));
    log("success", "Saved encrypted rclone config password");
    sendState();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("rclone:clear-config-password", (): ApiResult => {
  store.setEncryptedRcloneConfigPassword(undefined);
  log("warning", "Cleared saved rclone config password");
  sendState();
  return { ok: true };
});

ipcMain.handle("logs:export", async (): Promise<ApiResult<string>> => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "Export sync log",
    defaultPath: "open-obsidian-sync-log.json",
    filters: [{ name: "JSON", extensions: ["json"] }]
  });

  if (result.canceled || !result.filePath) return { ok: false, error: "Export canceled." };

  fs.writeFileSync(result.filePath, JSON.stringify(store.snapshot.logs, null, 2));
  await shell.showItemInFolder(result.filePath);
  return { ok: true, value: result.filePath };
});
