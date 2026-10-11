// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { webcrypto, createHash } from "node:crypto";
import worker from "../../cloudflare/src/index";
import { txtAnswerMatches } from "../../cloudflare/src/tenant-project-setup";
import { sqliteD1 } from "./helpers/sqlite-d1";
vi.hoisted(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable:true,value:{clear(){}} });
  Object.defineProperty(globalThis, "sessionStorage", { configurable:true,value:{clear(){}} });
});
let db: ReturnType<typeof sqliteD1>;
let dnsStatus = 0, dnsAvailable = true, mailAvailable = true;
let messages: any[];
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  db = sqliteD1(); db.exec(readFileSync("cloudflare/schema.sql", "utf8")); db.exec(readFileSync("cloudflare/migrations/0007_tenant_auth.sql", "utf8"));
  db.exec("INSERT INTO tenants (id,slug,name,owner_user_id,created_at,updated_at,setup_required) VALUES ('a','alpha','Alpha','owner',0,0,1),('b','beta','Beta','another-owner',0,0,1)");
  dnsStatus=0; dnsAvailable=true; mailAvailable=true; messages=[];
  vi.spyOn(globalThis,"fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/auth/user") return Response.json({id:"owner",email:"owner@example.test",emailVerified:true});
    if (url.hostname === "cloudflare-dns.com") {
      if (!dnsAvailable) return new Response("unavailable",{status:503});
      const domain = db.query("SELECT * FROM tenant_domains WHERE tenant_id='a'")[0];
      return Response.json({Status:dnsStatus,Answer:dnsStatus === 0 && domain ? [{type:16,name:`_afro-auth.${domain.domain}.`,data:JSON.stringify(`afro-auth-verification=${domain.challenge}`)}] : []});
    }
    if (url.hostname === "api.resend.com") { messages.push(JSON.parse(init!.body as string)); return new Response('{"id":"accepted"}',{status:mailAvailable ? 200 : 503}); }
    throw new Error("Unexpected outbound host");
  });
});
afterEach(() => {db.close();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function req(path: string, body?: any, method?: string, signedIn = true) {
  return worker.fetch(new Request(`https://afroaigroup.com/cf-auth${path}`, {
    method:method || (body !== undefined ? "POST" : "GET"),headers:{"Content-Type":"application/json",...(signedIn ? {Cookie:"connect.sid=test-only"} : {})},
    body:body === undefined ? undefined : JSON.stringify(body),
  }),{DB:db,JWT_SECRET:"test-only-session-signing",RESEND_API_KEY:"mock-only",APP_URL:"https://afroaigroup.com"} as any,{waitUntil(){}} as any);
}
const base = "/v1/admin/tenants/a";
async function domain(verified = false) {
  const added = await (await req(`${base}/domains`,{domain:"example.com"})).json() as any;
  if (verified) expect((await (await req(`${base}/domains/${added.id}/verify`,{})).json() as any).verified).toBe(true);
  return added;
}
it("creates a named project with setup required and its own empty private D1 directory", async () => {
  const project = await (await req("/v1/admin/tenants",{name:"My customer app"})).json() as any;
  const detail = await (await req(`/v1/admin/tenants/${project.id}`)).json() as any;
  expect(detail.tenant.setup_required).toBe(1);
  expect(detail.setup).toMatchObject({canCreateKeys:false,userStore:"D1",userFolder:`projects/${project.id}/users`});
  expect((await (await req(`/v1/admin/tenants/${project.id}/users`)).json() as any).users).toEqual([]);
});
it("requires real DNS ownership before API-key issuance and new project signup", async () => {
  expect((await req(`${base}/keys`,{})).status).toBe(409);
  expect((await req("/v1/t/alpha/signup",{email:"person@example.test",password:"Long-password-for-tests!"})).status).toBe(404);
  expect(messages).toHaveLength(0);
  const added = await domain();
  expect(added).toMatchObject({status:"pending",verification:{type:"TXT",name:"_afro-auth.example.com"}});
  expect((await req(`${base}/keys`,{})).status).toBe(409);
  const result = await (await req(`${base}/domains/${added.id}/verify`,{})).json() as any;
  expect(result.verified).toBe(true);
  const key = await (await req(`${base}/keys`,{})).json() as any;
  expect(key.secret_key).toMatch(/^sk_live_/);
  const stored = db.query("SELECT secret_hash FROM api_keys")[0];
  expect(stored.secret_hash).toBe(createHash("sha256").update(key.secret_key).digest("hex"));
  expect(JSON.stringify(await (await req(base)).json())).not.toContain(key.secret_key);
  expect(JSON.parse(db.query("SELECT allowed_origins FROM tenants WHERE id='a'")[0].allowed_origins)).toContain("https://example.com");
});
it("rejects unauthenticated and cross-owner access to domains, keys and users", async () => {
  expect((await req(`${base}/users`,undefined,undefined,false)).status).toBe(401);
  for (const suffix of ["domains","users"]) expect((await req(`/v1/admin/tenants/b/${suffix}`)).status).toBe(404);
  expect((await req("/v1/admin/tenants/b/keys",{})).status).toBe(404);
  expect((await req("/v1/admin/tenants/b/domains",{domain:"other.example.com"})).status).toBe(404);
});
it("does not mark pending DNS or provider failures as verified", async () => {
  const added = await domain(); dnsStatus=3;
  expect((await (await req(`${base}/domains/${added.id}/verify`,{})).json() as any).verified).toBe(false);
  expect((await req(`${base}/keys`,{})).status).toBe(409);
  expect((await req(`${base}/domains/${added.id}/verify`,{})).status).toBe(429);
  db.exec("UPDATE tenant_domains SET last_checked_at=0"); dnsAvailable=false;
  expect((await req(`${base}/domains/${added.id}/verify`,{})).status).toBe(503);
  expect(db.query("SELECT verified_at FROM tenant_domains")[0].verified_at).toBeNull();
});
it("binds TXT proof to the precise host and complete challenge, including DNS chunking", () => {
  expect(txtAnswerMatches({type:16,name:"_afro-auth.example.com.",data:'"abc" "def"'},"_afro-auth.example.com","abcdef")).toBe(true);
  expect(txtAnswerMatches({type:16,name:"attacker.example",data:'"abcdef"'},"_afro-auth.example.com","abcdef")).toBe(false);
  expect(txtAnswerMatches({type:16,name:"_afro-auth.example.com",data:'"other-project"'},"_afro-auth.example.com","abcdef")).toBe(false);
});
it("regenerates a one-time replacement without revoking the old key until explicit revoke", async () => {
  await domain(true);
  const old = await (await req(`${base}/keys`,{})).json() as any;
  expect((await req(`${base}/keys/${old.id}/rotate`,{})).status).toBe(400);
  const next = await (await req(`${base}/keys/${old.id}/rotate`,{confirm:true})).json() as any;
  expect(next.replaces_key_id).toBe(old.id); expect(next.secret_key).not.toBe(old.secret_key);
  expect(db.query("SELECT revoked_at FROM api_keys")[0].revoked_at).toBeNull();
  expect((await req(`${base}/keys/${old.id}`,undefined,"DELETE")).status).toBe(200);
  expect(db.query(`SELECT revoked_at FROM api_keys WHERE id='${old.id}'`)[0].revoked_at).not.toBeNull();
});
it("stores unverified users privately, sends confirmation, and requires confirmation before login", async () => {
  await domain(true);
  const body = {email:"person@example.test",password:"Long-password-for-tests!"};
  const signup = await (await req("/v1/t/alpha/signup",body)).json() as any;
  expect(signup.verificationRequired).toBe(true); expect(signup.token).toBeUndefined();
  expect((await req("/v1/t/alpha/login",body)).status).toBe(403);
  const directory = await (await req(`${base}/users?status=unverified&q=person`)).json() as any;
  expect(directory.total).toBe(1); expect(directory.users[0].email_verified).toBe(0); expect(JSON.stringify(directory)).not.toContain("password_hash");
  expect((await req(`${base}/users/${directory.users[0].id}/send-verification`,{})).status).toBe(429);
  const token = new URL(messages[0].html.match(/href="([^"]+)"/)[1]).searchParams.get("token");
  expect((await req(`/v1/t/alpha/verify-email?token=${token}`)).status).toBe(200);
  expect(db.query("SELECT email_verified FROM users WHERE tenant_id='a'")[0].email_verified).toBe(0);
  expect((await req("/v1/t/alpha/verify-email",{token})).status).toBe(200);
  expect((await req("/v1/t/alpha/verify-email",{token})).status).toBe(400);
  expect((await (await req(`${base}/users?status=verified`)).json() as any).total).toBe(1);
  expect((await req("/v1/t/alpha/login",body)).status).toBe(200);
});
it("reports actual verification delivery failures and never flips verification status", async () => {
  await domain(true); mailAvailable=false;
  expect((await req("/v1/t/alpha/signup",{email:"person@example.test",password:"Long-password-for-tests!"})).status).toBe(503);
  const user = db.query("SELECT id,email_verified FROM users WHERE tenant_id='a'")[0];
  db.exec("UPDATE tenant_auth_tokens SET created_at=0");
  expect((await req(`${base}/users/${user.id}/send-verification`,{})).status).toBe(503);
  expect(db.query("SELECT email_verified FROM users WHERE tenant_id='a'")[0].email_verified).toBe(0);
});
it("removes only the project's matching origins and disables new-project activation", async () => {
  const added=await domain(true);
  db.exec(`UPDATE tenants SET allowed_origins='["https://example.com","https://www.example.com","https://other.example.com:8443","http://localhost:3000","https://example.com.evil.test"]' WHERE id='a'`);
  expect((await req(`${base}/domains/${added.id}`,undefined,"DELETE")).status).toBe(200);
  expect(JSON.parse(db.query("SELECT allowed_origins FROM tenants WHERE id='a'")[0].allowed_origins)).toEqual(["http://localhost:3000","https://example.com.evil.test"]);
  expect((await (await req(base)).json() as any).setup.canCreateKeys).toBe(false);
});
it("preserves existing tenant activation when applying the additive setup migration", () => {
  const legacy = sqliteD1();
  try {
    legacy.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY); INSERT INTO tenants (id) VALUES ('existing')");
    legacy.exec(readFileSync("cloudflare/migrations/0008_auth_project_setup.sql","utf8"));
    expect(legacy.query("SELECT id,setup_required FROM tenants")).toEqual([{id:"existing",setup_required:0}]);
  } finally {legacy.close();}
});
