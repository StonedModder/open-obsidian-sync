import path from "node:path";

export interface DataPathInput {
  appIsPackaged: boolean;
  userDataPath: string;
  env: NodeJS.ProcessEnv;
}

export const resolveDataPath = ({ appIsPackaged, userDataPath, env }: DataPathInput) => {
  if (env.OPEN_OBSIDIAN_SYNC_DATA_DIR) {
    return { dataPath: env.OPEN_OBSIDIAN_SYNC_DATA_DIR, portableMode: true };
  }

  if (appIsPackaged && env.PORTABLE_EXECUTABLE_DIR) {
    return { dataPath: path.join(env.PORTABLE_EXECUTABLE_DIR, "open-obsidian-sync-data"), portableMode: true };
  }

  return { dataPath: userDataPath, portableMode: false };
};
