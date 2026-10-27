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
  db.exec(readFileSync("cloudflare/migrations/0010_tenant_mail_status.sql", "utf8"));
  db.exec(readFileSync("cloudflare/migrations/0011_confirmation_callbacks.sql", "utf8"));
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
it("enforces the paid owner-wide app allowance atomically and preserves existing projects",async()=>{
  db.exec("INSERT INTO auth_branding_entitlements(owner_user_id,plan,source,expires_at,updated_at) VALUES('owner','builder','payment',9999999999,0)");
  expect((await req("/v1/admin/tenants",{name:"Over Builder allowance"})).status).toBe(402);
  expect(db.query("SELECT id FROM tenants WHERE owner_user_id='owner'")).toHaveLength(1);
  db.exec("UPDATE auth_branding_entitlements SET plan='business' WHERE owner_user_id='owner'");
  const results=await Promise.all(Array.from({length:6},(_,i)=>req("/v1/admin/tenants",{name:`Business app ${i}`})));
  expect(results.filter(r=>r.status===200)).toHaveLength(4);
  expect(results.filter(r=>r.status===402)).toHaveLength(2);
  expect(db.query("SELECT id FROM tenants WHERE owner_user_id='owner'")).toHaveLength(5);
});
it("keeps backend confirmation callbacks owner-scoped and bound to verified origins",async()=>{
  expect((await req(`${base}/confirmation-flow`,undefined,undefined,false)).status).toBe(401);
  expect((await req("/v1/admin/tenants/b/confirmation-flow")).status).toBe(404);
  const before=await (await req(`${base}/confirmation-flow`)).json() as any;
  expect(before.enabled).toBe(false);
  expect((await req(`${base}/confirmation-flow`,{callbackUrl:"https://example.com/auth/confirm"},"PATCH")).status).toBe(400);
  await domain(true);
  const result=await req(`${base}/confirmation-flow`,{callbackUrl:"https://example.com/auth/confirm"},"PATCH");
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({enabled:true,callbackUrl:"https://example.com/auth/confirm"});
  for(const callbackUrl of ["https://untrusted.example/auth/confirm","https://example.com/auth/confirm?next=https://untrusted.example",
    "https://example.com@untrusted.example/auth/confirm","https://example.com/auth/confirm#token","http://example.com/auth/confirm"])
    expect((await req(`${base}/confirmation-flow`,{callbackUrl},"PATCH")).status).toBe(400);
  expect((await req("/v1/admin/tenants/b/confirmation-flow",{callbackUrl:null},"PATCH")).status).toBe(404);
  expect((await req(`${base}/confirmation-flow`,{callbackUrl:null},"PATCH")).status).toBe(200);
  expect(db.query("SELECT id FROM users")).toHaveLength(0);
});
it("keeps mail diagnostics private and refreshes delivery without sending an email",async()=>{
  db.exec(`INSERT INTO tenant_mail_events VALUES
    ('attempt-a','a','user-a','verify','accepted',NULL,'provider-a',1793070000,1793070000),
    ('attempt-b','b','user-b','verify','accepted',NULL,'provider-b',1793070000,1793070000)`);
  const reads:string[]=[];
  vi.mocked(fetch).mockImplementation(async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==="/api/auth/user") return Response.json({id:"owner",email:"owner@example.test",emailVerified:true});
    reads.push(url.toString());
    expect(init?.method || "GET").toBe("GET");
    if(url.pathname==="/emails/provider-a") return Response.json({last_event:"delivered"});
    if(url.pathname==="/domains") return Response.json({data:[]});
    throw new Error("Unexpected upstream request");
  });
  expect((await req(`${base}/mail-status`,undefined,undefined,false)).status).toBe(401);
  expect((await req("/v1/admin/tenants/b/mail-status")).status).toBe(404);
  expect(reads).toHaveLength(0);
  const first=await req(`${base}/mail-status`);
  expect(first.headers.get("cache-control")).toContain("no-store");
  expect(await first.json()).toMatchObject({health:{status:"available"},events:[{id:"attempt-a",outcome:"accepted"}]});
  const refreshed=await (await req(`${base}/mail-status/refresh`,{})).json() as any;
  expect(refreshed.timestampFormat).toContain("ISO 8601 UTC");
  expect(refreshed.health.checkedAt).toMatch(/T.*Z$/);
  expect(refreshed.events[0].created_at).toBe(new Date(1793070000*1000).toISOString());
  expect(refreshed.events).toHaveLength(1);
  expect(refreshed.events[0].outcome).toBe("delivered");
  expect(reads.filter(url=>url.includes("/domains"))).toHaveLength(1);
  expect(reads).not.toContain("https://api.resend.com/emails/provider-b");
  expect(db.query("SELECT outcome FROM tenant_mail_events WHERE id='attempt-b'")[0].outcome).toBe("accepted");
});
it("exposes provider lookup errors safely and preserves accepted records without resending",async()=>{
  db.exec("INSERT INTO tenant_mail_events(id,tenant_id,user_id,purpose,outcome,message_id,created_at,updated_at) VALUES('lookup-error','a','u','verify','accepted','provider-error',1793070000,1793070000)");
  vi.mocked(fetch).mockImplementation(async(input,init)=>{
    const url=new URL(String(input));
    expect(init?.method || "GET").toBe("GET");
    if(url.pathname==="/api/auth/user") return Response.json({id:"owner",email:"owner@example.test",emailVerified:true});
    if(url.pathname==="/domains") return Response.json({data:[]});
    return Response.json({message:"private-token https://private.test/confirm"},{status:401});
  });
  const response=await req(`${base}/mail-status/refresh`,{});
  const body=await response.json() as any;
  expect(body.events[0].outcome).toBe("accepted");
  expect(body.events[0].created_at).toBe(new Date(1793070000*1000).toISOString());
  expect(body.events[0].deliveryCheck.error).toContain("credential");
  expect(JSON.stringify(body)).not.toMatch(/private-token|private\.test/);
  expect(db.query("SELECT outcome FROM tenant_mail_events WHERE id='lookup-error'")[0].outcome).toBe("accepted");
});
it("shows invalid platform provider credentials without exposing credentials or falsely proving delivery",async()=>{
  vi.mocked(fetch).mockImplementation(async input=>{
    const url=new URL(String(input));
    if(url.pathname==="/api/auth/user") return Response.json({id:"owner",email:"owner@example.test",emailVerified:true});
    return new Response('{"message":"private upstream details"}',{status:401});
  });
  const result=await (await req(`${base}/mail-status`)).json() as any;
  expect(result.health.status).toBe("invalid_credential");
  expect(JSON.stringify(result)).not.toMatch(/mock-only|private upstream/);
  expect(result.events).toEqual([]);
});
it("lets an owner adopt v1 or keep legacy without modifying saved customers, keys or sessions", async () => {
  db.exec("UPDATE tenants SET setup_required=0 WHERE id='a'");
  await domain(true);
  expect((await req(`${base}/keys`,{})).status).toBe(200);
  const signup = await req("/t/alpha/signup",{email:"upgrade@example.test",password:"Long-password-for-tests!"});
  expect(signup.status).toBe(200);
  db.exec("UPDATE users SET email_verified=1 WHERE tenant_id='a'");
  const original = db.query("SELECT * FROM users WHERE tenant_id='a'");
  const firstLogin = await (await req("/t/alpha/login",{email:"upgrade@example.test",password:"Long-password-for-tests!"})).json() as any;
  expect(firstLogin.user.id).toBe(original[0].id);
  const beforeSessions = db.query("SELECT * FROM tenant_sessions WHERE tenant_id='a'");
  const beforeKeys = db.query("SELECT * FROM api_keys WHERE tenant_id='a'");
  expect(beforeKeys).toHaveLength(1);
  expect(beforeSessions).toHaveLength(1);
  const upgrade = await (await req(`${base}/api-upgrade`,{contract:"v1",confirmPreserveData:true})).json() as any;
  expect(upgrade).toMatchObject({selectedContract:"v1",requiresDataCopy:false,users:{total:1,verified:1,unverified:0}});
  expect(upgrade.urls).toMatchObject({legacy:"https://afroaigroup.com/cf-auth/t/alpha",v1:"https://afroaigroup.com/cf-auth/v1/t/alpha"});
  expect(db.query("SELECT * FROM users WHERE tenant_id='a'")).toEqual(original);
  expect(db.query("SELECT * FROM tenant_sessions WHERE tenant_id='a'")).toEqual(beforeSessions);
  expect(db.query("SELECT * FROM api_keys WHERE tenant_id='a'")).toEqual(beforeKeys);
  const stillSignedIn = await worker.fetch(new Request("https://worker.example/cf-auth/v1/t/alpha/me",{
    headers:{Authorization:`Bearer ${firstLogin.token}`},
  }),{DB:db,JWT_SECRET:"test-only-session-signing",APP_URL:"https://afroaigroup.com"} as any,{waitUntil(){}} as any);
  expect(stillSignedIn.status).toBe(200);
  expect((await (await req(`${base}/api-upgrade`)).json() as any).selectedContract).toBe("v1");
  const nextLogin = await (await req("/v1/t/alpha/login",{email:"upgrade@example.test",password:"Long-password-for-tests!"})).json() as any;
  expect(nextLogin.user.id).toBe(firstLogin.user.id);
  expect((await req("/t/alpha/login",{email:"upgrade@example.test",password:"Long-password-for-tests!"})).status).toBe(200);
  expect((await (await req(`${base}/api-upgrade`,{contract:"legacy",confirmPreserveData:true})).json() as any).selectedContract).toBe("legacy");
  expect(db.query("SELECT * FROM users WHERE tenant_id='a'")).toEqual(original);
});
it("requires explicit owner consent and never uses an API upgrade to bypass activation", async () => {
  expect((await req(`${base}/api-upgrade`,undefined,undefined,false)).status).toBe(401);
  expect((await req("/v1/admin/tenants/b/api-upgrade",{contract:"v1",confirmPreserveData:true})).status).toBe(404);
  expect((await req(`${base}/api-upgrade`,{contract:"v1"})).status).toBe(400);
  expect((await req(`${base}/api-upgrade`,null)).status).toBe(400);
  expect((await req(`${base}/api-upgrade`,{contract:"v2",confirmPreserveData:true})).status).toBe(400);
  expect(db.query("SELECT * FROM tenant_api_adoptions")).toHaveLength(0);
  expect((await req(`${base}/api-upgrade`,{contract:"legacy",confirmPreserveData:true})).status).toBe(200);
  expect((await req("/t/alpha/signup",{email:"blocked@example.test",password:"Long-password-for-tests!"})).status).toBe(404);
  expect(db.query("SELECT setup_required FROM tenants WHERE id='a'")[0].setup_required).toBe(1);
});
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
