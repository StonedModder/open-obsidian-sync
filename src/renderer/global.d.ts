import type { OpenObsidianSyncApi } from "../shared/bridge";

declare global {
  interface Window {
    openObsidianSync: OpenObsidianSyncApi;
  }
}
