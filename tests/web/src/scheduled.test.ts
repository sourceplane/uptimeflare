import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sockets } from "../stubs/cloudflare-sockets";
import { sqliteD1 } from "./d1";

// The checker: upstream's scheduled loop (monitor/index.ts), run as the Cron
// Trigger runs it, against a real SQLite behind the DB binding and a fetch
// that answers for every target. A config of the test's own, so the product's
// monitors (uptime.config.ts) are the owner's to change.
vi.mock("@/uptime.config", () => ({
  pageConfig: { title: "Test" },
  maintenances: [],
  workerConfig: {
    kvWriteCooldownMinutes: 3,
    monitors: [
      { id: "up", name: "Up API", method: "GET", target: "https://up.example/" },
      { id: "down", name: "Down API", method: "GET", target: "https://down.example/" },
      { id: "kw", name: "Keyword", method: "GET", target: "https://kw.example/", responseKeyword: "healthy" },
      { id: "tcp", name: "Database", method: "TCP_PING", target: "db.example:5432", timeout: 200 },
      { id: "geo", name: "Geo", method: "GET", target: "https://up.example/", checkProxy: "worker://weur" },
      {
        id: "geo_fallback",
        name: "Geo with fallback",
        method: "GET",
        target: "https://up.example/",
        checkProxy: "worker://enam",
        checkProxyFallback: true,
      },
    ],
    notification: {
      webhook: { url: "https://hooks.example/notify", payloadType: "json", payload: { text: "$MSG" } },
    },
  },
}));

type Call = { url: string; method: string; body: string | null };
let calls: Call[] = [];
let downStatus = 503;

beforeEach(() => {
  calls = [];
  downStatus = 503;
  sockets.behaviour = "open";
  sockets.calls.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET", body: (init?.body as string | undefined) ?? null });
      if (url === "https://cloudflare.com/cdn-cgi/trace") return new Response("fl=1\ncolo=TST\nhttp=http/2\n");
      if (url === "https://up.example/") return new Response("hello");
      if (url === "https://down.example/") return new Response("bad gateway", { status: downStatus });
      if (url === "https://kw.example/") return new Response("status: degraded");
      if (url === "https://hooks.example/notify") return new Response("ok");
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function scheduled(db: D1Database) {
  const { default: monitor } = await import("@/monitor");
  await monitor.scheduled(
    { cron: "* * * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController,
    { DB: db },
    { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext,
  );
}

describe("the scheduled checker, against the DB binding", () => {
  it("checks every monitor, opens incidents for the failing ones, notifies, and writes the state", async () => {
    const d1 = sqliteD1();
    await scheduled(d1.binding);

    const { CompactedMonitorStateWrapper } = await import("@/monitor/store");
    const stored = d1.stored();
    expect(stored).not.toBeNull();
    const state = new CompactedMonitorStateWrapper(stored).uncompact();
    expect(state.lastUpdate).toBeGreaterThan(Date.now() / 1000 - 60);
    // up, tcp and geo_fallback are up; down (503), kw (no keyword) and geo
    // (no Durable Object) are down.
    expect([state.overallUp, state.overallDown]).toEqual([3, 3]);

    const open = (id: string) => state.incident[id]!.filter((i) => i.end === null);
    expect(open("up")).toEqual([]);
    expect(open("down").map((i) => i.error)).toEqual([["Expected codes: 2xx, Got: 503"]]);
    expect(open("kw").map((i) => i.error)).toEqual([["HTTP response doesn't contain the configured keyword"]]);
    expect(open("geo").map((i) => i.error)).toEqual([
      ["worker:// check proxies (Durable Objects) are not available in this port"],
    ]);
    expect(open("tcp")).toEqual([]);
    expect(open("geo_fallback")).toEqual([]);
    // Every monitor carries a latency point from the Worker's own colo.
    for (const id of ["up", "down", "kw", "tcp", "geo", "geo_fallback"]) {
      expect(state.latency[id]!.map((p) => p.loc), id).toEqual(["TST"]);
    }
    expect(sockets.calls).toEqual([{ hostname: "db.example", port: 5432 }]);

    // One notification per monitor that went down, through the webhook.
    const hooks = calls.filter((c) => c.url === "https://hooks.example/notify").map((c) => JSON.parse(c.body!).text);
    expect(hooks).toHaveLength(3);
    expect(hooks.find((t: string) => t.startsWith("🔴 Down API is currently down"))).toContain("Got: 503");
  });

  it("closes the incident when the monitor recovers, and says so", async () => {
    const d1 = sqliteD1();
    await scheduled(d1.binding);
    downStatus = 200;
    calls = [];
    await scheduled(d1.binding);

    const { CompactedMonitorStateWrapper } = await import("@/monitor/store");
    const state = new CompactedMonitorStateWrapper(d1.stored()).uncompact();
    const incidents = state.incident.down!;
    expect(incidents[incidents.length - 1]!.end).not.toBeNull();
    expect(state.latency.down).toHaveLength(2);
    const hooks = calls.filter((c) => c.url === "https://hooks.example/notify").map((c) => JSON.parse(c.body!).text);
    expect(hooks.some((t: string) => t.startsWith("✅ Down API is up!"))).toBe(true);
  });

  it("reports a TCP monitor down when the connect is refused", async () => {
    sockets.behaviour = "refuse";
    const d1 = sqliteD1();
    await scheduled(d1.binding);
    const { CompactedMonitorStateWrapper } = await import("@/monitor/store");
    const state = new CompactedMonitorStateWrapper(d1.stored()).uncompact();
    expect(state.incident.tcp!.at(-1)).toMatchObject({ end: null, error: ["Error: connection refused"] });
  });

  it("fails the invocation when there is no monitor_state table (the migrations did not run)", async () => {
    const d1 = sqliteD1({ migrated: false });
    await expect(scheduled(d1.binding)).rejects.toThrow(/no such table: monitor_state/);
  });
});
