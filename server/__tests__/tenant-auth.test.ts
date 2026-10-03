// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { webcrypto, createHash } from "node:crypto";
import { SignJWT } from "jose";
import worker from "../../cloudflare/src/index";
import { sqliteD1 } from "./helpers/sqlite-d1";
vi.hoisted(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { clear() {} } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { clear() {} } });
});
let db: ReturnType<typeof sqliteD1>;
let messages: any[];
const secret = "tenant-tests-not-a-real-key";
const password = "Long-password-for-tests!";
const email = "person@example.com";
const now = () => Math.floor(Date.now() / 1000);
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  db = sqliteD1();
  db.exec(readFileSync("cloudflare/schema.sql", "utf8"));
  db.exec(readFileSync("cloudflare/migrations/0007_tenant_auth.sql", "utf8"));
  db.exec(`INSERT INTO tenants (id,slug,name,allowed_origins,created_at,updated_at) VALUES
    ('a','alpha','Alpha','["https://client.example"]',0,0),('b','beta','Beta','["https://other.example"]',0,0);`);
  messages = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    messages.push(JSON.parse(init!.body as string));
    return new Response('{"id":"mock"}', { status: 200 });
  });
});
afterEach(() => { db.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function req(path: string, body?: any, token?: string, extra: Record<string,string> = {}, method?: string) {
  return worker.fetch(new Request(`https://afroaigroup.com/cf-auth${path}`, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  }), { DB: db, JWT_SECRET: secret, APP_URL: "https://afroaigroup.com", RESEND_API_KEY: "mock-only",
    GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret" } as any, { waitUntil() {} } as any);
}
function mailToken() { return new URL(messages.at(-1).html.match(/href="([^"]+)"/)[1]).searchParams.get("token"); }
async function signup(slug = "alpha") { return req(`/t/${slug}/signup`, { email, password }); }
async function verified(slug = "alpha") {
  await signup(slug);
  expect((await req(`/t/${slug}/verify-email`, { token: mailToken() })).status).toBe(200);
  return (await (await req(`/t/${slug}/login`, { email, password })).json()).token as string;
}
it("requires confirmation, sends one message, and rejects cross-tenant and reused verification links", async () => {
  const result = await (await signup()).json();
  expect(result.verificationRequired).toBe(true);
  expect(result.token).toBeUndefined();
  expect((await req("/t/alpha/login", { email, password })).status).toBe(403);
  await req("/t/alpha/send-verification", { email });
  expect(messages).toHaveLength(1);
  const token = mailToken();
  expect((await req("/t/beta/verify-email", { token })).status).toBe(400);
  const page = await req(`/t/alpha/verify-email?token=${token}`);
  expect(await page.text()).toContain("Confirm my email");
  expect(db.query("SELECT email_verified FROM users WHERE email='person@example.com'")[0].email_verified).toBe(0);
  expect((await req("/t/alpha/verify-email", { token })).status).toBe(200);
  expect((await req("/t/alpha/verify-email", { token })).status).toBe(400);
  expect((await req("/t/alpha/login", { email, password })).status).toBe(200);
});
it("reset revokes all sessions only for the target tenant, rejects reuse and preserves email verification", async () => {
  const a1 = await verified(), a2 = (await (await req("/t/alpha/login", { email, password })).json()).token;
  const b = await verified("beta");
  await req("/t/alpha/forgot-password", { email });
  const token = mailToken();
  expect((await req("/t/beta/reset-password", { token, password })).status).toBe(400);
  expect((await req("/t/alpha/reset-password", { token, password: "New-long-password!" })).status).toBe(200);
  for (const a of [a1, a2]) expect((await (await req("/t/alpha/me", undefined, a)).json()).user).toBeNull();
  expect((await (await req("/t/beta/me", undefined, b)).json()).user.email).toBe(email);
  expect((await req("/t/alpha/reset-password", { token, password })).status).toBe(400);
  expect((await req("/t/alpha/login", { email, password })).status).toBe(401);
  expect((await req("/t/alpha/login", { email, password: "New-long-password!" })).status).toBe(200);
});
it("lists and revokes owned sessions, denies foreign tenants and supports logout all", async () => {
  const a = await verified(), b = await verified("beta");
  const own = (await (await req("/t/alpha/sessions", undefined, a)).json()).sessions[0];
  const other = (await (await req("/t/beta/sessions", undefined, b)).json()).sessions[0];
  expect(own.current).toBe(true);
  expect((await req(`/t/alpha/sessions/${other.id}`, undefined, a, {}, "DELETE")).status).toBe(404);
  expect((await req("/t/beta/logout-all", {}, a)).status).toBe(401);
  expect((await req(`/t/alpha/sessions/${own.id}`, undefined, a, {}, "DELETE")).status).toBe(200);
  expect((await req("/t/alpha/sessions", undefined, a)).status).toBe(401);
  expect((await req("/t/beta/logout-all", {}, b)).status).toBe(200);
  expect((await (await req("/t/beta/me", undefined, b)).json()).user).toBeNull();
});
it("enforces JSON allowed origins and rejects empty allowlists", async () => {
  expect((await req("/t/alpha/me", undefined, undefined, { Origin: "https://client.example" })).headers.get("Access-Control-Allow-Origin")).toBe("https://client.example");
  expect((await req("/t/alpha/signup", { email, password }, undefined, { Origin: "https://evil.example" })).status).toBe(403);
  db.exec("UPDATE tenants SET allowed_origins='[]' WHERE id='a'");
  expect((await req("/t/alpha/me", undefined, undefined, { Origin: "https://client.example" })).status).toBe(403);
});
it("migrates legacy tenant OAuth links without deleting users or platform links", () => {
  db.exec(`INSERT INTO users (id,tenant_id,email,created_at,updated_at) VALUES ('legacy','a','legacy@example.com',0,0),('platform-user','platform','platform@example.com',0,0);
    INSERT INTO oauth_accounts (id,user_id,provider,provider_user_id,created_at) VALUES ('old-link','legacy','google','legacy-sub',0),('platform-link','platform-user','google','platform-sub',0);`);
  db.exec(readFileSync("cloudflare/migrations/0007_tenant_auth.sql", "utf8"));
  db.exec(readFileSync("cloudflare/migrations/0007_tenant_auth.sql", "utf8"));
  expect(db.query("SELECT user_id FROM tenant_oauth_accounts")).toEqual([{ user_id: "legacy" }]);
  expect(db.query("SELECT user_id FROM oauth_accounts")).toEqual([{ user_id: "platform-user" }]);
  expect(db.query("SELECT id FROM users")).toHaveLength(2);
});
it("rejects stateless legacy, wrong purpose, expired, and wrong-audience tokens", async () => {
  const token = await verified();
  const user = db.query("SELECT id FROM users WHERE tenant_id='a'")[0].id;
  for (const extra of [{}, { sid: "missing", kind: "platform_session" }, { sid: "missing", aud: "wrong" }]) {
    const old = await new SignJWT({ sub: user, tid: "a", kind: "afro_auth", ...extra }).setProtectedHeader({ alg: "HS256" })
      .setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    expect((await (await req("/t/alpha/me", undefined, old)).json()).user).toBeNull();
  }
  db.exec("UPDATE tenant_sessions SET expires_at=1");
  expect((await (await req("/t/alpha/me", undefined, token)).json()).user).toBeNull();
});
it("returns generic recovery responses and does not silently report successful signup mail delivery", async () => {
  expect((await (await req("/t/alpha/forgot-password", { email: "missing@example.com" })).json()).ok).toBe(true);
  expect(messages).toHaveLength(0);
  vi.mocked(fetch).mockResolvedValue(new Response("unavailable", { status: 503 }));
  expect((await signup()).status).toBe(503);
  expect(db.query("SELECT id FROM tenant_sessions")).toHaveLength(0);
});
it("rejects expired reset links and rate-limits resend requests", async () => {
  await verified();
  await req("/t/alpha/forgot-password", { email });
  const token = mailToken();
  db.exec("UPDATE tenant_auth_tokens SET expires_at=1 WHERE purpose='reset'");
  expect((await req("/t/alpha/reset-password", { token, password })).status).toBe(400);
  for (let i = 0; i < 6; i++) await req("/t/alpha/send-verification", { email });
  expect((await req("/t/alpha/send-verification", { email })).status).toBe(429);
});
it("isolates API-key session verification and immediately reflects logout", async () => {
  const a = await verified(), b = await verified("beta");
  const raw = "sk_live_testkey";
  const hash = createHash("sha256").update(raw).digest("hex");
  db.exec(`INSERT INTO api_keys (id,tenant_id,public_key,secret_hash,secret_preview,created_at) VALUES ('key','a','public','${hash}','test',0)`);
  expect((await (await req("/v1/sessions/verify", { token: a }, raw)).json()).valid).toBe(true);
  expect((await (await req("/v1/sessions/verify", { token: b }, raw)).json()).valid).toBe(false);
  expect((await req("/t/alpha/logout", {}, a)).status).toBe(200);
  expect((await (await req("/v1/sessions/verify", { token: a }, raw)).json()).valid).toBe(false);
});
it("GitHub uses only verified provider emails and clears an unverified planted password", async () => {
  await signup();
  const verifier = "v".repeat(64), redirect = "https://client.example/callback";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const env: any = { DB: db, JWT_SECRET: secret, APP_URL: "https://afroaigroup.com",
    GITHUB_CLIENT_ID: "test-client", GITHUB_CLIENT_SECRET: "test-secret" };
  const start = await worker.fetch(new Request(`https://afroaigroup.com/cf-auth/github/start?tenant=alpha&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=${challenge}`), env, { waitUntil() {} } as any);
  const state = new URL(start.headers.get("location")!).searchParams.get("state");
  vi.mocked(fetch).mockImplementation(async (url) => {
    const value = String(url).includes("access_token") ? { access_token: "provider" } :
      String(url).endsWith("/emails") ? [{ email, primary: true, verified: true }] :
      { id: 123, login: "tester", email: "unverified-public@example.com" };
    return new Response(JSON.stringify(value), { status: 200 });
  });
  const callback = await worker.fetch(new Request(`https://afroaigroup.com/cf-auth/github/callback?code=provider-code&state=${state}`, { headers: { Cookie: start.headers.get("set-cookie")!.split(";")[0] } }), env, { waitUntil() {} } as any);
  expect(callback.status).toBe(302);
  const user = db.query("SELECT email,email_verified,password_hash FROM users WHERE tenant_id='a'")[0];
  expect(user).toEqual({ email, email_verified: 1, password_hash: null });
  const code = new URL(callback.headers.get("location")!).searchParams.get("code");
  expect((await req("/t/alpha/oauth/exchange", { code, code_verifier: verifier, redirect_uri: redirect })).status).toBe(200);
});
it("completes tenant Google OAuth with PKCE without issuing a platform cookie or sharing identities", async () => {
  const verifier = "x".repeat(64);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  async function oauth(slug: string, redirect: string) {
    const start = await req(`/google/start?tenant=${slug}&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=${challenge}`);
    expect(start.status).toBe(302);
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    vi.mocked(fetch).mockImplementation(async (url) => new Response(JSON.stringify(String(url).includes("token") ?
      { access_token: "provider-token" } : { sub: "same-provider-user", email, email_verified: true }), { status: 200 }));
    const callback = await req(`/google/callback?code=provider-code&state=${state}`, undefined, undefined, { Cookie: start.headers.get("set-cookie")!.split(";")[0] });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("set-cookie")).not.toContain("afroai_session=");
    const code = new URL(callback.headers.get("location")!).searchParams.get("code");
    expect((await req(`/t/${slug}/oauth/exchange`, { code, code_verifier: "z".repeat(64), redirect_uri: redirect })).status).toBe(400);
    const response = await req(`/t/${slug}/oauth/exchange`, { code, code_verifier: verifier, redirect_uri: redirect });
    expect(response.status).toBe(200);
    expect((await req(`/t/${slug}/oauth/exchange`, { code, code_verifier: verifier, redirect_uri: redirect })).status).toBe(400);
    return (await response.json()).token;
  }
  const a = await oauth("alpha", "https://client.example/callback");
  const b = await oauth("beta", "https://other.example/callback");
  expect(db.query("SELECT id FROM users WHERE email='person@example.com'")).toHaveLength(2);
  expect((await (await req("/t/beta/me", undefined, a)).json()).user).toBeNull();
  expect((await (await req("/t/beta/me", undefined, b)).json()).user.email).toBe(email);
  expect((await req(`/google/start?tenant=missing&redirect_uri=https://client.example&code_challenge=${challenge}`)).status).toBe(404);
  expect((await req(`/google/start?tenant=alpha&redirect_uri=https://evil.example&code_challenge=${challenge}`)).status).toBe(400);
});