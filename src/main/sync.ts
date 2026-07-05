import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  defaultConflictStrategy,
  type ConflictStrategy,
  type ProviderInfo,
  type SelectiveSyncSettings,
  type VaultConfig
} from "../shared/types";

export interface SyncRunOptions {
  resync?: boolean;
  dryRun?: boolean;
}

export const defaultExcludePatterns = (includeObsidianConfig: boolean): string[] => {
  if (!includeObsidianConfig) {
    return [".obsidian/**"];
  }

  return [".obsidian/workspace.json", ".obsidian/workspace-mobile.json"];
};

export const defaultSelectiveSync = (): SelectiveSyncSettings => ({
  images: true,
  audio: true,
  videos: true,
  pdfs: true
});

export const conflictSuffix = "conflict";

const resyncModeFor = (strategy: ConflictStrategy): Exclude<ConflictStrategy, "none"> =>
  strategy === "none" ? defaultConflictStrategy : strategy;

const selectiveSyncPatterns: Record<keyof SelectiveSyncSettings, string[]> = {
  images: ["**.{bmp,png,jpg,jpeg,gif,svg,webp}"],
  audio: ["**.{mp3,wav,m4a,3gp,flac,ogg,oga,opus}"],
  videos: ["**.{mp4,webm,ogv,mov,mkv}"],
  pdfs: ["**.pdf"]
};

export const selectiveSyncExcludePatterns = (settings: SelectiveSyncSettings = defaultSelectiveSync()): string[] =>
  Object.entries(selectiveSyncPatterns).flatMap(([key, patterns]) =>
    settings[key as keyof SelectiveSyncSettings] ? [] : patterns
  );

export const normalizeRemotePath = (remotePath: string): string =>
  remotePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

export const remoteTarget = (vault: Pick<VaultConfig, "remote" | "remotePath">): string => {
  const folder = normalizeRemotePath(vault.remotePath);
  return folder ? `${vault.remote}:${folder}` : `${vault.remote}:`;
};

export const filterLinesForVault = (
  vault: Pick<VaultConfig, "includeObsidianConfig" | "excludePatterns"> & Partial<Pick<VaultConfig, "selectiveSync">>
): string[] => {
  const patterns = [
    ...defaultExcludePatterns(vault.includeObsidianConfig),
    ...selectiveSyncExcludePatterns(vault.selectiveSync ?? defaultSelectiveSync()),
    ...vault.excludePatterns
  ]
    .map((pattern) => pattern.trim())
    .filter(Boolean);

  return [...new Set(patterns)].map((pattern) => `- ${pattern}`);
};

export const writeFiltersFile = (baseDir: string, vault: VaultConfig): string | undefined => {
  const lines = filterLinesForVault(vault);
  if (lines.length === 0) return undefined;

  const filterDir = path.join(baseDir, "filters");
  fs.mkdirSync(filterDir, { recursive: true });
  const filterFile = path.join(filterDir, `${vault.id}.filter`);
  fs.writeFileSync(filterFile, `${lines.join("\n")}\n`, "utf8");
  return filterFile;
};

export const withRcloneConfig = (args: string[], configPath?: string): string[] =>
  configPath ? ["--config", configPath, ...args] : args;

export const buildBisyncArgs = (
  vault: VaultConfig,
  options: SyncRunOptions,
  filtersFile: string | undefined,
  workDir: string
): string[] => {
  const conflictStrategy = vault.conflictStrategy ?? defaultConflictStrategy;
  const args = [
    "bisync",
    vault.localPath,
    remoteTarget(vault),
    "--verbose",
    "--create-empty-src-dirs",
    "--compare",
    "size,modtime,checksum",
    "--slow-hash-sync-only",
    "--resilient",
    "--recover",
    "--max-lock",
    "2m",
    "--conflict-resolve",
    conflictStrategy,
    "--conflict-loser",
    "num",
    "--conflict-suffix",
    conflictSuffix,
    "--workdir",
    workDir
  ];

  if (filtersFile) {
    args.push("--filters-file", filtersFile, "--ignore-case");
  }

  if (options.resync) {
    args.push("--resync", "--resync-mode", resyncModeFor(conflictStrategy));
  }

  if (options.dryRun) {
    args.push("--dry-run");
  }

  return args;
};

export const runRclone = (
  executable: string,
  args: string[],
  onLine: (line: string) => void,
  configPath?: string,
  env?: NodeJS.ProcessEnv
): Promise<{ code: number; output: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, withRcloneConfig(args, configPath), {
      env: env ? { ...process.env, ...env } : process.env,
      windowsHide: true
    });
    const chunks: string[] = [];

    const handle = (data: Buffer) => {
      const text = data.toString();
      chunks.push(text);
      text.split(/\r?\n/).forEach((line) => {
        if (line.trim()) onLine(line.trim());
      });
    };

    child.stdout.on("data", handle);
    child.stderr.on("data", handle);
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output: chunks.join("") }));
  });

