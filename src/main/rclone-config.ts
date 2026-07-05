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