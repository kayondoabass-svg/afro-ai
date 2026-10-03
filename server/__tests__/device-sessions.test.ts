// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { webcrypto, createHash } from "node:crypto";
import { SignJWT } from "jose";
import worker from "../../cloudflare/src/index";
import { sqliteD1 } from "./helpers/sqlite-d1";
import { PLATFORM_ISSUER, PLATFORM_AUDIENCE, PLATFORM_PURPOSE, verifyPlatformSession } from "@shared/platform-session";
import { resetPasswordUrl } from "@shared/device-sessions";
vi.hoisted(() => {
  // Shared test cleanup also runs for Node-only backend suites.
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { clear() {} } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { clear() {} } });
});

const secret = "test-only-not-a-real-signing-key-123456789";
const encoded = new TextEncoder().encode(secret);
let db: ReturnType<typeof sqliteD1>;
const now = () => Math.floor(Date.now() / 1000);
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  db = sqliteD1();
  db.exec(readFileSync("cloudflare/schema.sql", "utf8"));
  db.exec(readFileSync("cloudflare/migrations/0006_device_sessions.sql", "utf8"));
  db.exec(`INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES ('one', 'one@example.com', 'old', 0, 0), ('two', 'two@example.com', 'other', 0, 0);
    INSERT INTO device_sessions VALUES ('a','one','one@example.com','Phone','Kampala, UG',0,0,${now()+9999},NULL), ('b','one','one@example.com','Laptop','London, GB',0,0,${now()+9999},NULL), ('c','two','two@example.com','Phone','Unknown',0,0,${now()+9999},NULL);`);
});
afterEach(() => { db.close(); vi.unstubAllGlobals(); });

