/** Default folder on the remote where vaults are stored (not drive root). */
export const DEFAULT_REMOTE_PREFIX = "open-obsidian-sync";

const basename = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "vault";
};

/** URL-style slug from a vault display name or folder name. */
export const vaultSlugFromName = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "vault";
};

/** Suggested remote path for a new vault, e.g. open-obsidian-sync/my-vault */
export const defaultRemotePathForVault = (localPath: string, name?: string): string =>
  `${DEFAULT_REMOTE_PREFIX}/${vaultSlugFromName(name?.trim() || basename(localPath))}`;
