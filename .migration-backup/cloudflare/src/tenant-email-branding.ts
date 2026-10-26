import { authPackage } from "../../shared/auth-packages";
import { renderAuthEmail } from "../../shared/auth-email-branding";
import { FOUNDER_EMAILS } from "../../server/founder-access";

export async function tenantBrandingEntitlement(db:any,t:any) {
  if (t.owner_user_id) {
    const owner=await db.prepare("SELECT email FROM users WHERE id=? AND tenant_id='platform'").bind(t.owner_user_id).first();
    if (FOUNDER_EMAILS.includes(String(owner?.email||"").toLowerCase()))
      return {plan:"scale",source:"founder",expires_at:null,present:true};
  }
  const row=await db.prepare("SELECT plan,source,expires_at,payment_id FROM auth_branding_entitlements WHERE owner_user_id=?").bind(t.owner_user_id).first();
  if (!row) return {plan:"free",source:"free",expires_at:null,present:false};
  if (row.expires_at!==null && row.expires_at<=Math.floor(Date.now()/1000)) return {plan:"free",source:"free",expires_at:null,expired:true,present:true};
  return {...row,plan:authPackage(row.plan).key,present:true};
}
export async function brandedTenantEmail(env:any,t:any,purpose:"verify"|"reset",url:string) {
  const entitlement=await tenantBrandingEntitlement(env.DB,t);
  const row=await env.DB.prepare("SELECT settings,sender_domain,provider_domain_id FROM tenant_email_branding WHERE tenant_id=?").bind(t.id).first();
  let senderVerified=false;
  if (row?.provider_domain_id && row?.sender_domain && ["business","scale"].includes(entitlement.plan) && env.RESEND_API_KEY) {
    // Live provider verification avoids using a removed/revoked sender identity.
    // Never retry mail or expose provider details; a lookup failure uses the platform sender.
    try {
      const response=await fetch(`https://api.resend.com/domains/${encodeURIComponent(row.provider_domain_id)}`,{
        headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`},signal:AbortSignal.timeout(5000)});
      const data=await response.json() as any;
      senderVerified=response.ok && data.status==="verified" && data.name?.toLowerCase()===row.sender_domain.toLowerCase();
    }catch{}
  }
  let settings={};
  try{settings=row ? JSON.parse(row.settings) : {};}catch{}
  return {...renderAuthEmail({name:t.name,purpose,url,plan:entitlement.plan,settings,platformFrom:env.MAIL_FROM,senderVerified}),
    senderFallback:!!row?.provider_domain_id && ["business","scale"].includes(entitlement.plan) && !senderVerified};
}
