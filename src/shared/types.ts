export type Provider = "google-drive" | "dropbox" | "proton-drive" | "custom-rclone";

export type VaultStatus = "idle" | "syncing" | "synced" | "paused" | "error";

export type LogLevel = "info" | "success" | "warning" | "error";

export type ConflictStrategy = "none" | "path1" | "path2" | "newer" | "older" | "larger" | "smaller";

export const defaultConflictStrategy = "newer" satisfies ConflictStrategy;

export interface SelectiveSyncSettings {
  images: boolean;
  audio: boolean;
  videos: boolean;
  pdfs: boolean;
}

export interface VaultConfig {
  id: string;
  name: string;
  localPath: string;
  provider: Provider;
  remote: string;
  remotePath: string;
  includeObsidianConfig: boolean;
  selectiveSync: SelectiveSyncSettings;
  conflictStrategy: ConflictStrategy;
  excludePatterns: string[];
  syncIntervalMinutes: number;
  autoSync: boolean;
  paused: boolean;
  firstRunDone: boolean;
  status: VaultStatus;
  fileCount: number;
  pendingChanges: number;
  lastSyncedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddVaultInput {
  name?: string;
  localPath: string;
  provider: Provider;
  remote: string;
  remotePath: string;
  includeObsidianConfig: boolean;
  selectiveSync: SelectiveSyncSettings;
  conflictStrategy: ConflictStrategy;
  excludePatterns: string[];
  syncIntervalMinutes: number;
  autoSync: boolean;
}

export interface CreateRemoteInput {
  name: string;
  type: string;
  options?: Record<string, string>;
  // Option keys whose values must be rclone-obscured before storing (e.g. passwords).
  obscureKeys?: string[];
  // True when the backend authorizes via browser OAuth (rclone opens it if no token given).
  oauth?: boolean;
}

export interface UpdateRemoteInput {
  name: string;
  options: Record<string, string>;
  obscureKeys?: string[];
}

export interface RemoteEditInfo {
  name: string;
  type: string;
  typeLabel: string;
  publicOptions: Record<string, string>;
}

// One configurable option of an rclone backend, from `rclone config providers`.
export interface ProviderOptionInfo {
  name: string;
  help: string;
  required: boolean;
  isPassword: boolean;
  sensitive: boolean;
  advanced: boolean;
  defaultStr: string;
  exclusive: boolean;
  examples: string[];
}

export interface ProviderInfo {
  name: string;
  description: string;
  oauth: boolean;
  options: ProviderOptionInfo[];
}

// A folder found during a scan that looks like an Obsidian vault (has .obsidian/).
export interface VaultCandidate {
  path: string;
  name: string;
  alreadyAdded: boolean;
}

export interface ScanResult {
  baseDir: string;
  candidates: VaultCandidate[];
}

// Bulk-add scanned vaults sharing one remote + defaults; remote folder is auto per vault.
export interface AddScannedInput {
  paths: string[];
  provider: Provider;
  remote: string;
  remotePathPrefix: string;
  includeObsidianConfig: boolean;
  selectiveSync: SelectiveSyncSettings;
  conflictStrategy: ConflictStrategy;
  excludePatterns: string[];
  syncIntervalMinutes: number;
  autoSync: boolean;
}

export interface CreateCryptInput {
  name: string;
  baseRemote: string;
  basePath: string;
  password: string;
  password2?: string;
}

export interface RemoteVaultLink {
  vaultId: string;
  vaultName: string;
  remotePath: string;
  status: VaultStatus;
  lastSyncedAt?: string;
  lastError?: string;
}

export interface RemoteSummary {
  name: string;
  type: string;
  typeLabel: string;
  vaults: RemoteVaultLink[];
}

export interface BackupInput {
  remote: string;
  remotePath: string;
}

export interface ActivityEntry {
  id: string;
  vaultId?: string;
  level: LogLevel;
  message: string;
  detail?: string;
  createdAt: string;
}

export interface AppState {
  vaults: VaultConfig[];
  logs: ActivityEntry[];
  rclonePath: string;
  rcloneConfigPath: string;
  dataPath: string;
  portableMode: boolean;
  secureStorageAvailable: boolean;
  rcloneConfigPasswordSet: boolean;
  rcloneAvailable: boolean;
  rcloneInstalling: boolean;
  rcloneDownloadPercent?: number;
  rcloneDownloadDetail?: string;
  onboardingComplete: boolean;
  version: string;
}

export interface ApiResult<T = void> {
  ok: boolean;
  value?: T;
  error?: string;
}
