const now = () => Math.floor(Date.now()/1000);

export async function saveMailEvent(env: any, context: any, fields: any) {
  if (!env.DB) return; // Isolated sender unit tests may omit persistence.
  await env.DB.prepare(`INSERT INTO tenant_mail_events
    (id,tenant_id,user_id,purpose,outcome,reason,message_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      outcome=excluded.outcome,reason=excluded.reason,message_id=excluded.message_id,updated_at=excluded.updated_at`)
    .bind(context.attemptId,context.tenantId,context.userId,context.purpose,fields.outcome,fields.reason||null,fields.messageId||null,now(),now()).run();
}

const messages: Record<string,string> = {
  available:"Provider credential responded successfully. This is not proof of email delivery.",
  invalid_credential:"The platform email credential was rejected. Contact Afro Auth support; do not replace your project key.",
  limited:"The credential cannot inspect provider configuration. Sending and inbox delivery have not been verified by this check.",
  unavailable:"The email provider could not be checked. No email was sent and no automatic retry was made.",
  unconfigured:"The platform email transport is not configured. Contact Afro Auth support.",
};
export async function checkTenantMailHealth(env: any) {
  let row = await env.DB.prepare("SELECT status,checked_at FROM tenant_mail_health WHERE id=1").first();
  if (!row || now()-row.checked_at>=300) {
    let status = "unconfigured";
    if (env.RESEND_API_KEY) {
      try {
        const response = await fetch("https://api.resend.com/domains?limit=1",{
          headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`},signal:AbortSignal.timeout(8000),
        });
        status=response.ok ? "available" : response.status===401 ? "invalid_credential" : response.status===403 ? "limited" : "unavailable";
      } catch { status="unavailable"; }
    }
    row={status,checked_at:now()};
    await env.DB.prepare(`INSERT INTO tenant_mail_health(id,status,checked_at) VALUES(1,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at`)
      .bind(status,row.checked_at).run();
    if (status==="invalid_credential" || status==="unconfigured") console.error(JSON.stringify({event:"tenant_mail_health_alert",status}));
  }
  return {status:row.status,checkedAt:row.checked_at,message:messages[row.status] || messages.unavailable};
}

export function registerTenantMailStatus(app: any, ownedTenant: (c:any,id:string)=>Promise<any>) {
  const route="/v1/admin/tenants/:id/mail-status";
  const serve = async(c:any,refresh:boolean) => {
    const tenant=await ownedTenant(c,c.req.param("id"));
    if (tenant instanceof Response) return tenant;
    c.header("Cache-Control","private, no-store");
    if (refresh && envKey(c.env)) {
      // Read-only upstream retrieval. Never resend verification or recovery mail.
      const rows=await c.env.DB.prepare(`SELECT id,message_id FROM tenant_mail_events
        WHERE tenant_id=? AND outcome IN ('accepted','delivery_delayed','unknown') AND message_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 10`).bind(tenant.id).all();
      await Promise.all((rows.results || []).map(async(row:any)=>{
        try {
          const response=await fetch(`https://api.resend.com/emails/${encodeURIComponent(row.message_id)}`,{
            headers:{Authorization:`Bearer ${c.env.RESEND_API_KEY}`},signal:AbortSignal.timeout(8000),
          });
          if (!response.ok) return;
          const body:any=await response.json();
          const outcome=body.last_event;
          if (!["delivered","bounced","complained","delivery_delayed"].includes(outcome)) return;
          await c.env.DB.prepare("UPDATE tenant_mail_events SET outcome=?,updated_at=? WHERE id=? AND tenant_id=?")
            .bind(outcome,now(),row.id,tenant.id).run();
        } catch { /* Preserve last known status. A failed lookup is not delivery evidence. */ }
      }));
    }
    const health=await checkTenantMailHealth(c.env);
    const events=await c.env.DB.prepare(`SELECT id,user_id,purpose,outcome,reason,message_id,created_at,updated_at
      FROM tenant_mail_events WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50`).bind(tenant.id).all();
    return c.json({health,events:events.results || []});
  };
  app.get(route,(c:any)=>serve(c,false));
  app.post(`${route}/refresh`,async(c:any)=>{
    // Existing admin authentication/origin policy applies, and no sends occur.
    return serve(c,true);
  });
}
const envKey = (env:any) => typeof env.RESEND_API_KEY==="string" && !!env.RESEND_API_KEY;
