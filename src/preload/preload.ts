import { contextBridge, ipcRenderer } from "electron";
import type { OpenObsidianSyncApi } from "../shared/bridge";
import type {
  AddScannedInput,
  AddVaultInput,
  ApiResult,
  AppState,
  BackupInput,
  CreateCryptInput,
  CreateRemoteInput,
  ProviderInfo,
  RemoteSummary,
  ScanResult,
  VaultConfig
} from "../shared/types";

const api: OpenObsidianSyncApi = {
  getState: (): Promise<AppState> => ipcRenderer.invoke("app:get-state"),
  onState: (callback: (state: AppState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
  chooseVault: (): Promise<ApiResult<string>> => ipcRenderer.invoke("vault:choose-folder"),
  scanFolder: (): Promise<ApiResult<ScanResult>> => ipcRenderer.invoke("vault:scan-folder"),
  addScanned: (input: AddScannedInput): Promise<ApiResult<number>> => ipcRenderer.invoke("vault:add-scanned", input),
  completeOnboarding: (): Promise<ApiResult> => ipcRenderer.invoke("app:complete-onboarding"),
  resetOnboarding: (): Promise<ApiResult> => ipcRenderer.invoke("app:reset-onboarding"),
  addVault: (input: AddVaultInput): Promise<ApiResult<VaultConfig>> => ipcRenderer.invoke("vault:add", input),
  updateVault: (vault: VaultConfig): Promise<ApiResult<VaultConfig>> => ipcRenderer.invoke("vault:update", vault),
  removeVault: (vaultId: string): Promise<ApiResult> => ipcRenderer.invoke("vault:remove", vaultId),
  runSync: (vaultId: string, resync = false): Promise<ApiResult> => ipcRenderer.invoke("sync:run", vaultId, resync),
  pauseSync: (vaultId: string, paused: boolean): Promise<ApiResult> => ipcRenderer.invoke("sync:pause", vaultId, paused),
  openRcloneConfig: (): Promise<ApiResult<string>> => ipcRenderer.invoke("rclone:open-config"),
  installRclone: (): Promise<ApiResult> => ipcRenderer.invoke("rclone:install"),
  listRcloneRemotes: (): Promise<ApiResult<string[]>> => ipcRenderer.invoke("rclone:list-remotes"),
  listRemoteSummaries: (): Promise<ApiResult<RemoteSummary[]>> => ipcRenderer.invoke("rclone:list-remote-summaries"),
  testRemote: (name: string): Promise<ApiResult<string>> => ipcRenderer.invoke("rclone:test-remote", name),
  listProviders: (): Promise<ApiResult<ProviderInfo[]>> => ipcRenderer.invoke("rclone:list-providers"),
  createRemote: (input: CreateRemoteInput): Promise<ApiResult<string>> => ipcRenderer.invoke("rclone:create-remote", input),
  createCryptRemote: (input: CreateCryptInput): Promise<ApiResult<string>> => ipcRenderer.invoke("rclone:create-crypt", input),
  deleteRemote: (name: string): Promise<ApiResult> => ipcRenderer.invoke("rclone:delete-remote", name),
  backupSettings: (input: BackupInput): Promise<ApiResult<string>> => ipcRenderer.invoke("rclone:backup-settings", input),
  restoreSettings: (input: BackupInput): Promise<ApiResult<string>> => ipcRenderer.invoke("rclone:restore-settings", input),
  setRcloneConfigPassword: (password: string): Promise<ApiResult> => ipcRenderer.invoke("rclone:set-config-password", password),
  clearRcloneConfigPassword: (): Promise<ApiResult> => ipcRenderer.invoke("rclone:clear-config-password"),
  exportLogs: (): Promise<ApiResult<string>> => ipcRenderer.invoke("logs:export")
};

contextBridge.exposeInMainWorld("openObsidianSync", api);
