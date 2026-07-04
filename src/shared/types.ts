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
}

export interface CreateCryptInput {
  name: string;
  baseRemote: string;
  basePath: string;
  password: string;
  password2?: string;
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
  version: string;
}

export interface ApiResult<T = void> {
  ok: boolean;
  value?: T;
  error?: string;
}
