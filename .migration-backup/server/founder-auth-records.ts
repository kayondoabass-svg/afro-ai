import fs from "node:fs";
import path from "node:path";

const configs:Record<string,{label:string;sql:string;fields:string[];status?:string}>={
  "auth-branding":{label:"Auth branding entitlements",sql:"SELECT t.id,t.owner_user_id AS user_id,t.name,t.slug,CASE WHEN e.expires_at IS NOT NULL AND e.expires_at<=unixepoch() THEN 'free' ELSE COALESCE(e.plan,'free') END AS plan,CASE WHEN e.expires_at IS NOT NULL AND e.expires_at<=unixepoch() THEN 'expired' ELSE COALESCE(e.source,'free') END AS source,e.payment_id,e.expires_at,t.created_at,CASE WHEN b.tenant_id IS NULL THEN 'standard' ELSE 'configured' END AS branding_status,b.sender_domain,b.provider_domain_id FROM tenants t LEFT JOIN auth_branding_entitlements e ON e.owner_user_id=t.owner_user_id LEFT JOIN tenant_email_branding b ON b.tenant_id=t.id WHERE t.id<>'platform'",
    fields:["id","user_id","name","slug","plan","source","payment_id","expires_at","branding_status","sender_domain","provider_domain_id","created_at"],status:"plan"},
  "auth-branding-mail":{label:"Auth email delivery",sql:"SELECT id,tenant_id,user_id,purpose,outcome,reason,message_id,created_at FROM tenant_mail_events",
    fields:["id","tenant_id","user_id","purpose","outcome","reason","message_id","created_at"],status:"outcome"},
  "auth-projects":{label:"Auth projects",sql:"SELECT id,owner_user_id AS user_id,name,slug,plan,created_at FROM tenants WHERE id<>'platform'",fields:["id","user_id","name","slug","plan","created_at"],status:"plan"},
  "auth-users":{label:"Auth users (metadata only)",sql:"SELECT id,tenant_id,email,email_verified,created_at FROM users WHERE tenant_id<>'platform'",fields:["id","tenant_id","email","email_verified","created_at"],status:"email_verified"},
  "auth-domains":{label:"Auth website ownership",sql:"SELECT id,tenant_id,domain,created_at,verified_at,last_checked_at,CASE WHEN verified_at IS NULL THEN 'pending' ELSE 'verified' END status FROM tenant_domains",fields:["id","tenant_id","domain","status","created_at","verified_at","last_checked_at"],status:"status"},
  "auth-keys":{label:"Auth key metadata",sql:"SELECT id,tenant_id,label,last_used_at,revoked_at,created_at,CASE WHEN revoked_at IS NULL THEN 'active' ELSE 'revoked' END status FROM api_keys WHERE tenant_id<>'platform'",fields:["id","tenant_id","label","status","last_used_at","revoked_at","created_at"],status:"status"},
};
export const authRecordSections=configs;
/** Separate Auth D1 identity; never fall back to project-file/customer databases. */
export async function authQuery(sql:string,params:unknown[]=[]) {
  let id=process.env.CLOUDFLARE_AUTH_D1_DATABASE_ID || process.env.AUTH_D1_DATABASE_ID;
  if(!id) {
    const toml=fs.readFileSync(path.join(process.cwd(),"cloudflare/wrangler.toml"),"utf8");
    id=toml.match(/database_name\s*=\s*"afro-ai-auth"\s*\ndatabase_id\s*=\s*"([^"]+)"/)?.[1];
  }
  const token=process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_D1_TOKEN;
  const account=process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || "fe7bcfa7be264c172e444e854a6bccbb";
  if(!id || !/^[a-f0-9-]{36}$/i.test(id) || !token) throw new Error("Auth reporting unavailable");
  const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${id}`;
  const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  const identity=await fetch(url,{headers,signal:AbortSignal.timeout(6000)}).then(r=>r.json()) as any;
  if(!identity.success || identity.result?.name!=="afro-ai-auth" || identity.result?.uuid!==id) throw new Error("Auth reporting unavailable");
  const response=await fetch(`${url}/query`,{method:"POST",headers,body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(8000)});
  const data=await response.json() as any;
  if(!response.ok || !data.success || !data.result?.[0]?.success) throw new Error("Auth reporting unavailable");
  return data.result[0].results as Record<string,unknown>[];
}
export async function authRecords(section:string,input:Record<string,unknown>,countOnly=false) {
  const c=configs[section];
  if(!c) throw new Error("Unknown Auth report");
  const clauses:string[]=[],params:unknown[]=[];
  if(typeof input.q==="string" && input.q.trim()) {
    clauses.push(`(${c.fields.map(f=>`CAST("${f}" AS TEXT) LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    params.push(...c.fields.map(()=>`%${(input.q as string).trim().slice(0,160).replace(/[\\%_]/g,"\\$&")}%`));
  }
  if(typeof input.status==="string" && input.status && c.status) {clauses.push(`CAST("${c.status}" AS TEXT)=?`);params.push(input.status.slice(0,80));}
  if(typeof input.id==="string" && input.id) {clauses.push("id=?");params.push(input.id.slice(0,160));}
  if(typeof input.owner==="string" && input.owner) {
    // A tenant-owned user/domain/key must join through the tenant's platform owner.
    clauses.push(["auth-projects","auth-branding"].includes(section)?"user_id=?":"tenant_id IN (SELECT id FROM tenants WHERE owner_user_id=?)");
    params.push(input.owner.slice(0,160));
  }
  const where=clauses.length?`WHERE ${clauses.join(" AND ")}`:"";
  const total=Number((await authQuery(`SELECT count(*) total FROM (${c.sql}) records ${where}`,params))[0]?.total);
  if(countOnly) return {total};
  const page=Math.min(100000,Math.max(1,Number.parseInt(String(input.page),10)||1));
  const rows=await authQuery(`SELECT * FROM (${c.sql}) records ${where} ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET ?`,[...params,(page-1)*25]);
  const statuses=c.status?(await authQuery(`SELECT DISTINCT CAST("${c.status}" AS TEXT) status FROM (${c.sql}) records ORDER BY status LIMIT 50`)).map(r=>String(r.status)):[];
  return {section,label:c.label,columns:c.fields.map(key=>({key,label:key.replaceAll("_"," ")})),
    rows:rows.map(row=>Object.fromEntries(c.fields.map(key=>[key,row[key] ?? null]))),
    page,pageSize:25,total,statuses,checkedAt:new Date().toISOString()};
}
