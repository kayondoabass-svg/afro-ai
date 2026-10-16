/** Explicit, metadata-only projections. Never expose source, tokens, hashes or message bodies. */
export type RecordSection = { label: string; source: string; fields: Record<string,string>; status?: string };
const base = (table: string) => `SELECT to_jsonb(t) j FROM ${table} t`;
const text = (key: string) => `j->>'${key}'`;
export const publicationLinkSql = `SELECT DISTINCT c.project_id FROM messages m
  JOIN conversations c ON c.id=m.conversation_id JOIN projects p ON p.id=c.project_id AND p.user_id=c.user_id
  WHERE m.role='workbench-publication' AND c.user_id=a.user_id
  AND substring(m.content from '"publishedAppId"[[:space:]]*:[[:space:]]*([0-9]+)')=a.id::text
  AND substring(m.content from '"projectId"[[:space:]]*:[[:space:]]*([0-9]+)')=c.project_id::text`;
function section(label: string, table: string, keys: string[], status?: string): RecordSection {
  return {label, source:base(table), fields:Object.fromEntries(keys.map(k=>[k,text(k)])),status};
}
export const founderSections: Record<string,RecordSection> = {
  users:section("Users","users",["id","email","first_name","last_name","plan","email_verified","created_at"],"plan"),
  projects:section("Projects","projects",["id","user_id","name","type","status","created_at"],"status"),
  apps:{label:"Published apps",source:`SELECT to_jsonb(a) || jsonb_build_object('project_ids',
    (SELECT string_agg(project_id::text,', ') FROM (${publicationLinkSql}) links)) j FROM published_apps a`,
    fields:Object.fromEntries(["id","user_id","project_ids","title","subdomain","custom_domain","custom_domain_verified","app_status","suspend_reason","updated_at"].map(k=>[k,text(k)])),status:"app_status"},
  audit:section("Founder action history","founder_action_audit",["id","actor_id","action","target","created_at"]),
  domains:section("Domain orders","domain_orders",["id","user_id","domain_name","status","expiry_date","created_at"],"status"),
  chatbots:{
    label:"Chatbots",source:`SELECT to_jsonb(w) || jsonb_build_object(
      'ownership',CASE WHEN EXISTS(SELECT 1 FROM chatbot_verified_domains d WHERE d.widget_id=w.id AND d.verified_at IS NOT NULL) THEN 'verified' ELSE 'unverified' END,
      'installation',s.installation_verified,'installation_checked_at',s.installation_checked_at,
      'visitor_test',s.test_succeeded,'visitor_test_checked_at',s.test_checked_at,
      'enforcement',p.enforcement,'active_credentials',(SELECT count(*) FROM chatbot_api_credentials c WHERE c.widget_id=w.id AND c.revoked_at IS NULL),
      'status',CASE WHEN w.is_active THEN 'enabled' ELSE 'disabled' END) j
      FROM chatbot_widgets w LEFT JOIN chatbot_site_settings s ON s.widget_id=w.id LEFT JOIN chatbot_api_policy p ON p.widget_id=w.id`,
    fields:Object.fromEntries(["id","user_id","name","website_url","status","ownership","installation","installation_checked_at","visitor_test","visitor_test_checked_at","enforcement","active_credentials","conversation_count"].map(k=>[k,text(k)])),status:"status",
  },
  "email-projects":section("Email projects","email_projects",["id","user_id","name","legacy","created_at"]),
  "email-domains":{
    label:"Email sending domains",source:`SELECT to_jsonb(d) || jsonb_build_object('project_ids',
      (SELECT string_agg(g.project_id::text,', ') FROM email_project_domains g JOIN email_projects p ON p.id=g.project_id WHERE g.domain_id=d.id AND p.user_id=d.user_id)) j FROM email_api_domains d`,
    fields:Object.fromEntries(["id","user_id","project_ids","domain","status","provider","created_at"].map(k=>[k,text(k)])),status:"status",
  },
  "email-keys":{
    label:"Email key metadata",source:`SELECT to_jsonb(k) || jsonb_build_object('project_id',s.project_id,'quota_key_id',s.quota_key_id,
      'status',CASE WHEN s.revoked_at IS NOT NULL THEN 'revoked' WHEN EXISTS(SELECT 1 FROM email_key_state r WHERE r.replaces_key_id=k.id) THEN 'replaced' WHEN k.is_active THEN 'active' ELSE 'inactive' END,
      'revoked_at',s.revoked_at) j FROM email_api_keys k LEFT JOIN email_key_state s ON s.key_id=k.id`,
    fields:Object.fromEntries(["id","user_id","project_id","name","status","quota_key_id","emails_sent_month","revoked_at","created_at"].map(k=>[k,text(k)])),status:"status",
  },
  "email-logs":{
    label:"Email delivery activity",source:`SELECT to_jsonb(l) || jsonb_build_object('project_id',s.project_id) j
      FROM email_api_logs l LEFT JOIN email_key_state s ON s.key_id=l.api_key_id`,
    fields:Object.fromEntries(["id","user_id","project_id","api_key_id","status","bounce_type","sent_at","delivered_at"].map(k=>[k,text(k)])),status:"status",
  },
  ussd:section("USSD subscriptions","ussd_subscriptions",["id","user_id","plan","status","created_at"],"status"),
  marketplace:section("Marketplace","marketplace_listings",["id","user_id","title","category","downloads","created_at"]),
  blog:section("Blog","blog_posts",["id","title","slug","status","created_at"],"status"),
  subscribers:section("Email subscribers","email_subscribers",["id","user_id","email","status","subscribed_at"],"status"),
  files:section("Uploaded files","user_files",["id","user_id","filename","mimetype","size","created_at"]),
  forms:section("Forms","forms",["id","user_id","name","is_active","created_at"],"is_active"),
  webhooks:section("Webhooks","webhooks",["id","user_id","name","is_active","created_at"],"is_active"),
  payments:section("Payments","payments",["id","user_id","plan","amount","currency","status","payment_method","created_at"],"status"),
  "ai-usage":section("AI usage (recorded customer charges)","usage_logs",["id","user_id","conversation_id","kind","model","tokens_used","cost_cents","created_at"],"kind"),
  reservations:{label:"AI reservations",source:`SELECT jsonb_build_object(
    'id',m.content::jsonb->>'id','user_id',c.user_id,'project_id',c.project_id,'conversation_id',c.id,
    'status',m.content::jsonb->>'status','reserved_cents',m.content::jsonb->>'reservedCents',
    'used_tokens',m.content::jsonb->>'usedTokens','created_at',m.created_at) j
    FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.role='workbench-budget'`,
    fields:Object.fromEntries(["id","user_id","project_id","conversation_id","status","reserved_cents","used_tokens","created_at"].map(k=>[k,text(k)])),status:"status"},
};

