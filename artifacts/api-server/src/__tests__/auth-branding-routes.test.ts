// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import express from "express";
import { readFileSync } from "node:fs";
import { sqliteD1 } from "./helpers/sqlite-d1";
const mocks=vi.hoisted(()=>({query:vi.fn(),d1:vi.fn(),send:vi.fn()}));
vi.mock("../db",()=>({pool:{query:mocks.query,connect:async()=>({query:mocks.query,release(){}})}}));
vi.mock("../founder-auth-records",()=>({authQuery:mocks.d1}));
vi.mock("../email-provider",()=>({sendEmail:mocks.send}));
import { registerAuthBranding } from "../auth-branding";
import { BRANDING_DEFAULTS } from "../../shared/auth-email-branding";
let db:ReturnType<typeof sqliteD1>,server:any,base:string,plan:string,email:string;
beforeEach(async()=>{
  db=sqliteD1();db.exec(readFileSync("cloudflare/schema.sql","utf8"));
  db.exec(readFileSync("cloudflare/migrations/0010_tenant_mail_status.sql","utf8"));
  db.exec(`INSERT INTO tenants(id,slug,name,owner_user_id,created_at,updated_at) VALUES('a','alpha','Lakeside','owner',0,0),('b','beta','Other','other',0,0)`);
  plan="free";email="owner@example.com";
  mocks.d1.mockImplementation(async(sql:string,params:any[]=[])=>{
    const statement=db.prepare(sql).bind(...params);
    if (/^(SELECT|WITH)/.test(sql))return (await statement.all()).results;
    await statement.run();return [];
  });
  mocks.query.mockImplementation(async(sql:string)=>{
    if(sql.includes("SELECT email"))return {rows:[{email,email_verified:new Date()}]};
    if(sql.includes("SELECT * FROM auth_branding_subscriptions"))return {rows:plan==="free"?[]:[{plan,source:"payment",expires_at:new Date(Date.now()+86400000),payment_id:1}]};
    if(sql.includes("SELECT DISTINCT d.id"))return {rows:[]};
    return {rows:[]};
  });
  mocks.send.mockResolvedValue({messageId:"mock-mail-id"});
  const app=express();app.use(express.json());
  registerAuthBranding(app,((req:any,_res:any,next:any)=>{req.user={claims:{sub:req.headers["x-test-owner"]||"owner"}};next();}) as any);
  server=app.listen(0,"127.0.0.1");
  await new Promise<void>(r=>server.once("listening",r));
  base=`http://127.0.0.1:${server.address().port}`;
});
afterEach(async()=>{await new Promise<void>(r=>server.close(r));db.close();vi.clearAllMocks();vi.unstubAllGlobals();});
function api(path="/api/auth-projects/a/branding",method="GET",body?:any,owner="owner"){
  return fetch(base+path,{method,headers:{"Content-Type":"application/json","x-test-owner":owner},body:body?JSON.stringify(body):undefined});
}
it("returns only owned settings and explicitly prevents shared-cache storage",async()=>{
  const result=await api();
  expect(result.status).toBe(200);expect(result.headers.get("Cache-Control")).toContain("no-store");
  const body=await result.json() as any;expect(body.project.id).toBe("a");expect(body.package.key).toBe("free");
  expect((await api("/api/auth-projects/b/branding")).status).toBe(404);
  expect((await api("/api/auth-projects/missing/branding")).status).toBe(404);
});
it("rejects paid branding on Free at the API, not only the UI",async()=>{
  const result=await api(undefined,"PATCH",{senderName:"Spoofed paid sender"});
  expect(result.status).toBe(400);expect(db.query("SELECT * FROM tenant_email_branding")).toHaveLength(0);
});
it("saves Builder identity without unlocking templates or a custom sending domain",async()=>{
  plan="builder";
  expect((await api(undefined,"PATCH",{senderName:"Lakeside",replyTo:email})).status).toBe(200);
  expect(JSON.parse(db.query("SELECT settings FROM tenant_email_branding")[0].settings).senderName).toBe("Lakeside");
  expect((await api(undefined,"PATCH",{verifyHtml:"<p>Paid content</p>"})).status).toBe(400);
  expect((await api(undefined,"PATCH",{replyTo:"unverified@elsewhere.test"})).status).toBe(400);
});
it("rejects another user's domain even on Business",async()=>{
  plan="business";
  expect((await api(undefined,"PATCH",{domainId:45,fromAddress:"mail@other.test"})).status).toBe(400);
});
it("keeps preview actions inert and sends tests only to the authenticated verified owner",async()=>{
  plan="builder";
  const preview=await api("/api/auth-projects/a/branding/preview","POST",{purpose:"verify",settings:{senderName:"Lakeside"}});
  expect(preview.status).toBe(200);expect((await preview.json() as any).html).toContain("example.invalid/preview-only");
  expect(mocks.send).not.toHaveBeenCalled();
  const sent=await api("/api/auth-projects/a/branding/test","POST",{purpose:"reset",to:"victim@elsewhere.test"});
  expect(sent.status).toBe(200);
  expect(mocks.send.mock.calls[0][0].to).toBe(email);
  expect(mocks.send.mock.calls[0][0].subject).toContain("not a sign-in link");
});
it("preserves retained settings on downgrade and renders the standard template",async()=>{
  db.exec(`INSERT INTO tenant_email_branding(tenant_id,settings,updated_at) VALUES('a','${JSON.stringify({...BRANDING_DEFAULTS,senderName:"Saved identity"})}',0)`);
  const result=await api();expect((await result.json() as any).retainedLockedFields).toContain("senderName");
  const preview=await api("/api/auth-projects/a/branding/preview","POST",{purpose:"reset"});
  const body=await preview.json() as any;expect(body.from).not.toContain("Saved identity");
  expect((await api(undefined,"PATCH",{...BRANDING_DEFAULTS,senderName:"Saved identity"})).status).toBe(200);
});
it("requires the actual founder identity for oversight and overrides",async()=>{
  expect((await api("/api/founder/auth-projects/b/branding")).status).toBe(403);
  expect((await api("/api/founder/auth-projects/b/branding-entitlement","PATCH",{plan:"scale",reason:"testing",expiresAt:null})).status).toBe(403);
  email="kayondoabass@gmail.com";
  expect((await api("/api/founder/auth-projects/b/branding")).status).toBe(200);
  expect((await api("/api/founder/auth-projects/b/branding-entitlement","PATCH",{plan:"scale",reason:"Approved sponsored access",expiresAt:null})).status).toBe(200);
  expect(mocks.query.mock.calls.some(call=>String(call[0]).includes("entitlement.override"))).toBe(true);
});
it("rejects cross-site mutation requests",async()=>{
  const result=await fetch(base+"/api/auth-projects/a/branding",{method:"PATCH",headers:{"Content-Type":"application/json",Origin:"https://attacker.test"},body:JSON.stringify({senderName:"X"})});
  expect(result.status).toBe(403);
});
