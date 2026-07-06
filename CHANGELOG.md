# Changelog

## [0.0.3] — unreleased

### Added
- Auto-create remote folders when missing on the sync target (bisync / Proton-friendly).
- Default remote path `open-obsidian-sync/` under the configured remote root.

### Fixed
- Verify remote path after `mkdir`; touch placeholder for Proton empty-folder behavior.
- Log remote prep steps for easier bisync troubleshooting.

### Commits (since v0.0.2)
- `8ff0c3e` — Auto-create remote folders and default open-obsidian-sync/ path
- `91d9ee3` — fix: verify remote path after mkdir; touch placeholder for Proton; log prep steps
