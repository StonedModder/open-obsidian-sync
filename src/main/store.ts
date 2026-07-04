import fs from "node:fs";
import path from "node:path";
import { defaultConflictStrategy, type ActivityEntry, type VaultConfig } from "../shared/types";
import { defaultSelectiveSync } from "./sync";

export interface StoreData {
  vaults: VaultConfig[];
  logs: ActivityEntry[];
  encryptedRcloneConfigPassword?: string;
}

const emptyStore = (): StoreData => ({
  vaults: [],
  logs: []
});

const normalizeVault = (vault: VaultConfig): VaultConfig => ({
  ...vault,
  selectiveSync: vault.selectiveSync ?? defaultSelectiveSync(),
  conflictStrategy: vault.conflictStrategy ?? defaultConflictStrategy,
  fileCount: Number.isFinite(vault.fileCount) ? vault.fileCount : 0,
  pendingChanges: Number.isFinite(vault.pendingChanges) ? vault.pendingChanges : 0
});

export class JsonStore {
  private data: StoreData = emptyStore();
  private readonly file: string;

  constructor(userDataPath: string) {
    this.file = path.join(userDataPath, "config.json");
    this.load();
  }

  get snapshot(): StoreData {
    return {
      vaults: [...this.data.vaults],
      logs: [...this.data.logs],
      encryptedRcloneConfigPassword: this.data.encryptedRcloneConfigPassword
    };
  }

  addVault(vault: VaultConfig): void {
    this.data.vaults.push(vault);
    this.save();
  }

  updateVault(vault: VaultConfig): void {
    this.data.vaults = this.data.vaults.map((item) => (item.id === vault.id ? vault : item));
    this.save();
  }

  removeVault(id: string): void {
    this.data.vaults = this.data.vaults.filter((vault) => vault.id !== id);
    this.data.logs = this.data.logs.filter((entry) => entry.vaultId !== id);
    this.save();
  }

  addLog(entry: ActivityEntry): void {
    this.data.logs = [entry, ...this.data.logs].slice(0, 600);
    this.save();
  }

  setEncryptedRcloneConfigPassword(value?: string): void {
    this.data.encryptedRcloneConfigPassword = value;
    this.save();
  }

  reload(): void {
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.file)) {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        this.save();
        return;
      }

      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<StoreData>;
      this.data = {
        vaults: Array.isArray(parsed.vaults) ? parsed.vaults.map((vault) => normalizeVault(vault as VaultConfig)) : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
        encryptedRcloneConfigPassword:
          typeof parsed.encryptedRcloneConfigPassword === "string" ? parsed.encryptedRcloneConfigPassword : undefined
      };
    } catch {
      this.data = emptyStore();
      this.save();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}
