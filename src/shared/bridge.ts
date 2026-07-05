import type {
  AddScannedInput,
  AddVaultInput,
  ApiResult,
  AppState,
  BackupInput,
  CreateCryptInput,
  CreateRemoteInput,
  ProviderInfo,
  RemoteEditInfo,
  RemoteSummary,
  ScanResult,
  UpdateRemoteInput,
  VaultConfig
} from "./types";

export interface OpenObsidianSyncApi {
  getState: () => Promise<AppState>;
  onState: (callback: (state: AppState) => void) => () => void;
  chooseVault: () => Promise<ApiResult<string>>;
  scanFolder: () => Promise<ApiResult<ScanResult>>;
  addScanned: (input: AddScannedInput) => Promise<ApiResult<number>>;
  completeOnboarding: () => Promise<ApiResult>;
  resetOnboarding: () => Promise<ApiResult>;
  addVault: (input: AddVaultInput) => Promise<ApiResult<VaultConfig>>;
  updateVault: (vault: VaultConfig) => Promise<ApiResult<VaultConfig>>;
  removeVault: (vaultId: string) => Promise<ApiResult>;
  runSync: (vaultId: string, resync?: boolean) => Promise<ApiResult>;
  pauseSync: (vaultId: string, paused: boolean) => Promise<ApiResult>;
  openRcloneConfig: () => Promise<ApiResult<string>>;
  installRclone: () => Promise<ApiResult>;
  listRcloneRemotes: () => Promise<ApiResult<string[]>>;
  listRemoteSummaries: () => Promise<ApiResult<RemoteSummary[]>>;
  testRemote: (name: string) => Promise<ApiResult<string>>;
  getRemoteForEdit: (name: string) => Promise<ApiResult<RemoteEditInfo>>;
  updateRemote: (input: UpdateRemoteInput) => Promise<ApiResult<string>>;
  listProviders: () => Promise<ApiResult<ProviderInfo[]>>;
  createRemote: (input: CreateRemoteInput) => Promise<ApiResult<string>>;
  createCryptRemote: (input: CreateCryptInput) => Promise<ApiResult<string>>;
  deleteRemote: (name: string) => Promise<ApiResult>;
  backupSettings: (input: BackupInput) => Promise<ApiResult<string>>;
  restoreSettings: (input: BackupInput) => Promise<ApiResult<string>>;
  setRcloneConfigPassword: (password: string) => Promise<ApiResult>;
  clearRcloneConfigPassword: () => Promise<ApiResult>;
  exportLogs: () => Promise<ApiResult<string>>;
}
