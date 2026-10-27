import type { Express, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "./db";
import { authQuery } from "./founder-auth-records";
import { isFounderEmail } from "./founder-access";
import { AUTH_PACKAGES, authPackage, authFeatures } from "../shared/auth-packages";
import { BRANDING_DEFAULTS, validateBranding, renderAuthEmail, lockedBrandingFields, type AuthBranding } from "../shared/auth-email-branding";
import { paymentBrowserGuard } from "./payment-checkout";
import { sendEmail } from "./email-provider";
import { recentBrandingMail, refreshBrandingMail, MAIL_TIMESTAMP_FORMAT } from "./auth-branding-mail";

export async function ownedAuthProject(ownerId: string, id: string) {
  const [project] = await authQuery("SELECT id,name,slug,owner_user_id,plan FROM tenants WHERE id=? AND owner_user_id=? AND id<>'platform'", [id,ownerId]);
  if (!project) throw Object.assign(new Error("Auth project not found."),{status:404});
  return project as { id:string; name:string; slug:string; owner_user_id:string; plan:string };
}
export async function resolveAuthEntitlement(ownerId: string, connection: Pick<typeof pool,"query"> = pool) {
  const account = (await connection.query("SELECT email FROM users WHERE id=$1",[ownerId])).rows[0];
  if (!account) throw new Error("Owner account unavailable.");
  if (isFounderEmail(account.email || "")) return { plan:"scale",source:"founder",expiresAt:null,paymentId:null };
  const row = (await connection.query("SELECT * FROM auth_branding_subscriptions WHERE user_id=$1",[ownerId])).rows[0];
  if (!row || (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()))
    return {plan:"free",source:"free",expiresAt:null,paymentId:null};
  return {plan:row.plan,source:row.source,expiresAt:row.expires_at ? new Date(row.expires_at).toISOString() : null,paymentId:row.payment_id};
}
/** Payment commit is canonical. This expiring mirror is idempotently retried by payment
 * status checks and the periodic reconciler; Worker mail never trusts a browser's plan.
 */
export async function syncAuthEntitlement(ownerId: string) {
  const conn=await pool.connect();
  try {
    await conn.query("BEGIN");
    // Serialize mirrors with payment settlement/overrides to avoid stale writes.
    await conn.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[ownerId]);
    const e = await resolveAuthEntitlement(ownerId,conn);
    await authQuery(`INSERT INTO auth_branding_entitlements(owner_user_id,plan,source,expires_at,payment_id,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(owner_user_id) DO UPDATE SET plan=excluded.plan,source=excluded.source,
    expires_at=excluded.expires_at,payment_id=excluded.payment_id,updated_at=excluded.updated_at`,
    [ownerId,e.plan,e.source,e.expiresAt ? Math.floor(new Date(e.expiresAt).getTime()/1000) : null,e.paymentId,Math.floor(Date.now()/1000)]);
    await conn.query("COMMIT");
    return e;
  }catch(error){await conn.query("ROLLBACK");throw error;}finally{conn.release();}
}
export async function reconcileAuthEntitlements() {
  const rows = (await pool.query("SELECT user_id FROM auth_branding_subscriptions")).rows;
  for (const row of rows) await syncAuthEntitlement(row.user_id);
}
async function stored(id:string) {
  const [row] = await authQuery("SELECT settings,sender_domain,provider_domain_id FROM tenant_email_branding WHERE tenant_id=?",[id]);
  return {row,settings:{...BRANDING_DEFAULTS,...(row ? JSON.parse(String(row.settings)) : {})} as AuthBranding};
}
async function ownedDomains(userId:string) {
  return (await pool.query(`SELECT DISTINCT d.id,d.domain,d.status,d.provider,d.resend_domain_id FROM email_api_domains d
    JOIN email_project_domains a ON a.domain_id=d.id JOIN email_projects p ON p.id=a.project_id
    WHERE d.user_id=$1 AND p.user_id=$1 ORDER BY d.domain`,[userId])).rows;
}
async function senderFor(userId:string, s:AuthBranding) {
  if (!s.domainId && !s.fromAddress) return null;
  if (!s.domainId || !s.fromAddress) throw new Error("Select a verified sending domain and enter its From address.");
  const domain = (await ownedDomains(userId)).find(d=>d.id===s.domainId);
  if (!domain || domain.status!=="verified" || domain.provider!=="resend" || !domain.resend_domain_id ||
    s.fromAddress.split("@")[1].toLowerCase()!==domain.domain.toLowerCase())
    throw new Error("Use an address on your verified Resend Email API project domain. Website TXT proof alone does not verify email sending.");
  return domain;
}
async function senderStillVerified(domain:any) {
  if (!domain || !process.env.RESEND_API_KEY) return false;
  const response = await fetch(`https://api.resend.com/domains/${encodeURIComponent(domain.resend_domain_id)}`,{
    headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`},signal:AbortSignal.timeout(6000)});
  const data = await response.json() as any;
  return response.ok && data.status==="verified" && data.name?.toLowerCase()===domain.domain.toLowerCase();
}
async function validateReplyTo(ownerId:string,settings:AuthBranding,plan:string) {
  if (!authFeatures(plan).identity || !settings.replyTo) return;
  const account=(await pool.query("SELECT email,email_verified FROM users WHERE id=$1",[ownerId])).rows[0];
  if (account?.email_verified && account.email?.toLowerCase()===settings.replyTo.toLowerCase()) return;
  const domain=(await ownedDomains(ownerId)).find(d=>d.status==="verified" && d.provider==="resend" &&
    d.domain.toLowerCase()===settings.replyTo.split("@")[1].toLowerCase());
  if (!domain || !await senderStillVerified(domain))
    throw new Error("Reply-to must be your verified account email or an address on your verified Email API sending domain.");
}
async function audit(actor:string,owner:string,project:string,action:string,metadata:Record<string,unknown>={}) {
  await pool.query("INSERT INTO auth_branding_audit(actor_id,owner_id,project_id,action,metadata) VALUES($1,$2,$3,$4,$5)",
    [actor,owner,project,action,JSON.stringify(metadata)]);
}
export function registerAuthBranding(app:Express, auth:RequestHandler) {
  const path="/api/auth-projects/:id/branding";
  const testLimiter=rateLimit({windowMs:60*60*1000,max:3,standardHeaders:true,legacyHeaders:false,
    keyGenerator:(req:any)=>String(req.user.claims.sub),message:{message:"Three branding test emails per hour are allowed. Check your inbox before trying again."}});
  const wrap=(fn:Function)=>async(req:any,res:any)=>{
    res.set("Cache-Control","private, no-store");res.set("Vary","Cookie, Authorization");
    try {await fn(req,res);}catch(e:any){res.status(e.status||400).json({message:e.status===404?e.message:e.message?.includes("Cloudflare")?"Auth settings are temporarily unavailable.":e.message||"Auth branding request failed."});}
  };
  app.get(path,auth,wrap(async(req:any,res:any)=>{
    const owner=req.user.claims.sub, project=await ownedAuthProject(owner,req.params.id);
    const e=await syncAuthEntitlement(owner), {settings}=await stored(project.id);
    const domains=await ownedDomains(owner);
    const recentMail=await recentBrandingMail(project.id,owner);
    const account=(await pool.query("SELECT email FROM users WHERE id=$1",[owner])).rows[0];
    res.json({project,package:authPackage(e.plan),source:e.source,expiresAt:e.expiresAt,features:authFeatures(e.plan),
      settings,domains:domains.map(({id,domain,status}:any)=>({id,domain,status})),packages:AUTH_PACKAGES,
      retainedLockedFields:lockedBrandingFields(settings,e.plan),recentMail,timestampFormat:MAIL_TIMESTAMP_FORMAT,testRecipient:account?.email||null});
  }));
  const deliveryLimiter=rateLimit({windowMs:60_000,max:6,standardHeaders:true,legacyHeaders:false,
    keyGenerator:(req:any)=>String(req.user.claims.sub),message:{message:"Please wait before refreshing delivery status again."}});
  app.post(`${path}/mail-status/refresh`,auth,paymentBrowserGuard,deliveryLimiter,wrap(async(req:any,res:any)=>{
    const owner=req.user.claims.sub,project=await ownedAuthProject(owner,req.params.id);
    res.json({recentMail:await refreshBrandingMail(project.id,owner),timestampFormat:MAIL_TIMESTAMP_FORMAT});
  }));
  app.patch(path,auth,paymentBrowserGuard,wrap(async(req:any,res:any)=>{
    const owner=req.user.claims.sub,project=await ownedAuthProject(owner,req.params.id);
    const e=await syncAuthEntitlement(owner),{settings}=await stored(project.id);
    const next=validateBranding(req.body,settings,e.plan);
    await validateReplyTo(owner,next,e.plan);
    // Locked, retained settings survive a downgrade without requiring old domains to remain active.
    const domain=authFeatures(e.plan).senderDomain ? await senderFor(owner,next) : null;
    if (domain && !await senderStillVerified(domain)) throw new Error("The sending provider has not confirmed this domain. Check Email API domain verification.");
    await authQuery(`INSERT INTO tenant_email_branding(tenant_id,settings,sender_domain,provider_domain_id,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(tenant_id) DO UPDATE SET settings=excluded.settings,sender_domain=excluded.sender_domain,
      provider_domain_id=excluded.provider_domain_id,updated_at=excluded.updated_at`,
      [project.id,JSON.stringify(next),domain?.domain||null,domain?.resend_domain_id||null,Math.floor(Date.now()/1000)]);
    await audit(owner,owner,project.id,"branding.saved",{fields:Object.keys(req.body)});
    res.json({ok:true,settings:next});
  }));
  app.post(`${path}/preview`,auth,paymentBrowserGuard,wrap(async(req:any,res:any)=>{
    const owner=req.user.claims.sub, project=await ownedAuthProject(owner,req.params.id);
    const e=await resolveAuthEntitlement(owner),{settings}=await stored(project.id);
    if (!["verify","reset"].includes(req.body.purpose)) throw new Error("Select confirmation or password reset.");
    const next=validateBranding(req.body.settings||{},settings,e.plan);
    await validateReplyTo(owner,next,e.plan);
    const domain=authFeatures(e.plan).senderDomain ? await senderFor(owner,next) : null;
    res.json(renderAuthEmail({name:project.name,purpose:req.body.purpose,url:"https://example.invalid/preview-only",
      settings:next,plan:e.plan,platformFrom:process.env.MAIL_FROM,senderVerified:!!domain}));
  }));
  app.post(`${path}/test`,auth,paymentBrowserGuard,testLimiter,wrap(async(req:any,res:any)=>{
    const owner=req.user.claims.sub,project=await ownedAuthProject(owner,req.params.id);
    const e=await resolveAuthEntitlement(owner),{settings}=await stored(project.id);
    if (!["verify","reset"].includes(req.body.purpose)) throw new Error("Select confirmation or password reset.");
    const domain=authFeatures(e.plan).senderDomain ? await senderFor(owner,settings) : null;
    const verified=domain ? await senderStillVerified(domain) : false;
    const account=(await pool.query("SELECT email,email_verified FROM users WHERE id=$1",[owner])).rows[0];
    if (!account?.email || !account.email_verified) throw new Error("Verify your platform account email before sending a branding test.");
    const message=renderAuthEmail({name:project.name,purpose:req.body.purpose,url:"https://example.invalid/preview-only",
      settings,plan:e.plan,platformFrom:process.env.MAIL_FROM,senderVerified:verified});
    const result=await sendEmail({...message,subject:`[Preview — not a sign-in link] ${message.subject}`,to:account.email});
    await audit(owner,owner,project.id,"branding.test.accepted",{messageId:result.messageId,provider:result.provider,purpose:req.body.purpose});
    res.json({accepted:true,messageId:result.messageId});
  }));
  app.get("/api/founder/auth-projects/:id/branding",auth,wrap(async(req:any,res:any)=>{
    const actor=req.user.claims.sub,account=(await pool.query("SELECT email FROM users WHERE id=$1",[actor])).rows[0];
    if (!isFounderEmail(account?.email||"")) return res.status(403).json({message:"Founder access required."});
    const [project]=await authQuery("SELECT id,owner_user_id,name,slug FROM tenants WHERE id=? AND id<>'platform'",[req.params.id]);
    if (!project?.owner_user_id) return res.status(404).json({message:"Auth project not found."});
    const owner=String(project.owner_user_id);
    const e=await syncAuthEntitlement(owner),{settings}=await stored(String(project.id));
    const domains=await ownedDomains(owner);
    const recentMail=await recentBrandingMail(project.id,owner);
    const records=(await pool.query("SELECT actor_id,action,metadata,created_at FROM auth_branding_audit WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 25",[owner])).rows;
    res.json({project,entitlement:e,settings,domains:domains.map(({id,domain,status}:any)=>({id,domain,status})),recentMail,timestampFormat:MAIL_TIMESTAMP_FORMAT,audit:records});
  }));
  app.patch("/api/founder/auth-projects/:id/branding-entitlement",auth,paymentBrowserGuard,wrap(async(req:any,res:any)=>{
    const actor=req.user.claims.sub,account=(await pool.query("SELECT email FROM users WHERE id=$1",[actor])).rows[0];
    if (!isFounderEmail(account?.email||"")) return res.status(403).json({message:"Founder access required."});
    const [project]=await authQuery("SELECT id,owner_user_id FROM tenants WHERE id=? AND id<>'platform'",[req.params.id]);
    if (!project?.owner_user_id) return res.status(404).json({message:"Auth project not found."});
    const {plan,reason,expiresAt}=req.body;
    if (!AUTH_PACKAGES.some(p=>p.key===plan) || typeof reason!=="string" || reason.trim().length<5 || reason.length>500)
      throw new Error("Choose an Auth package and provide an audit reason of 5–500 characters.");
    if (expiresAt!==null && (typeof expiresAt!=="string" || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt)<=Date.now()))
      throw new Error("Choose a future expiry or no expiry.");
    const conn=await pool.connect();
    try {
      await conn.query("BEGIN");
      await conn.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[project.owner_user_id]);
      await conn.query(`INSERT INTO auth_branding_subscriptions(user_id,plan,source,expires_at) VALUES($1,$2,'override',$3)
        ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,source='override',expires_at=excluded.expires_at,payment_id=NULL,updated_at=now()`,
        [project.owner_user_id,plan,expiresAt]);
      await conn.query("INSERT INTO auth_branding_audit(actor_id,owner_id,project_id,action,metadata) VALUES($1,$2,$3,'entitlement.override',$4)",
        [actor,project.owner_user_id,project.id,JSON.stringify({plan,expiresAt,reason})]);
      await conn.query("COMMIT");
    }catch(error){await conn.query("ROLLBACK");throw error;}finally{conn.release();}
    await syncAuthEntitlement(String(project.owner_user_id));
    res.json({ok:true});
  }));
}
