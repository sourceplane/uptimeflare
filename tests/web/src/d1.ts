import { createRequire } from "node:module";

// A D1 binding over real SQLite (node:sqlite — D1's engine), enough of the
// D1 API for the monitor state: prepare → bind → first / run / all. Loaded
// through require: it is newer than the bundler's list of Node built-ins.
type Row = Record<string, unknown>;
interface Sqlite {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): Row[];
    get(...params: unknown[]): Row | undefined;
    run(...params: unknown[]): { changes: number | bigint };
  };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (file: string) => Sqlite;
};

// The table the migrations create (packages/db, 010_monitor_state).
export const MONITOR_STATE_DDL =
  "CREATE TABLE IF NOT EXISTS monitor_state (key VARCHAR(255) PRIMARY KEY, value BLOB NOT NULL)";

export function sqliteD1({ migrated = true } = {}) {
  const db = new DatabaseSync(":memory:");
  if (migrated) db.exec(MONITOR_STATE_DDL);
  const statements: string[] = [];
  const binding = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const run = (fn: (s: ReturnType<Sqlite["prepare"]>) => unknown) => {
        statements.push(sql);
        try {
          return fn(db.prepare(sql));
        } catch (err) {
          // D1 reports SQLite errors with this prefix.
          throw new Error(`D1_ERROR: ${err instanceof Error ? err.message : String(err)}: SQLITE_ERROR`);
        }
      };
      const stmt = {
        bind(...p: unknown[]) {
          params = p;
          return stmt;
        },
        async first<T = Row>() {
          return (run((s) => s.get(...params)) as T | undefined) ?? null;
        },
        async run() {
          const r = run((s) => s.run(...params)) as { changes: number | bigint };
          return { success: true, meta: { changes: Number(r.changes) }, results: [] };
        },
        async all<T = Row>() {
          return { success: true, results: run((s) => s.all(...params)) as T[], meta: {} };
        },
      };
      return stmt;
    },
  };
  return {
    binding: binding as unknown as D1Database,
    statements,
    stored(key = "state"): string | null {
      const row = db.prepare("SELECT value FROM monitor_state WHERE key = ?").get(key);
      return row ? String(row.value) : null;
    },
    put(key: string, value: string) {
      db.prepare("INSERT INTO monitor_state (key, value) VALUES (?, ?)").run(key, value);
    },
  };
}
