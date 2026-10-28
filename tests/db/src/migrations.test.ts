import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { manifest } from "@saas/db/manifest";
import { D1ApiAdapter, loadD1CredentialsFromEnv, runMigrations } from "@saas/db/runner";
import type { MigrationManifest } from "@saas/db/types";

const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");

// node:sqlite is real SQLite — D1's engine — so the migrations run here
// against the database semantics they meet in production. Loaded through
// require: it is newer than the bundler's list of Node built-ins.
type Row = Record<string, unknown>;
interface Sqlite {
  prepare(sql: string): { all(...params: unknown[]): Row[] };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (file: string) => Sqlite;
};

// A stand-in for D1's REST API (`POST …/d1/database/{id}/query`, one statement
// per call, `{ sql, params }` in, `{ success, result: [{ results }] }` out),
// over a real SQLite database: the adapter is exercised through the same
// request and response shapes the db-migrate lane sends to Cloudflare.
function fakeD1(db: Sqlite) {
  const requests: { url: string; auth: string | null; sql: string }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const { sql, params } = JSON.parse(String(init?.body)) as { sql: string; params: unknown[] };
    requests.push({ url: String(input), auth: new Headers(init?.headers).get("authorization"), sql });
    try {
      const results = db.prepare(sql).all(...params);
      return new Response(JSON.stringify({ success: true, result: [{ results, success: true }] }), { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ success: false, errors: [{ code: 7500, message }] }), { status: 400 });
    }
  }) as typeof fetch;
  return { fetchImpl, requests };
}

function tables(db: Sqlite): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => String(r.name));
}

describe("the migration manifest (packages/db)", () => {
  it("starts with the control migration, in id order, and names every file with its checksum", () => {
    const ids = manifest.migrations.map((m) => m.id);
    expect(ids[0]).toBe("000_control_baseline");
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of manifest.migrations) {
      const file = readFileSync(path.join(migrationsDir, entry.path));
      expect(createHash("sha256").update(file).digest("hex"), entry.id).toBe(entry.checksum);
    }
  });

  it("creates upstream's key/value table, under its own name, idempotently", () => {
    const sql = readFileSync(path.join(migrationsDir, "010_monitor_state/up.sql"), "utf8");
    expect(sql.replace(/\s+/g, " ")).toContain(
      "CREATE TABLE IF NOT EXISTS monitor_state ( key VARCHAR(255) PRIMARY KEY, value BLOB NOT NULL );",
    );
  });

  it("plans every migration as pending offline (a pull request's plan profile)", async () => {
    const result = await runMigrations(manifest, { mode: "plan", migrationsDir, adapter: null });
    expect(result.failed).toBeNull();
    expect(result.applied).toEqual(manifest.migrations.map((m) => m.id));
  });

  it("refuses a file that no longer matches its checksum, even offline", async () => {
    const tampered: MigrationManifest = {
      version: 1,
      migrations: manifest.migrations.map((m, i) => (i === 1 ? { ...m, checksum: "0".repeat(64) } : m)),
    };
    await expect(runMigrations(tampered, { mode: "plan", migrationsDir, adapter: null })).rejects.toThrow(
      /Checksum mismatch for 010_monitor_state/,
    );
  });
});

