import type { MigrationManifest } from "./types.js";

// Every migration the runner applies, in order, with the sha256 of its file.
// `pnpm --filter @saas/db run manifest:check` verifies the checksums;
// `manifest:fix` rewrites them after a migration file changes (only ever
// before that migration has been applied anywhere — an applied migration's
// checksum is immutable).
export const manifest: MigrationManifest = {
  version: 1,
  migrations: [
    {
      id: "000_control_baseline",
      context: "control",
      path: "000_control/up.sql",
      checksum:
        "c7f11499fa82d6fd2baa1af7fc75eeb73cd7be252af2e56841509c66001d638b",
      description:
        "Baseline control migration — creates the migration tracking schema",
    },
    {
      id: "010_monitor_state",
      context: "app",
      path: "010_monitor_state/up.sql",
      checksum:
        "5cf8e28cb73b4a05ac12776ff20a6aed4741a45256062aa4046ffa49bd673d8b",
      description:
        "The monitor_state table — key VARCHAR(255) PRIMARY KEY, value BLOB NOT NULL — upstream's init.sql, under a name that survives a rebrand",
    },
  ],
};
