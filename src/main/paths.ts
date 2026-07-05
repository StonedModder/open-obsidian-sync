import path from "node:path";

export interface DataPathInput {
  appIsPackaged: boolean;
  userDataPath: string;
  env: NodeJS.ProcessEnv;
}

// Where app data lives. Default to the OS's stable per-user app-data folder
// (Windows %APPDATA%, macOS ~/Library/Application Support, Linux ~/.config) so
// moving or updating the executable never orphans a user's vaults. An explicit
// OPEN_OBSIDIAN_SYNC_DATA_DIR still wins for portable-on-a-stick / dev use.
export const resolveDataPath = ({ userDataPath, env }: DataPathInput) => {
  if (env.OPEN_OBSIDIAN_SYNC_DATA_DIR) {
    return { dataPath: env.OPEN_OBSIDIAN_SYNC_DATA_DIR, portableMode: true };
  }
  return { dataPath: userDataPath, portableMode: false };
};

// Older builds kept data next to the portable exe. List those legacy locations
// so their config can be migrated into the new stable folder on first run.
const isWindowsStylePath = (value: string) => /^[A-Za-z]:[\\/]/.test(value) || value.includes("\\");

export const legacyDataDirs = (env: NodeJS.ProcessEnv): string[] => {
  const dirs: string[] = [];
  if (env.PORTABLE_EXECUTABLE_DIR) {
    const join = isWindowsStylePath(env.PORTABLE_EXECUTABLE_DIR) ? path.win32.join : path.join;
    dirs.push(join(env.PORTABLE_EXECUTABLE_DIR, "open-obsidian-sync-data"));
  }
  return dirs;
};
