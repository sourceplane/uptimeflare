import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SITE_NAME, SOURCE_URL } from "@/lib/site";
import { pageConfig, workerConfig } from "@/uptime.config";

const app = path.resolve(__dirname, "../../../apps/web");
const read = (rel: string) => readFileSync(path.join(app, rel), "utf8");
const jsonc = (text: string) =>
  JSON.parse(text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")) as Record<string, unknown>;

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({ env: { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } } })),
}));
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "inter" }) }));

describe("the site seam", () => {
  it("titles the page with SITE_NAME and links SOURCE_URL", () => {
    expect(pageConfig.title).toBe(SITE_NAME);
    expect(pageConfig.links?.map((l) => l.link)).toContain(SOURCE_URL);
  });
});

describe("the monitors the product ships with", () => {
  it("are unique, and each is a valid HTTP(S) URL or a host:port TCP target", () => {
    const ids = workerConfig.monitors.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
    for (const m of workerConfig.monitors) {
      if (m.method === "TCP_PING") expect(m.target, m.id).toMatch(/^[^/:]+:\d+$/);
      else expect(new URL(m.target).protocol, m.id).toMatch(/^https?:$/);
      // No Durable Object here: a worker:// check proxy cannot run.
      expect(m.checkProxy ?? "", m.id).not.toMatch(/^worker:\/\//);
    }
  });
});

describe("CVE-2026-29779: the page hands the browser only what it shows", () => {
  it("passes each monitor's id, name, tooltip, link and chart switch — never its target, headers or body", async () => {
    const { getServerSideProps } = await import("@/pages/index");
    const { props } = (await getServerSideProps()) as { props: { monitors: Record<string, unknown>[] } };
    expect(props.monitors).toHaveLength(workerConfig.monitors.length);
    const allowed = ["id", "name", "tooltip", "statusPageLink", "hideLatencyChart"];
    for (const m of props.monitors) {
      expect(Object.keys(m).filter((k) => !allowed.includes(k))).toEqual([]);
    }
  });
});

describe("one Worker: the page and the checker", () => {
  it("enters through worker.ts, which adds the checker's scheduled handler to OpenNext's fetch", () => {
    const tpl = jsonc(read("wrangler.template.jsonc"));
    expect(tpl.main).toBe("worker.ts");
    const entry = read("worker.ts");
    expect(entry).toMatch(/fetch: handler\.fetch/);
    expect(entry).toMatch(/scheduled: monitor\.scheduled/);
  });

  it("registers ONE Cron Trigger, every minute, and binds the state as DB", () => {
    const tpl = jsonc(read("wrangler.template.jsonc"));
    expect(tpl.triggers).toEqual({ crons: ["* * * * *"] });
    expect((tpl.d1_databases as { binding: string }[]).map((d) => d.binding)).toEqual(["DB"]);
  });

  it("commits wrangler.jsonc as the fixture render of the template", () => {
    const rendered = jsonc(read("wrangler.jsonc"));
    const fixture = JSON.parse(read("wiring.fixture.json"))["cloudflare-d1/stage"];
    expect(rendered.d1_databases).toEqual([
      { binding: "DB", database_name: fixture.d1_database_name, database_id: fixture.d1_database_id },
    ]);
  });
});