describe("db-migrate apply, over the D1 REST API, into real SQLite", () => {
  let db: Sqlite;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
  });

  it("creates the schema the page reads and writes, and records what it applied", async () => {
    const { fetchImpl, requests } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    const result = await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    expect(result.failed).toBeNull();
    expect(result.applied).toEqual(["000_control_baseline", "010_monitor_state"]);
    expect(tables(db)).toEqual(["_migrations_applied", "_migrations_lock", "monitor_state"]);
    expect(db.prepare("SELECT id FROM _migrations_applied ORDER BY id").all().map((r) => r.id)).toEqual([
      "000_control_baseline",
      "010_monitor_state",
    ]);
    // The lock is released, and every call was the account's database with the token.
    expect(db.prepare("SELECT * FROM _migrations_lock").all()).toEqual([]);
    expect(new Set(requests.map((r) => r.url))).toEqual(
      new Set(["https://api.cloudflare.com/client/v4/accounts/acct/d1/database/db-id/query"]),
    );
    expect(new Set(requests.map((r) => r.auth))).toEqual(new Set(["Bearer token"]));

    // The checker's and the page's own statements (apps/web/monitor/store.ts)
    // on that schema: the upsert the checker writes the state with, twice, and
    // the read the page and the API make.
    const upsert =
      "INSERT INTO monitor_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;";
    db.prepare(upsert).all("state", '{"lastUpdate":1}');
    db.prepare(upsert).all("state", '{"lastUpdate":2}');
    expect(db.prepare("SELECT value FROM monitor_state WHERE key = ?").all("state").map((r) => r.value)).toEqual([
      '{"lastUpdate":2}',
    ]);
  });

  it("applies nothing twice: a second run skips what the ledger recorded", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    db.prepare("INSERT INTO monitor_state (key, value) VALUES (?, ?)").all("state", "kept");
    const again = await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    expect(again.applied).toEqual([]);
    expect(again.skipped).toEqual(["000_control_baseline", "010_monitor_state"]);
    expect(db.prepare("SELECT value FROM monitor_state").all().map((r) => r.value)).toEqual(["kept"]);
  });

  it("takes a table a hand-run init (the app's old init.sql) created as already there", async () => {
    db.prepare("CREATE TABLE monitor_state (key VARCHAR(255) PRIMARY KEY, value BLOB NOT NULL)").all();
    db.prepare("INSERT INTO monitor_state (key, value) VALUES (?, ?)").all("state", "from before");
    const { fetchImpl } = fakeD1(db);
    const result = await runMigrations(manifest, {
      mode: "apply",
      migrationsDir,
      adapter: new D1ApiAdapter("acct", "db-id", "token", fetchImpl),
    });
    expect(result.failed).toBeNull();
    expect(db.prepare("SELECT value FROM monitor_state").all().map((r) => r.value)).toEqual(["from before"]);
  });

  it("refuses to run while another runner holds the lock", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await adapter.connect();
    db.prepare("INSERT INTO _migrations_lock (id, acquired_at) VALUES (?, ?)").all(
      "migrate-839201008",
      new Date().toISOString(),
    );
    await expect(runMigrations(manifest, { mode: "apply", migrationsDir, adapter })).rejects.toThrow(
      /advisory lock/,
    );
    expect(tables(db)).not.toContain("monitor_state");
  });

  it("refuses an applied migration whose file has since changed", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    db.prepare("UPDATE _migrations_applied SET checksum = ? WHERE id = ?").all("f".repeat(64), "010_monitor_state");
    await expect(runMigrations(manifest, { mode: "apply", migrationsDir, adapter })).rejects.toThrow(
      /Checksum mismatch for already-applied migrations: 010_monitor_state/,
    );
  });

  it("names the statement D1 refused", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await adapter.connect();
    await expect(adapter.executeSql("CREATE TABLE ok(x);\nINSERT INTO nope VALUES (1);")).rejects.toThrow(
      /no such table: nope — at: INSERT INTO nope/,
    );
  });
});

describe("D1ApiAdapter.splitStatements", () => {
  it("splits on top-level semicolons only, and drops comment-only chunks", () => {
    const sql = "-- a comment; with a semicolon\nCREATE TABLE a(x TEXT DEFAULT 'a;b');\n-- trailing; note\nINSERT INTO a VALUES ('it''s');\n";
    expect(D1ApiAdapter.splitStatements(sql)).toEqual([
      "-- a comment; with a semicolon\nCREATE TABLE a(x TEXT DEFAULT 'a;b')",
      "-- trailing; note\nINSERT INTO a VALUES ('it''s')",
    ]);
  });
});

describe("the runner's environment (what the component's secretEnv resolves)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("reads the database id from the cloudflare-d1 wiring document", () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_API_TOKEN = "token";
    delete process.env.D1_DATABASE_ID;
    process.env.WIRING_CLOUDFLARE_D1 = JSON.stringify({ d1_database_id: "uuid-1", d1_database_name: "stg-x-stage" });
    expect(loadD1CredentialsFromEnv()).toEqual({ accountId: "acct", databaseId: "uuid-1", apiToken: "token" });
  });

  it("refuses to guess without a database id", () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_API_TOKEN = "token";
    delete process.env.D1_DATABASE_ID;
    delete process.env.WIRING_CLOUDFLARE_D1;
    expect(() => loadD1CredentialsFromEnv()).toThrow(/No D1 database id/);
  });

  it("sends to CLOUDFLARE_API_BASE_URL when it is set, as wrangler does", async () => {
    process.env.CLOUDFLARE_API_BASE_URL = "http://127.0.0.1:9/client/v4/";
    const { fetchImpl, requests } = fakeD1(new DatabaseSync(":memory:"));
    await new D1ApiAdapter("acct", "db-id", "token", fetchImpl).connect();
    expect(requests[0]?.url).toBe("http://127.0.0.1:9/client/v4/accounts/acct/d1/database/db-id/query");
  });
});
