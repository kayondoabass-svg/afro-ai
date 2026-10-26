// @vitest-environment node
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function worker() {
  const handlers: Record<string, any> = {};
  let cacheWrites = 0;
  const cache = { put: async () => { cacheWrites++; }, match: async () => null };
  const context = { URL, Promise,
    self: { location: { origin: "https://afroaigroup.com" }, addEventListener: (name: string, handler: any) => { handlers[name] = handler; } },
    fetch: async () => new Response('{"private":"account-a"}', { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } }),
    caches: { open: async () => cache, match: async () => null },
  };
  vm.runInNewContext(readFileSync("client/public/sw.js", "utf8"), context);
  return { handlers, writes: () => cacheWrites };
}
it("never intercepts API/auth requests even when opened as documents", () => {
  const sw = worker();
  for (const path of ["/api/payments", "/api/payments/1/receipt", "/cf-auth/google/callback", "/auth/login"]) {
    let intercepted = false;
    sw.handlers.fetch({ request: { method: "GET", mode: "navigate", url: `https://afroaigroup.com${path}` }, respondWith: () => { intercepted = true; } });
    expect(intercepted).toBe(false);
  }
});
it("never caches private navigation responses under the public app shell", async () => {
  const sw = worker();
  for (const path of ["/billing", "/dashboard", "/domains", "/"]) {
    let result!: Promise<Response>;
    sw.handlers.fetch({ request: { method: "GET", mode: "navigate", url: `https://afroaigroup.com${path}` }, respondWith: (promise: Promise<Response>) => { result = promise; } });
    await result;
  }
  expect(sw.writes()).toBe(0);
});
it("does not treat arbitrary JSON or uploaded files as public cacheable assets", () => {
  const sw = worker();
  for (const path of ["/uploads/account-a.json", "/files/private.png", "/receipts/a.json"]) {
    let intercepted = false;
    sw.handlers.fetch({ request: { method: "GET", mode: "cors", url: `https://afroaigroup.com${path}` }, respondWith: () => { intercepted = true; } });
    expect(intercepted).toBe(false);
  }
});
