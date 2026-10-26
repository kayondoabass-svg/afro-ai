// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import worker from "../../cloudflare/src/index";
import { sqliteD1 } from "./helpers/sqlite-d1";
vi.hoisted(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { clear() {} } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { clear() {} } });
});
let db: ReturnType<typeof sqliteD1>;
let profile: any;
let upstream: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  db = sqliteD1();
  db.exec(readFileSync("cloudflare/schema.sql", "utf8"));
  db.exec(`INSERT INTO users (id,tenant_id,email,created_at,updated_at) VALUES
    ('worker-owner','platform','owner@example.test',0,0),
    ('customer-owner','platform','other@example.test',0,0);
    INSERT INTO tenants (id,slug,name,owner_user_id,created_at,updated_at) VALUES
    ('mine','mine','Existing','worker-owner',0,0),
    ('other','other','Private','customer-owner',0,0);`);
  profile = { id: "legacy-postgres-id", email: "owner@example.test", emailVerified: "2026-01-01" };
  upstream = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(profile));
});
afterEach(() => { db.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function request(path = "", body?: any, cookie = "connect.sid=test-session") {
  return worker.fetch(new Request(`https://afroaigroup.com/cf-auth/v1/admin/tenants${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), { DB: db, APP_URL: "https://afroaigroup.com" } as any, { waitUntil() {} } as any);
}
it("accepts the dashboard session without a second Worker cookie and preserves existing owners", async () => {
  const created = await request("", { name: "Brightboardapp" });
  expect(created.status).toBe(200);
  expect((await created.json() as any).name).toBe("Brightboardapp");
  const listed = await request();
  expect(listed.headers.get("cache-control")).toBe("no-store");
  const names = (await listed.json() as any).tenants.map((t: any) => t.name);
  expect(names.sort()).toEqual(["Brightboardapp", "Existing"]);
  expect(upstream.mock.calls[0][1]).toMatchObject({
    headers: { Cookie: "connect.sid=test-session" }, redirect: "manual", cache: "no-store",
  });
});
it("supports verified Passport accounts that have no D1 user mirror", async () => {
  profile = { id: "passport-only", email: "passport@example.test", emailVerified: true };
  expect((await request("", { name: "Passport app" })).status).toBe(200);
  expect((await (await request()).json() as any).tenants).toHaveLength(1);
});
it("keeps other users' projects inaccessible", async () => {
  expect((await request("/other")).status).toBe(404);
});
it("does not accept a missing platform cookie or a customer bearer token", async () => {
  expect((await request("", undefined, "")).status).toBe(401);
  expect(upstream).not.toHaveBeenCalled();
});
it("reports expired or revoked sessions as 401", async () => {
  upstream.mockResolvedValue(new Response(null, { status: 401 }));
  const res = await request("", { name: "Blocked" });
  expect(res.status).toBe(401);
  expect((await res.json() as any).code).toBe("SIGN_IN_REQUIRED");
});
it("reports unverified email as 403 and does not create a project", async () => {
  profile.emailVerified = null;
  const res = await request("", { name: "Blocked" });
  expect(res.status).toBe(403);
  expect((await res.json() as any).code).toBe("EMAIL_VERIFICATION_REQUIRED");
  expect(await db.prepare("SELECT id FROM tenants WHERE name = 'Blocked'").first()).toBeNull();
});
it.each([500, 503, 302])("reports upstream status %s as unavailable, not signed out", async (status) => {
  upstream.mockResolvedValue(new Response(null, { status }));
  const res = await request();
  expect(res.status).toBe(503);
  expect((await res.json() as any).code).toBe("AUTH_CHECK_UNAVAILABLE");
});
it("fails closed on timeouts and malformed profiles", async () => {
  upstream.mockRejectedValueOnce(new Error("timeout"));
  expect((await request()).status).toBe(503);
  profile = { emailVerified: true };
  expect((await request()).status).toBe(503);
});