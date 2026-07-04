# Goal: App must launch and every page/panel work without error

Aim: Open Obsidian Sync — Electron desktop app, in-app rclone setup, encryption, backup/restore, vault bisync. Must actually run.

## Checklist

- [x] **G1 — Renderer loads (no blank window).** Vite `base: "./"` → `file://` finds bundle assets.
- [x] **G2 — Typecheck clean.** `npm run typecheck` passes.
- [x] **G3 — Self-check passes.** `npm test` → "sync self-check passed".
- [x] **G4 — Full build clean.** `npm run build` OK.
- [x] **G5 — App launches, main window shows UI** (not blank), no renderer errors.
- [x] **G6 — Left panel renders**: vault list + Cloud setup (Remotes/Encrypt/Backup tabs).
- [x] **G7 — Add-vault panel + empty state render** without runtime error.
- [x] **G8 — IPC wired**: getState resolved (config path + vault count shown in smoke output).
- [x] **G9 — rclone binary resolves**: `resources/rclone/rclone.exe` present (78 MB).

## Notes / findings
- G1 (root cause): `index.html` built with `/assets/...` absolute refs → blank under file://. Fixed with `base: "./"` in vite.config.ts.
- G5 hardening: added CSP meta (silences Electron insecure-CSP warning) + `did-fail-load`/`render-process-gone` logging in main.
- Smoke harness: `OPEN_OBSIDIAN_SYNC_SMOKE=1 npx electron .` prints rendered UI text and quits. Final run: `ok=true`, full UI (Cloud setup, tabs, provider dropdown, empty state) present.

## STATUS: COMPLETE — app launches and all pages render without error.
