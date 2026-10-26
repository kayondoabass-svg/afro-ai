import { API_VERSION } from "../../shared/api-version-policy";

async function upgradeSummary(c: any, tenant: any) {
  const db = c.env.DB;
  const choice = await db.prepare("SELECT selected_contract,selected_at FROM tenant_api_adoptions WHERE tenant_id=?").bind(tenant.id).first();
  const users = await db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(email_verified=1),0) AS verified FROM users WHERE tenant_id=?").bind(tenant.id).first();
  const keys = await db.prepare("SELECT COUNT(*) AS n FROM api_keys WHERE tenant_id=? AND revoked_at IS NULL").bind(tenant.id).first();
  const origin = new URL(c.env.APP_URL || "https://afroaigroup.com").origin;
  const slug = encodeURIComponent(tenant.slug);
  return {
    projectId:tenant.id,projectSlug:tenant.slug,supportedVersions:[API_VERSION],legacyAvailable:true,
    selectedContract:choice?.selected_contract ?? null,selectedAt:choice?.selected_at ?? null,
    dataStrategy:"reuse-existing-project",storage:"D1",userFolder:`projects/${tenant.id}/users`,
    users:{total:users.total,verified:users.verified,unverified:users.total-users.verified},
    activeKeys:keys.n,urls:{legacy:`${origin}/cf-auth/t/${slug}`,v1:`${origin}/cf-auth/v1/t/${slug}`},
    preserves:["userIds","passwordHashes","verificationStatus","apiKeys","sessions"],
    requiresDataCopy:false,
  };
}

export function registerTenantApiUpgrade(app: any, ownedTenant: (c: any,id: string) => Promise<any>) {
  const path = "/v1/admin/tenants/:id/api-upgrade";
  app.get(path, async (c: any) => {
    const tenant = await ownedTenant(c,c.req.param("id")); if (tenant instanceof Response) return tenant;
    c.header("Cache-Control","no-store");
    return c.json(await upgradeSummary(c,tenant));
  });
  app.post(path, async (c: any) => {
    const tenant = await ownedTenant(c,c.req.param("id")); if (tenant instanceof Response) return tenant;
    const body = await c.req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({message:"Send a JSON object with your chosen contract."},400);
    if (!["legacy",API_VERSION].includes(body.contract)) return c.json({code:"UNSUPPORTED_API_VERSION",message:"Choose the existing API or v1. V2 is not supported.",supportedVersions:[API_VERSION]},400);
    if (body.confirmPreserveData !== true) return c.json({message:"Confirm that this changes your integration preference only and keeps existing project data."},400);
    // Deliberately do not update tenants, users, keys, sessions or activation policy.
    await c.env.DB.prepare("INSERT INTO tenant_api_adoptions (tenant_id,selected_contract,selected_at) VALUES (?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET selected_contract=excluded.selected_contract,selected_at=excluded.selected_at")
      .bind(tenant.id,body.contract,Math.floor(Date.now()/1000)).run();
    c.header("Cache-Control","no-store");
    return c.json(await upgradeSummary(c,tenant));
  });
}