export function projection(config: RecordSection): string {
  return Object.entries(config.fields).map(([key,expr])=>`${expr} AS "${key}"`).join(", ");
}
export function recordFilters(config: RecordSection, input: Record<string,unknown>) {
  const params: string[]=[];
  const bind=(value:string)=>{params.push(value);return `$${params.length}`;};
  const where:string[]=[];
  if(typeof input.q==="string" && input.q.trim()) {
    const p=bind(`%${input.q.trim().slice(0,160).replace(/[\\%_]/g,"\\$&")}%`);
    where.push(`(${Object.values(config.fields).map(expr=>`${expr} ILIKE ${p} ESCAPE '\\'`).join(" OR ")})`);
  }
  if(typeof input.status==="string" && input.status && config.status)
    where.push(`${config.fields[config.status]}=${bind(input.status.slice(0,80))}`);
  if(typeof input.owner==="string" && input.owner) {
    const owner=bind(input.owner.trim().slice(0,160));
    const field=config.fields.user_id || config.fields.actor_id || config.fields.id;
    where.push(`(${field}=${owner} OR ${field}=(SELECT id FROM users WHERE lower(email)=lower(${owner}) LIMIT 1))`);
  }
  if(typeof input.id==="string" && input.id)
    where.push(`${config.fields.id}=${bind(input.id.slice(0,160))}`);
  return {params,where:where.length?`WHERE ${where.join(" AND ")}`:""};
}
