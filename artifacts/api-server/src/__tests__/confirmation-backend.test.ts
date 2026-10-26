// @vitest-environment node
import { beforeEach,afterEach,it,expect,vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash,webcrypto } from "node:crypto";
import express from "express";
import worker from "../../cloudflare/src/index";
import { createAfroAuthRouter } from "../../examples/afro-auth-backend/server.mjs";
import { sqliteD1 } from "./helpers/sqlite-d1";
let db:ReturnType<typeof sqliteD1>,server:any,callback:string;
let messages:any[];
const key="sk_live_test_backend_only_123456789";
const state="a".repeat(43),verifier="b".repeat(43);
const confirmation={state,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256"};
const password="Long-password-for-new-signup!";
const env=()=>({DB:db,JWT_SECRET:"isolated-test-signing-secret",APP_URL:"https://afroaigroup.com",RESEND_API_KEY:"mock-only"});
async function api(path:string,body?:any,secret=key,slug="alpha") {
  return worker.fetch(new Request("https://afroaigroup.com/cf-auth/v1/t/"+slug+path,{
    method:body?"POST":"GET",headers:{"Content-Type":"application/json",Authorization:"Bearer "+secret},
    body:body?JSON.stringify(body):undefined,
  }),env() as any,{waitUntil(){}} as any);
}
beforeEach(async()=>{
  vi.stubGlobal("crypto",webcrypto);
  db=sqliteD1();
  db.exec(readFileSync("cloudflare/schema.sql","utf8"));
  for(const file of ["0007_tenant_auth.sql","0010_tenant_mail_status.sql","0011_confirmation_callbacks.sql"])
    db.exec(readFileSync("cloudflare/migrations/"+file,"utf8"));
  db.exec(`INSERT INTO tenants(id,slug,name,allowed_origins,created_at,updated_at) VALUES
    ('a','alpha','Alpha','["https://client.example"]',0,0),('b','beta','Beta','["https://other.example"]',0,0);
    INSERT INTO api_keys(id,tenant_id,public_key,secret_hash,secret_preview,created_at) VALUES
    ('k','a','pub_test','${createHash("sha256").update(key).digest("hex")}','sk_live_test',0);
    INSERT INTO tenant_domains(id,tenant_id,domain,challenge,created_at,verified_at) VALUES
    ('d','a','client.example','mock',0,1);
    INSERT INTO tenant_confirmation_config VALUES('a','https://client.example/auth/confirm',0);`);
  messages=[];
  const original=globalThis.fetch;
  vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input));
    if(url.hostname==="api.resend.com"){messages.push(JSON.parse(String(init?.body)));return Response.json({id:"mock-mail"});}
    if(url.hostname==="afroaigroup.com")return worker.fetch(new Request(input,init),env() as any,{waitUntil(){}} as any);
    return original(input,init);
  });
});
afterEach(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));server=null;db.close();vi.restoreAllMocks();vi.unstubAllGlobals();});
function emailLink(){return new URL(messages.at(-1).html.match(/href="([^"]+)"/)[1].replaceAll("&amp;","&"));}
async function begin(){
  const signup=await api("/signup",{email:"person@example.test",password,confirmation});
  expect(signup.status).toBe(200);
  const pending=await signup.json() as any;
  expect(pending.token).toBeUndefined();expect(pending.pendingId).toBeTruthy();
  return pending;
}
async function grant(){
  const pending=await begin(),link=emailLink();
  expect(link.origin).toBe("https://client.example");
  const response=await api("/verify-email",{token:link.searchParams.get("verification_token")});
  expect(response.status).toBe(200);
  const body=await response.json() as any;
  expect(body.token).toBeUndefined();
  return {pending,url:new URL(body.redirect)};
}
it("creates a fresh verified session once and expires the initial pending transaction",async()=>{
  const {pending,url}=await grant(),code=url.searchParams.get("code");
  expect(db.query("SELECT used_at FROM tenant_auth_tokens WHERE purpose='confirmation_pending'")[0].used_at).toBeTruthy();
  expect((await (await api("/me",undefined,pending.pendingId)).json()).user).toBeNull();
  const body={code,state,code_verifier:verifier,redirect_uri:"https://client.example/auth/confirm"};
  expect((await api("/confirmation/exchange",body,"sk_live_wrong")).status).toBe(401);
  expect((await api("/confirmation/exchange",{...body,code_verifier:"c".repeat(43)})).status).toBe(400);
  expect((await api("/confirmation/exchange",{...body,state:"bad"})).status).toBe(400);
  expect((await api("/confirmation/exchange",{...body,redirect_uri:"https://other.example/auth/confirm"})).status).toBe(400);
  const exchanged=await api("/confirmation/exchange",body);
  expect(exchanged.status).toBe(200);
  const result=await exchanged.json() as any;
  expect(result.pendingExpired).toBe(true);
  expect((await (await api("/me",undefined,result.token)).json()).user.email).toBe("person@example.test");
  // Reset the per-IP test throttle to exercise replay rather than rate limiting.
  db.exec("DELETE FROM auth_throttle");
  expect((await api("/confirmation/exchange",body)).status).toBe(400);
  expect(db.query("SELECT id FROM tenant_sessions")).toHaveLength(1);
});
it("supports independent callbacks and sessions for two clients using the same email",async()=>{
  const secondKey="sk_live_second_customer_only",secondVerifier="d".repeat(43),secondState="e".repeat(43);
  db.exec(`INSERT INTO api_keys(id,tenant_id,public_key,secret_hash,secret_preview,created_at) VALUES
    ('second','b','pub_second','${createHash("sha256").update(secondKey).digest("hex")}','sk_live_second',0);
    INSERT INTO tenant_domains(id,tenant_id,domain,challenge,created_at,verified_at) VALUES
    ('second-domain','b','other.example','mock',0,1);
    INSERT INTO tenant_confirmation_config VALUES('b','https://other.example/api/auth/callback',0);`);
  await begin();const firstLink=emailLink();
  const signup=await api("/signup",{email:"person@example.test",password,confirmation:{state:secondState,
    code_challenge:createHash("sha256").update(secondVerifier).digest("base64url"),code_challenge_method:"S256"}},secondKey,"beta");
  expect(signup.status).toBe(200);const secondLink=emailLink();
  expect(firstLink.origin).toBe("https://client.example");expect(secondLink.origin).toBe("https://other.example");
  const firstGrant=await (await api("/verify-email",{token:firstLink.searchParams.get("verification_token")})).json() as any;
  const secondGrant=await (await api("/verify-email",{token:secondLink.searchParams.get("verification_token")},secondKey,"beta")).json() as any;
  const first={code:new URL(firstGrant.redirect).searchParams.get("code"),state,code_verifier:verifier,redirect_uri:"https://client.example/auth/confirm"};
  const second={code:new URL(secondGrant.redirect).searchParams.get("code"),state:secondState,code_verifier:secondVerifier,redirect_uri:"https://other.example/api/auth/callback"};
  expect((await api("/confirmation/exchange",first,secondKey,"beta")).status).toBe(400);
  expect((await api("/confirmation/exchange",second)).status).toBe(400);
  const a=await (await api("/confirmation/exchange",first)).json() as any;
  const b=await (await api("/confirmation/exchange",second,secondKey,"beta")).json() as any;
  const aUser=(await (await api("/me",undefined,a.token)).json()).user;
  const bUser=(await (await api("/me",undefined,b.token,"beta")).json()).user;
  expect(aUser.email).toBe(bUser.email);expect(aUser.id).not.toBe(bUser.id);
  expect((await (await api("/me",undefined,b.token)).json()).user).toBeNull();
  expect((await (await api("/me",undefined,a.token,"beta")).json()).user).toBeNull();
  expect(db.query("SELECT tenant_id FROM tenant_sessions ORDER BY tenant_id")).toEqual([{tenant_id:"a"},{tenant_id:"b"}]);
});
it("does not mistake multiple users behind one trusted customer backend for one visitor",async()=>{
  for(let i=0;i<7;i++){
    const ownState="z".repeat(42)+i;
    expect((await api("/signup",{email:`batch${i}@example.test`,password,confirmation:{...confirmation,state:ownState}})).status).toBe(200);
    const link=emailLink();
    const confirmed=await api("/verify-email",{token:link.searchParams.get("verification_token")});
    expect(confirmed.status).toBe(200);
    const redirect=new URL((await confirmed.json() as any).redirect);
    expect((await api("/confirmation/exchange",{code:redirect.searchParams.get("code"),state:ownState,
      code_verifier:verifier,redirect_uri:"https://client.example/auth/confirm"})).status).toBe(200);
  }
  expect(db.query("SELECT id FROM tenant_sessions")).toHaveLength(7);
});
it("fails closed when a callback changes, expires or is exchanged by another tenant",async()=>{
  const {url}=await grant();
  const body={code:url.searchParams.get("code"),state,code_verifier:verifier,redirect_uri:"https://client.example/auth/confirm"};
  const otherKey="sk_live_foreign_backend_only";
  db.exec(`INSERT INTO api_keys(id,tenant_id,public_key,secret_hash,secret_preview,created_at) VALUES
    ('other','b','pub_other','${createHash("sha256").update(otherKey).digest("hex")}','sk_live_other',0)`);
  expect((await api("/confirmation/exchange",body,otherKey)).status).toBe(401);
  db.exec("UPDATE tenant_confirmation_config SET callback_url=NULL WHERE tenant_id='a'");
  expect((await api("/confirmation/exchange",body)).status).toBe(400);
  db.exec("UPDATE tenant_confirmation_config SET callback_url='https://client.example/auth/confirm';UPDATE tenant_auth_tokens SET expires_at=1 WHERE purpose='confirmation_code'");
  expect((await api("/confirmation/exchange",body)).status).toBe(400);
  expect(db.query("SELECT id FROM tenant_sessions")).toHaveLength(0);
});
it("rotates only the explicitly supplied previous session, not another device",async()=>{
  const {url}=await grant();
  const old=await (await api("/login",{email:"person@example.test",password})).json() as any;
  const other=await (await api("/login",{email:"person@example.test",password})).json() as any;
  const result=await (await api("/confirmation/exchange",{code:url.searchParams.get("code"),state,
    code_verifier:verifier,redirect_uri:"https://client.example/auth/confirm",previous_token:old.token})).json() as any;
  expect(result.token).toBeTruthy();
  expect((await (await api("/me",undefined,old.token)).json()).user).toBeNull();
  expect((await (await api("/me",undefined,other.token)).json()).user).toBeTruthy();
  expect((await (await api("/me",undefined,result.token)).json()).user).toBeTruthy();
});
it("runs the customer backend end to end without an iframe, browser secret or Afro page",async()=>{
  const app=express();
  server=await new Promise<any>(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
  callback=`http://127.0.0.1:${server.address().port}/auth/confirm`;
  db.exec(`UPDATE tenants SET allowed_origins='["${new URL(callback).origin}"]' WHERE id='a';
    UPDATE tenant_confirmation_config SET callback_url='${callback}' WHERE tenant_id='a'`);
  app.use(createAfroAuthRouter({baseUrl:"https://afroaigroup.com/cf-auth/v1/t/alpha",secretKey:key,
    callbackUrl:callback,cookieSecret:"isolated-customer-cookie-encryption-secret"}));
  const origin=new URL(callback).origin;
  const signup=await fetch(origin+"/auth/signup",{method:"POST",headers:{"Content-Type":"application/json",Origin:origin},
    body:JSON.stringify({email:"browser@example.test",password})});
  expect(signup.status).toBe(200);
  expect(await signup.json()).toMatchObject({verificationRequired:true});
  const pendingCookie=signup.headers.getSetCookie().find(v=>v.startsWith("afro_pending="))!.split(";")[0];
  expect(pendingCookie).not.toContain(key);
  const link=emailLink();expect(link.origin).toBe(origin);
  const preview=await fetch(link,{headers:{Cookie:pendingCookie}});
  const html=await preview.text();
  expect(html).toContain("Confirm and sign in");
  expect(html).not.toContain("iframe");expect(html).not.toContain(key);
  expect(db.query("SELECT email_verified FROM users WHERE tenant_id='a'")[0].email_verified).toBe(0);
  expect((await fetch(link)).status).toBe(400); // No original browser cookie.
  const confirmed=await fetch(callback,{method:"POST",redirect:"manual",
    headers:{Origin:origin,Cookie:pendingCookie,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({verification_token:link.searchParams.get("verification_token")!,state:link.searchParams.get("state")!})});
  expect(confirmed.status).toBe(303);expect(confirmed.headers.get("location")).toBe("/dashboard?verified=true");
  const cookies=confirmed.headers.getSetCookie();
  expect(cookies.some(v=>v.startsWith("afro_pending=;"))).toBe(true);
  const sessionCookie=cookies.find(v=>v.startsWith("afro_session=") && !v.startsWith("afro_session=;"))!;
  expect(sessionCookie).toContain("HttpOnly");expect(sessionCookie).toContain("SameSite=Lax");
  const session=await fetch(origin+"/auth/session",{headers:{Cookie:sessionCookie.split(";")[0]}});
  expect((await session.json()).user.email).toBe("browser@example.test");
  const logout=await fetch(origin+"/auth/logout",{method:"POST",headers:{Origin:origin,Cookie:sessionCookie.split(";")[0]}});
  expect(logout.status).toBe(200);
  expect((await fetch(origin+"/auth/session",{headers:{Cookie:sessionCookie.split(";")[0]}})).status).toBe(401);
});
it("supports a customer's React callback with a fresh Secure cookie and no token in JSON",async()=>{
  const app=express();
  callback="https://client.example/auth/confirm";
  app.use(createAfroAuthRouter({baseUrl:"https://afroaigroup.com/cf-auth/v1/t/alpha",secretKey:key,
    callbackUrl:callback,cookieSecret:"isolated-customer-cookie-encryption-secret",renderCallback:false}));
  app.get("/auth/confirm",(_req,res)=>res.send("Customer React callback"));
  server=await new Promise<any>(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
  const local=`http://127.0.0.1:${server.address().port}`;
  const signup=await fetch(local+"/auth/signup",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://client.example"},
    body:JSON.stringify({email:"react@example.test",password})});
  const cookie=signup.headers.getSetCookie()[0].split(";")[0];
  const link=emailLink();
  const get=await fetch(local+"/auth/confirm"+link.search,{headers:{Cookie:cookie}});
  expect(await get.text()).toBe("Customer React callback");
  expect(get.headers.get("content-security-policy")).toBeNull();
  expect(db.query("SELECT email_verified FROM users WHERE tenant_id='a'")[0].email_verified).toBe(0);
  const confirmed=await fetch(local+"/auth/confirm",{method:"POST",
    headers:{"Content-Type":"application/json",Accept:"application/json",Origin:"https://client.example",Cookie:cookie},
    body:JSON.stringify({verification_token:link.searchParams.get("verification_token"),state:link.searchParams.get("state")})});
  expect(confirmed.status).toBe(200);
  expect(await confirmed.json()).toEqual({ok:true,redirect:"/dashboard?verified=true"});
  const authCookie=confirmed.headers.getSetCookie().find(v=>v.startsWith("afro_session=")&&!v.startsWith("afro_session=;"))!;
  expect(authCookie).toContain("Secure");expect(authCookie).toContain("HttpOnly");expect(authCookie).toContain("SameSite=Lax");
  expect(authCookie).not.toContain("Domain=");
  expect(db.query("SELECT id FROM tenant_sessions WHERE revoked_at IS NULL")).toHaveLength(1);
});
