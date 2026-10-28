import { beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteD1 } from "./d1";

// The JSON API and the badge (pages/api), as the Worker answers them: the
// state read through the DB binding getCloudflareContext() hands the route.
let d1 = sqliteD1();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({ env: { DB: d1.binding } })),
}));
vi.mock("@/uptime.config", () => ({
  pageConfig: { title: "Test" },
  maintenances: [{ title: "Window", body: "upgrade", start: "2030-01-01T00:00:00Z", monitors: ["a"] }],
  workerConfig: {
    monitors: [
      { id: "a", name: "A", method: "GET", target: "https://a.example/" },
      { id: "b", name: "B", method: "GET", target: "https://b.example/" },
    ],
  },
}));

// The slice of NextApiRequest/NextApiResponse the routes use.
function call(handler: (req: never, res: never) => unknown, query: Record<string, string> = {}) {
  const out = { status: 0, headers: {} as Record<string, string>, body: "" };
  const res = {
    setHeader(k: string, v: string) {
      out.headers[k.toLowerCase()] = v;
    },
    status(code: number) {
      out.status = code;
      return res;
    },
    send(body: string) {
      out.body = body;
      return res;
    },
  };
  return Promise.resolve(handler({ query } as never, res as never)).then(() => ({ ...out, json: JSON.parse(out.body) }));
}

async function storeState(lastUpdate: number) {
  const { CompactedMonitorStateWrapper } = await import("@/monitor/store");
  const s = new CompactedMonitorStateWrapper(null);
  s.data.lastUpdate = lastUpdate;
  s.data.overallUp = 1;
  s.data.overallDown = 1;
  s.appendIncident("a", { start: [100], end: 100, error: ["dummy"] });
  s.appendIncident("b", { start: [100], end: 100, error: ["dummy"] });
  s.appendIncident("b", { start: [200], end: null, error: ["Timeout after 10000ms"] });
  s.appendLatency("a", { loc: "ORD", ping: 42, time: 200 });
  s.appendLatency("b", { loc: "ORD", ping: 10000, time: 200 });
  d1.put("state", s.getCompactedStateStr());
}

beforeEach(() => {
  d1 = sqliteD1();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/data", () => {
  it("answers 500 'No data available' before the first check", async () => {
    const { default: handler } = await import("@/pages/api/data");
    const r = await call(handler);
    expect([r.status, r.json]).toEqual([500, { error: "No data available" }]);
  });

  it("answers 500 when the table is missing, instead of throwing", async () => {
    d1 = sqliteD1({ migrated: false });
    const { default: handler } = await import("@/pages/api/data");
    const r = await call(handler);
    expect([r.status, r.json]).toEqual([500, { error: "Monitor state unavailable" }]);
  });

  it("answers the state: each monitor's status, latency and location, and when it was checked", async () => {
    await storeState(1793000000);
    const { default: handler } = await import("@/pages/api/data");
    const r = await call(handler);
    expect(r.status).toBe(200);
    expect(r.headers["access-control-allow-origin"]).toBe("*");
    expect(r.json).toEqual({
      up: 1,
      down: 1,
      updatedAt: 1793000000,
      monitors: {
        a: { up: true, latency: 42, location: "ORD", message: "OK" },
        b: { up: false, latency: 10000, location: "ORD", message: "Timeout after 10000ms" },
      },
      maintenances: [{ title: "Window", body: "upgrade", start: "2030-01-01T00:00:00Z", monitors: ["a"] }],
    });
    // The smoke reads exactly this: "updatedAt":<seconds>.
    expect(r.body).toMatch(/"updatedAt":1793000000\b/);
  });
});

describe("GET /api/badge", () => {
  it("answers a shields.io endpoint badge per monitor", async () => {
    await storeState(1793000000);
    const { default: handler } = await import("@/pages/api/badge");
    expect((await call(handler, { id: "a" })).json).toEqual({ schemaVersion: 1, label: "a", message: "UP", color: "brightgreen" });
    expect((await call(handler, { id: "b", label: "B", down: "OUTAGE" })).json).toEqual({
      schemaVersion: 1,
      label: "B",
      message: "OUTAGE",
      color: "red",
    });
  });

  it("refuses a request with no monitor id, and an unknown one", async () => {
    await storeState(1793000000);
    const { default: handler } = await import("@/pages/api/badge");
    const none = await call(handler);
    expect([none.status, none.json.message]).toEqual([400, "no-monitor"]);
    const unknown = await call(handler, { id: "zzz" });
    expect([unknown.status, unknown.json.isError]).toEqual([500, true]);
  });
});
