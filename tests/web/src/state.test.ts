import { describe, expect, it } from "vitest";
import { CompactedMonitorStateWrapper, getFromStore, setToStore } from "@/monitor/store";
import { sqliteD1 } from "./d1";

// The compacted state is upstream's (monitor/store.ts, unchanged but for its
// table and binding): incidents in columns, latency hex-packed with its
// locations run-length encoded. What the checker writes, the page reads back.
describe("the compacted monitor state", () => {
  it("starts empty when nothing is stored", () => {
    const s = new CompactedMonitorStateWrapper(null);
    expect(s.data).toEqual({ lastUpdate: 0, overallUp: 0, overallDown: 0, incident: {}, latency: {} });
    expect(s.incidentLen("a")).toBe(0);
    expect(s.latencyLen("a")).toBe(0);
  });

  it("packs incidents and latency, and uncompacts them as the page reads them", () => {
    const s = new CompactedMonitorStateWrapper(null);
    s.appendIncident("api", { start: [100], end: 100, error: ["dummy"] });
    s.appendIncident("api", { start: [200, 260], end: null, error: ["Timeout", "HTTP 502"] });
    s.appendLatency("api", { loc: "ORD", ping: 120, time: 1000 });
    s.appendLatency("api", { loc: "ORD", ping: 65535, time: 1060 });
    s.appendLatency("api", { loc: "AMS", ping: 7, time: 4294967295 });

    // Hex-packed: 4 hex chars per Uint16 ping, 8 per Uint32 time.
    expect(s.latencyLen("api")).toBe(3);
    expect(s.data.latency.api!.loc).toEqual({ v: ["ORD", "AMS"], c: [2, 1] });
    expect(s.getFirstLatency("api")).toEqual({ loc: "ORD", ping: 120, time: 1000 });
    expect(s.getLastLatency("api")).toEqual({ loc: "AMS", ping: 7, time: 4294967295 });

    const round = new CompactedMonitorStateWrapper(s.getCompactedStateStr()).uncompact();
    expect(round.incident.api).toEqual([
      { start: [100], end: 100, error: ["dummy"] },
      { start: [200, 260], end: null, error: ["Timeout", "HTTP 502"] },
    ]);
    expect(round.latency.api).toEqual([
      { loc: "ORD", ping: 120, time: 1000 },
      { loc: "ORD", ping: 65535, time: 1060 },
      { loc: "AMS", ping: 7, time: 4294967295 },
    ]);
  });

  it("drops the oldest latency point and its run-length entry", () => {
    const s = new CompactedMonitorStateWrapper(null);
    s.appendLatency("x", { loc: "SIN", ping: 1, time: 10 });
    s.appendLatency("x", { loc: "FRA", ping: 2, time: 20 });
    s.unshiftLatency("x");
    expect(s.latencyLen("x")).toBe(1);
    expect(s.data.latency.x!.loc).toEqual({ v: ["FRA"], c: [1] });
    expect(s.getFirstLatency("x")).toEqual({ loc: "FRA", ping: 2, time: 20 });
  });

  it("refuses an incident index it does not hold", () => {
    const s = new CompactedMonitorStateWrapper(null);
    expect(() => s.getIncident("nope", 0)).toThrow(/out of bounds|not found/);
  });
});

describe("the store (the DB binding's monitor_state table)", () => {
  it("writes the state under its key and reads it back; a second write replaces it", async () => {
    const d1 = sqliteD1();
    expect(await getFromStore({ DB: d1.binding }, "state")).toBeNull();
    await setToStore({ DB: d1.binding }, "state", '{"lastUpdate":1}');
    await setToStore({ DB: d1.binding }, "state", '{"lastUpdate":2}');
    expect(await getFromStore({ DB: d1.binding }, "state")).toBe('{"lastUpdate":2}');
    expect(d1.statements.every((s) => /\bmonitor_state\b/.test(s))).toBe(true);
  });

  it("fails loudly when the migrations have not created the table", async () => {
    const d1 = sqliteD1({ migrated: false });
    await expect(getFromStore({ DB: d1.binding }, "state")).rejects.toThrow(/no such table: monitor_state/);
  });
});
