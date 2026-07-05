import fs from "node:fs";

/** Parse `type = ...` per [section] from rclone.conf (no decryption needed for type). */
export function parseRemoteTypes(configPath: string): Record<string, string> {
  if (!fs.existsSync(configPath)) return {};
  const types: Record<string, string> = {};
  let section: string | undefined;
  for (const line of fs.readFileSync(configPath, "utf8").split(/\r?\n/)) {
    const header = line.match(/^\[([^\]]+)\]/);
    if (header) {
      section = header[1];
      continue;
    }
    if (!section) continue;
    const typeMatch = line.match(/^\s*type\s*=\s*(.+?)\s*$/i);
    if (typeMatch) types[section] = typeMatch[1].trim();
  }
  return types;
}

const SENSITIVE_OPTION = /^(password|pass|password2|2fa|otp_secret_key|mailbox_password|token|client_.*|.*_token|.*_secret.*|secret_access_key|secret_key|access_key_id)$/i;

export function isSensitiveRemoteOption(key: string): boolean {
  return SENSITIVE_OPTION.test(key);
}

/** Read key=value pairs for one remote section (values as stored in rclone.conf). */
export function parseRemoteSection(configPath: string, remoteName: string): Record<string, string> {
  if (!fs.existsSync(configPath)) return {};
  const target = remoteName.replace(/:$/, "").trim();
  const out: Record<string, string> = {};
  let section: string | undefined;
  for (const line of fs.readFileSync(configPath, "utf8").split(/\r?\n/)) {
    const header = line.match(/^\[([^\]]+)\]/);
    if (header) {
      section = header[1];
      continue;
    }
    if (section !== target) continue;
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

/** Remove matching option lines from a remote section (e.g. Proton client_* tokens after password change). */
export function removeKeysFromRemoteSection(configPath: string, remoteName: string, keyFilter: (key: string) => boolean): void {
  const target = remoteName.replace(/:$/, "").trim();
  if (!fs.existsSync(configPath)) return;
  let section: string | undefined;
  const out = fs.readFileSync(configPath, "utf8").split(/\r?\n/).filter((line) => {
    const header = line.match(/^\[([^\]]+)\]/);
    if (header) {
      section = header[1];
      return true;
    }
    if (section !== target) return true;
    const key = line.match(/^([A-Za-z0-9_]+)\s*=/)?.[1];
    if (key && keyFilter(key)) return false;
    return true;
  });
  fs.writeFileSync(configPath, `${out.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

const TYPE_LABELS: Record<string, string> = {
  drive: "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  protondrive: "Proton Drive",
  s3: "Amazon S3",
  crypt: "Encrypted layer",
  box: "Box",
  pcloud: "pCloud",
  mega: "MEGA"
};

export function remoteTypeLabel(type: string | undefined): string {
  if (!type) return "Unknown backend";
  return TYPE_LABELS[type] ?? type;
}