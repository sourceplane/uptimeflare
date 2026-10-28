import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// A private status page: HTTP Basic auth over every route when the Worker has
// the STATUS_PAGE_PASSWORD secret (upstream's passwordProtection), and no gate
// when it does not.
const req = (auth?: string) =>
  new NextRequest("https://status.example/api/data", auth ? { headers: { authorization: auth } } : undefined);
const basic = (cred: string) => "Basic " + btoa(cred);

afterEach(() => {
  delete process.env.STATUS_PAGE_PASSWORD;
});

describe("proxy.ts — the password gate", () => {
  it("lets every request through when no password is set", () => {
    const res = proxy(req());
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("asks for credentials, refuses wrong ones and admits the right ones", async () => {
    process.env.STATUS_PAGE_PASSWORD = "admin:s3cret";
    const none = proxy(req());
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toBe("Basic");
    expect(await none.json()).toEqual({ code: 401, message: "Not authenticated" });
    expect(proxy(req(basic("admin:wrong!"))).status).toBe(401);
    expect(proxy(req(basic("admin:s3cret"))).headers.get("x-middleware-next")).toBe("1");
  });
});
