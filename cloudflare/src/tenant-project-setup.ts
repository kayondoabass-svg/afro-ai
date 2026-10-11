import { normalizeSendingDomain } from "../../shared/customer-api-setup";

const now = () => Math.floor(Date.now() / 1000);
export async function tenantSetup(db: any, tenant: any) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM tenant_domains WHERE tenant_id=? AND verified_at IS NOT NULL").bind(tenant.id).first();
  return { required: !!tenant.setup_required, canCreateKeys: row.n > 0, verifiedDomainCount: row.n, userStore: "D1", userFolder: `projects/${tenant.id}/users` };
}
export async function tenantIsActive(db: any, tenant: any) {
  return !tenant.setup_required || (await tenantSetup(db, tenant)).verifiedDomainCount > 0;
}
export function domainInstructions(row: any) {
  return { id: row.id, domain: row.domain, status: row.verified_at == null ? "pending" : "verified",
    created_at: row.created_at, verified_at: row.verified_at, last_checked_at: row.last_checked_at,
    verification: {type:"TXT", name:`_afro-auth.${row.domain}`, value:`afro-auth-verification=${row.challenge}`, ttl:300} };
}
export function txtAnswerMatches(answer: any, name: string, expected: string) {
  if (answer.type !== 16 || String(answer.name).replace(/\.$/, "").toLowerCase() !== name.toLowerCase()) return false;
  const data = String(answer.data || "");
  try {
    const chunks = data.match(/"(?:\\.|[^"\\])*"/g);
    return chunks ? chunks.map(value => JSON.parse(value)).join("") === expected : data === expected;
  } catch { return false; }
}
export async function checkDomainDns(row: any) {
  const instruction = domainInstructions(row).verification;
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", instruction.name); url.searchParams.set("type", "TXT");
  const response = await fetch(url, {headers:{Accept:"application/dns-json"}, redirect:"manual", signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error("DNS resolver unavailable");
  const body: any = await response.json();
  if (body.Status !== 0 && body.Status !== 3) throw new Error("DNS lookup unavailable");
  return (body.Answer || []).some((answer: any) => txtAnswerMatches(answer, instruction.name, instruction.value));
}
type Dependencies = {
  ownedTenant: (c: any, id: string) => Promise<any>;
  sendVerification: (c: any, tenant: any, user: any) => Promise<any>;
};
export function registerTenantSetup(app: any, deps: Dependencies) {
  const base = "/v1/admin/tenants/:id";
  app.get(`${base}/domains`, async (c: any) => {
    const tenant = await deps.ownedTenant(c, c.req.param("id")); if (tenant instanceof Response) return tenant;
    const rows = await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE tenant_id=? ORDER BY created_at DESC").bind(tenant.id).all();
    return c.json({domains:rows.results.map(domainInstructions)});
  });
  app.post(`${base}/domains`, async (c: any) => {
    const tenant = await deps.ownedTenant(c, c.req.param("id")); if (tenant instanceof Response) return tenant;
    const body = await c.req.json().catch(() => ({}));
    let domain: string;
    try { domain = normalizeSendingDomain(body.domain); } catch { return c.json({message:"Enter a bare website domain, such as example.com. No https://, email addresses or paths."}, 400); }
    const existing = await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE tenant_id=? AND domain=?").bind(tenant.id, domain).first();
    if (existing) return c.json(domainInstructions(existing));
    const row = {id:crypto.randomUUID(), tenant_id:tenant.id, domain, challenge:crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""), created_at:now(), verified_at:null, last_checked_at:null};
    const result = await c.env.DB.prepare("INSERT OR IGNORE INTO tenant_domains (id,tenant_id,domain,challenge,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM tenant_domains WHERE tenant_id=?)<10")
      .bind(row.id, tenant.id, domain, row.challenge, row.created_at, tenant.id).run();
    if (!result.meta.changes) return c.json({message:"This project can have up to 10 domains. Refresh or remove an unused domain."}, 409);
    return c.json(domainInstructions(row), 201);
  });
  app.post(`${base}/domains/:domainId/verify`, async (c: any) => {
    const tenant = await deps.ownedTenant(c, c.req.param("id")); if (tenant instanceof Response) return tenant;
    const row = await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE id=? AND tenant_id=?").bind(c.req.param("domainId"), tenant.id).first();
    if (!row) return c.json({message:"Domain not found."}, 404);
    const ts = now();
    const claim = await c.env.DB.prepare("UPDATE tenant_domains SET last_checked_at=? WHERE id=? AND tenant_id=? AND (last_checked_at IS NULL OR last_checked_at<=?)")
      .bind(ts, row.id, tenant.id, ts - 15).run();
    if (!claim.meta.changes) return c.json({message:"Please wait 15 seconds before checking DNS again."}, 429);
    let verified: boolean;
    try { verified = await checkDomainDns(row); } catch { return c.json({message:"DNS could not be checked. Your domain has not been newly verified; try again later."}, 503); }
    await c.env.DB.prepare("UPDATE tenant_domains SET verified_at=? WHERE id=? AND tenant_id=?").bind(verified ? ts : null, row.id, tenant.id).run();
    if (verified) {
      // D1 JSON updates avoid overwriting concurrent settings changes.
      await c.env.DB.prepare(`UPDATE tenants SET allowed_origins=json_insert(COALESCE(allowed_origins,'[]'),'$[#]',?),updated_at=?
        WHERE id=? AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(allowed_origins,'[]')) WHERE value=?)
        AND json_array_length(COALESCE(allowed_origins,'[]'))<10`)
        .bind(`https://${row.domain}`, ts, tenant.id, `https://${row.domain}`).run();
    }
    return c.json({verified,domain:domainInstructions({...row,verified_at:verified ? ts : null,last_checked_at:ts}),
      message:verified ? "Domain ownership verified. You can now generate API keys." : "TXT record not found yet. Check its exact name and value, then wait for DNS propagation and retry."});
  });
  app.delete(`${base}/domains/:domainId`, async (c: any) => {
    const tenant = await deps.ownedTenant(c, c.req.param("id")); if (tenant instanceof Response) return tenant;
    const row = await c.env.DB.prepare("SELECT * FROM tenant_domains WHERE id=? AND tenant_id=?").bind(c.req.param("domainId"), tenant.id).first();
    if (!row) return c.json({message:"Domain not found."}, 404);
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM tenant_domains WHERE id=? AND tenant_id=?").bind(row.id, tenant.id),
      // Operate on current JSON inside the transaction; concurrent settings aren't overwritten.
      c.env.DB.prepare(`UPDATE tenants SET allowed_origins=(SELECT json_group_array(value) FROM json_each(COALESCE(allowed_origins,'[]'))
        WHERE value != ? AND value NOT LIKE ? AND value NOT LIKE ? AND value NOT LIKE ?),updated_at=? WHERE id=?`)
        .bind(`https://${row.domain}`, `https://${row.domain}:%`, `https://%.${row.domain}`, `https://%.${row.domain}:%`, now(), tenant.id),
    ]);
    return c.json({ok:true});
  });
  app.post(`${base}/users/:userId/send-verification`, async (c: any) => {
    const tenant = await deps.ownedTenant(c, c.req.param("id")); if (tenant instanceof Response) return tenant;
    const user = await c.env.DB.prepare("SELECT id,email,email_verified FROM users WHERE id=? AND tenant_id=?").bind(c.req.param("userId"), tenant.id).first();
    if (!user) return c.json({message:"User not found."}, 404);
    if (user.email_verified) return c.json({message:"This user's email is already verified."}, 409);
    try {
      const result = await deps.sendVerification(c, tenant, user);
      if (result?.sent === false) return c.json({message:result.rateLimited ? "Too many verification requests for this project. Please wait before sending more." : "A verification email was recently requested. Wait one minute before resending."}, 429);
      return c.json({ok:true,message:"Verification email accepted for delivery. The user remains unverified until they confirm the link."});
    } catch { return c.json({message:"Verification email could not be delivered. The user is still unverified. Try again after one minute or contact support."}, 503); }
  });
}
