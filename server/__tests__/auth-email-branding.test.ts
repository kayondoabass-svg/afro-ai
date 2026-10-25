// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { BRANDING_DEFAULTS, effectiveBranding, validateBranding, renderAuthEmail } from "../../shared/auth-email-branding";
import { AUTH_PACKAGES, authFeatures } from "../../shared/auth-packages";
import { brandedTenantEmail, tenantBrandingEntitlement } from "../../cloudflare/src/tenant-email-branding";
import { sqliteD1 } from "./helpers/sqlite-d1";
let db:ReturnType<typeof sqliteD1>;
const settings={...BRANDING_DEFAULTS,logoUrl:"https://assets.example/logo.png",color:"#112233",senderName:"Lakeside",
  replyTo:"support@example.com",domainId:7,fromAddress:"accounts@example.com",verifySubject:"Welcome to Lakeside",
  verifyIntro:"Please confirm your account.",resetIntro:"Recover your account.",footer:"Contact our team.",
  verifyHtml:"<p><strong>Welcome</strong></p>"};
beforeEach(()=>{
  db=sqliteD1();db.exec(readFileSync("cloudflare/schema.sql","utf8"));
  db.exec(`INSERT INTO tenants(id,slug,name,owner_user_id,created_at,updated_at) VALUES('a','alpha','Lakeside','owner',0,0),('b','beta','Other customer','other',0,0);
    INSERT INTO tenant_email_branding(tenant_id,settings,sender_domain,provider_domain_id,updated_at)
    VALUES('a','${JSON.stringify(settings)}','example.com','verified-domain',0);
    INSERT INTO auth_branding_entitlements(owner_user_id,plan,source,expires_at,updated_at)
    VALUES('owner','scale','payment',9999999999,0);`);
});
afterEach(()=>{db.close();vi.unstubAllGlobals();});
it("keeps the published Auth prices and capability matrix",()=>{
  expect(AUTH_PACKAGES.map(p=>p.usd)).toEqual([0,5,25,100]);
  expect(authFeatures("free")).toEqual({identity:false,senderDomain:false,copy:false,whiteLabel:false,html:false});
  expect(authFeatures("builder")).toEqual({identity:true,senderDomain:false,copy:false,whiteLabel:false,html:false});
  expect(authFeatures("business")).toEqual({identity:true,senderDomain:true,copy:true,whiteLabel:true,html:false});
  expect(Object.values(authFeatures("scale"))).toEqual([true,true,true,true,true]);
});
it("retains paid settings but does not render them after downgrade",()=>{
  expect(effectiveBranding(settings,"free")).toEqual(BRANDING_DEFAULTS);
  const mail=renderAuthEmail({name:"Lakeside",purpose:"verify",url:"https://client.example/auth",settings,plan:"free",senderVerified:true});
  expect(mail.from).toBe("Afro AI <noreply@afroaigroup.com>");
  expect(mail.subject).toBe("Confirm your email — Lakeside");
  expect(mail.html).not.toContain(settings.logoUrl);
  expect(mail.html).toContain("Powered by Afro Auth");
  expect(settings.verifySubject).toBe("Welcome to Lakeside");
  expect(validateBranding({senderName:settings.senderName},settings,"free")).toEqual(settings);
  expect(()=>validateBranding({senderName:"New name"},settings,"free")).toThrow("Upgrade");
});
it("always includes the service-generated action and expiry with constrained Scale HTML",()=>{
  const mail=renderAuthEmail({name:"Lakeside",purpose:"verify",url:"https://client.example/auth?token=secret&state=s",settings,plan:"scale",senderVerified:true});
  expect(mail.from).toBe("Lakeside <accounts@example.com>");
  expect(mail.replyTo).toBe("support@example.com");
  expect(mail.html).toContain("token=secret&amp;state=s");
  expect(mail.html).toContain("expires in 24 hours");
  expect(mail.html).toContain("<strong>Welcome</strong>");
  expect(mail.html).not.toContain("Powered by");
  expect(renderAuthEmail({name:"X",purpose:"reset",url:"https://x.example",plan:"business",settings}).html).toContain("expires in one hour");
});
it.each([
  {senderName:"Bad\r\nBcc: x@bad.test"},{color:"red; background:url(x)"},{logoUrl:"javascript:alert(1)"},
  {verifyHtml:"<script>alert(1)</script>"},{verifyHtml:'<p onclick="evil()">Hi</p>'},
  {verifyHtml:'<a href="https://attacker.test">Confirm</a>'},{verifyHtml:"<style>body{display:none}</style>"},
  {domainId:1.1},{replyTo:"A <a@example.com>"},{unknown:"x"},
])("rejects unsafe branding %j",input=>expect(()=>validateBranding(input,BRANDING_DEFAULTS,"scale")).toThrow());
it("scopes templates and entitlements to the requested owner/project",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({name:"example.com",status:"verified"}))));
  const env={DB:db,RESEND_API_KEY:"mock-only"};
  const a=await brandedTenantEmail(env,{id:"a",owner_user_id:"owner",name:"Lakeside"},"verify","https://client.example/action");
  const b=await brandedTenantEmail(env,{id:"b",owner_user_id:"other",name:"Other customer"},"verify","https://other.example/action");
  expect(a.subject).toBe("Welcome to Lakeside");expect(a.from).toContain("accounts@example.com");
  expect(b.subject).toBe("Confirm your email — Other customer");expect(b.html).not.toContain("assets.example");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("enforces expiry at send time even before a reconciliation tick",async()=>{
  db.exec("UPDATE auth_branding_entitlements SET expires_at=1");
  vi.stubGlobal("fetch",vi.fn());
  const mail=await brandedTenantEmail({DB:db,RESEND_API_KEY:"mock-only"},{id:"a",owner_user_id:"owner",name:"Lakeside"},"reset","https://client.example/reset");
  expect(mail.from).toContain("noreply@afroaigroup.com");expect(mail.html).not.toContain("assets.example");
  expect(fetch).not.toHaveBeenCalled();
});
it("falls back to the platform sender if provider domain proof fails without breaking recovery",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({name:"example.com",status:"pending"}))));
  const mail=await brandedTenantEmail({DB:db,RESEND_API_KEY:"mock-only"},{id:"a",owner_user_id:"owner",name:"Lakeside"},"reset","https://client.example/reset");
  expect(mail.from).toBe("Lakeside <noreply@afroaigroup.com>");
  expect(mail.html).toContain("Reset your password");
});
it("exempts only the server-controlled founder identity, not arbitrary owners",async()=>{
  db.exec(`INSERT INTO users(id,tenant_id,email,email_verified,plan,created_at,updated_at)
    VALUES('founder','platform','kayondoabass@gmail.com',1,'business',0,0)`);
  expect((await tenantBrandingEntitlement(db,{owner_user_id:"founder"})).source).toBe("founder");
  expect((await tenantBrandingEntitlement(db,{owner_user_id:"stranger"})).plan).toBe("free");
});