async function token(overrides: Record<string, any> = {}, key = encoded) {
  return new SignJWT({ sub: "one", sid: "a", kind: PLATFORM_PURPOSE, ...overrides })
    .setProtectedHeader({ alg: "HS256" }).setIssuer(PLATFORM_ISSUER).setAudience(PLATFORM_AUDIENCE)
    .setIssuedAt().setExpirationTime("1h").sign(key);
}
async function request(path: string, body?: any, cookie?: string) {
  const req = new Request(`https://afroaigroup.com/cf-auth${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json", "User-Agent": "Mozilla iPhone Safari" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return worker.fetch(req, { DB: db, JWT_SECRET: secret, TURNSTILE_SECRET_KEY: "test-only", APP_URL: "https://afroaigroup.com", COOKIE_DOMAIN: ".afroaigroup.com" } as any, { waitUntil: () => {} } as any);
}

describe("platform JWT validation", () => {
  it("accepts a valid platform session and rejects tampered signatures and other token purposes", async () => {
    expect((await verifyPlatformSession(await token(), encoded)).sub).toBe("one");
    await expect(verifyPlatformSession(await token({}, new TextEncoder().encode("wrong-secret")), encoded)).rejects.toThrow();
    await expect(verifyPlatformSession(await token({ kind: "afro_auth" }), encoded)).rejects.toThrow();
  });
  it.each(["issuer", "audience", "expiration", "missing expiration"])("rejects %s", async (invalid) => {
    const builder = new SignJWT({ sub: "one", sid: "a", kind: PLATFORM_PURPOSE })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt()
      .setIssuer(invalid === "issuer" ? "https://attacker.invalid" : PLATFORM_ISSUER)
      .setAudience(invalid === "audience" ? "another-app" : PLATFORM_AUDIENCE);
    if (invalid !== "missing expiration") builder.setExpirationTime(invalid === "expiration" ? now() - 10 : now() + 600);
    await expect(verifyPlatformSession(await builder.sign(encoded), encoded)).rejects.toThrow();
  });
});

describe("real Worker reset and session lifecycle", () => {
  it("denies tenant management to an unverified platform user", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ emailVerified: null }), { status: 200 }));
    const response = await request("/v1/admin/tenants", { name: "Test", slug: "test" }, `afroai_session=${await token()}`);
    expect(response.status).toBe(401);
    expect(db.query("SELECT id FROM tenants WHERE id != 'platform'")).toHaveLength(0);
  });
  it("reset revokes both old devices, preserves another account, issues a fresh session and rejects reuse", async () => {
    const raw = "reset-test-token";
    const hash = createHash("sha256").update(raw).digest("hex");
    db.exec(`INSERT INTO password_reset_tokens VALUES ('r','one','${hash}',${now()+3600},NULL,0),('r2','one','other-reset',${now()+3600},NULL,0)`);
    const oldCookie = `afroai_session=${await token()}`;
    expect((await (await request("/me", undefined, oldCookie)).json()).user.id).toBe("one");
    const result = await request("/reset-password", { token: raw, password: "New-test-password!" }, oldCookie);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true, loggedIn: true });
    expect(db.query("SELECT id FROM device_sessions WHERE revoked_at IS NOT NULL ORDER BY id")).toEqual([{ id: "a" }, { id: "b" }]);
    expect(db.query("SELECT id FROM password_reset_tokens WHERE used_at IS NULL")).toHaveLength(0);
    expect((await (await request("/me", undefined, oldCookie)).json()).user).toBeNull();
    const freshCookie = result.headers.get("set-cookie")!.split(";")[0];
    expect((await (await request("/me", undefined, freshCookie)).json()).user.id).toBe("one");
    const retry = await request("/reset-password", { token: raw, password: "Should-not-work!" });
    expect(retry.status).toBe(400);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const login = await request("/login", { email: "one@example.com", password: "New-test-password!", turnstileToken: "test-only" });
    expect(login.status).toBe(200);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const oldLogin = await request("/login", { email: "one@example.com", password: "old", turnstileToken: "test-only" });
    expect(oldLogin.status).toBe(401);
  });
  it("expired and invalid reset links do not revoke sessions or change passwords", async () => {
    const hash = createHash("sha256").update("expired").digest("hex");
    db.exec(`INSERT INTO password_reset_tokens VALUES ('r','one','${hash}',${now()-1},NULL,0)`);
    for (const raw of ["expired", "unknown"]) expect((await request("/reset-password", { token: raw, password: "New-test-password!" })).status).toBe(400);
    expect(db.query("SELECT password_hash FROM users WHERE id='one'")[0].password_hash).toBe("old");
    expect(db.query("SELECT id FROM device_sessions WHERE revoked_at IS NOT NULL")).toHaveLength(0);
  });
  it("logout revokes the cookie and cannot affect another user", async () => {
    const cookie = `afroai_session=${await token()}`;
    expect((await request("/logout", {}, cookie)).status).toBe(200);
    expect(db.query("SELECT id FROM device_sessions WHERE revoked_at IS NOT NULL")).toEqual([{ id: "a" }]);
    expect((await (await request("/me", undefined, cookie)).json()).user).toBeNull();
  });
  it("reset email has a functional frontend link including an encoded token", async () => {
    let email: any;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      email = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ id: "test-email" }), { status: 200 });
    });
    const req = new Request("https://afroaigroup.com/cf-auth/forgot-password", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "one@example.com" }),
    });
    const response = await worker.fetch(req, { DB: db, JWT_SECRET: secret, APP_URL: "https://afroaigroup.com/", RESEND_API_KEY: "mock-only" } as any, { waitUntil: () => {} } as any);
    expect(response.status).toBe(200);
    const link = email.html.match(/href="(https:\/\/afroaigroup.com\/reset-password\?token=[^"]+)"/)[1];
    expect((await request("/reset-password", { token: new URL(link).searchParams.get("token"), password: "Another-test-password!" })).status).toBe(200);
    expect(resetPasswordUrl("https://afroaigroup.com/ignored", "a+b/")).toBe("https://afroaigroup.com/reset-password?token=a%2Bb%2F");
  });
});