// Non-interactive `rclone config create`. For OAuth backends (drive, dropbox) rclone opens the
// browser itself when no token is supplied, so we do NOT pass --non-interactive for those.
const oauthBackends = new Set(["drive", "dropbox", "onedrive", "box", "pcloud", "yandex", "hidrive"]);

export const buildCreateRemoteArgs = (name: string, type: string, options: Record<string, string> = {}, oauth?: boolean, obscurePasswords?: boolean): string[] => {
  const kv = Object.entries(options).flatMap(([key, value]) => [`${key}=${value}`]);
  const args = ["config", "create", name, type, ...kv];
  const interactive = oauth ?? oauthBackends.has(type);
  if (!interactive) args.push("--non-interactive");
  if (obscurePasswords) args.push("--obscure");
  return args;
};

export const buildUpdateRemoteArgs = (name: string, options: Record<string, string>, obscurePasswords?: boolean): string[] => {
  const kv = Object.entries(options).flatMap(([key, value]) => [`${key}=${value}`]);
  const args = ["config", "update", name.replace(/:$/, ""), ...kv, "--non-interactive"];
  if (obscurePasswords) args.push("--obscure");
  return args;
};

// Parse `rclone config providers` JSON into the shape the UI's dynamic form needs.
// Pure and DOM-free so the self-check can cover it.
export const parseProviders = (jsonText: string): ProviderInfo[] =>
  (JSON.parse(jsonText) as Array<Record<string, unknown>>)
    .map((provider) => {
      const rawOptions = Array.isArray(provider.Options) ? (provider.Options as Array<Record<string, unknown>>) : [];
      return {
        name: String(provider.Name ?? ""),
        description: String(provider.Description ?? provider.Name ?? ""),
        // OAuth backends carry a `token` option; creating them without one opens the browser.
        oauth: rawOptions.some((option) => option.Name === "token" && /oauth/i.test(String(option.Help ?? ""))),
        options: rawOptions
          .filter((option) => !option.Hide)
          .map((option) => ({
            name: String(option.Name ?? ""),
            help: String(option.Help ?? "").split("\n")[0],
            required: option.Required === true,
            isPassword: option.IsPassword === true,
            sensitive: option.Sensitive === true,
            advanced: option.Advanced === true,
            defaultStr: String(option.DefaultStr ?? ""),
            exclusive: option.Exclusive === true,
            examples: Array.isArray(option.Examples)
              ? (option.Examples as Array<Record<string, unknown>>).map((example) => String(example.Value ?? ""))
              : []
          }))
      };
    })
    .filter((provider) => provider.name)
    .sort((a, b) => a.description.localeCompare(b.description));

export const buildDeleteRemoteArgs = (name: string): string[] => ["config", "delete", name];

export const obscureArgs = (secret: string): string[] => ["obscure", secret];

// crypt remote that wraps an existing `base:path`. Passwords are plain text; use --obscure on create.
export const buildCryptArgs = (name: string, baseTarget: string, password: string, password2?: string): string[] => {
  const options: Record<string, string> = { remote: baseTarget, password };
  if (password2) options.password2 = password2;
  return buildCreateRemoteArgs(name, "crypt", options, false, true);
};

// App settings live in dataDir as config.json + rclone/rclone.conf. Back both up to the remote so a
// second machine can restore the whole setup. rclone.conf may hold tokens; encrypt it with a config
// password (or back up to a crypt remote) if that matters.
const configBackupIncludes = ["--include", "/config.json", "--include", "/rclone/rclone.conf"];

export const buildBackupConfigArgs = (dataDir: string, target: string): string[] => [
  "copy",
  dataDir,
  target,
  ...configBackupIncludes,
  "--verbose"
];

export const buildRestoreConfigArgs = (target: string, dataDir: string): string[] => [
  "copy",
  target,
  dataDir,
  ...configBackupIncludes,
  "--verbose"
];

export const launchRcloneConfig = (executable: string, configPath?: string, env?: NodeJS.ProcessEnv): void => {
  const args = withRcloneConfig(["config"], configPath);

  if (process.platform === "win32") {
    const escaped = executable.replace(/'/g, "''");
    const escapedArgs = args.map((arg) => `'${arg.replace(/'/g, "''")}'`).join(" ");
    const child = spawn("powershell.exe", ["-NoExit", "-ExecutionPolicy", "Bypass", "-Command", `& '${escaped}' ${escapedArgs}`], {
      detached: true,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: "ignore",
      windowsHide: false
    });
    child.unref();
    return;
  }

  const child = spawn(executable, args, {
    detached: true,
    env: env ? { ...process.env, ...env } : process.env,
    stdio: "ignore"
  });
  child.unref();
};
