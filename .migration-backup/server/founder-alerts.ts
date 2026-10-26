import type { Express, RequestHandler } from "express";
import type { PoolClient } from "pg";
import { pool } from "./db";
import { sendEmail } from "./email-provider";
import { FOUNDER_EMAIL } from "./replit_integrations/auth";
import type { founderOverview } from "./founder-oversight";
import { isManagementOrigin } from "./project-infrastructure/routes";

type Overview=Awaited<ReturnType<typeof founderOverview>>;
export const FOUNDER_ALERT_SCHEMA=`
CREATE TABLE IF NOT EXISTS founder_alert_preferences (
 user_id varchar PRIMARY KEY REFERENCES users(id),enabled boolean NOT NULL DEFAULT false,
 recipient_ids jsonb NOT NULL DEFAULT '[]',last_checked_at timestamptz,last_error text
);
CREATE TABLE IF NOT EXISTS founder_alert_history (
 user_id varchar NOT NULL REFERENCES users(id),alert_id text NOT NULL,title text NOT NULL,
 severity text NOT NULL,section text NOT NULL,state text NOT NULL DEFAULT 'open',
 opened_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,acknowledged_at timestamptz,
 PRIMARY KEY(user_id,alert_id)
);
CREATE TABLE IF NOT EXISTS founder_alert_deliveries (
 user_id varchar NOT NULL,alert_id text NOT NULL,opened_at timestamptz NOT NULL,
 recipient text NOT NULL,status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,alert_id,opened_at,recipient)
);
CREATE TABLE IF NOT EXISTS founder_action_audit (
 id bigserial PRIMARY KEY,actor_id varchar NOT NULL,action text NOT NULL,target text,
 created_at timestamptz NOT NULL DEFAULT now()
);`;

/** Additive setup, with a read-only fast path for already provisioned installations. */
export async function prepareFounderAlerts() {
  const {rows}=await pool.query("SELECT bool_and(to_regclass(t) IS NOT NULL) ready FROM unnest($1::text[]) t",
    [["founder_alert_preferences","founder_alert_history","founder_alert_deliveries","founder_action_audit"]]);
  if(rows[0]?.ready) return;
  await pool.query(FOUNDER_ALERT_SCHEMA);
}

async function audit(actor:string,action:string,target:string) {
  await pool.query("INSERT INTO founder_action_audit(actor_id,action,target) VALUES($1,$2,$3)",[actor,action,target]);
}
/** Metadata only; existing management routes keep their own authorization and confirmations. */
export const auditFounderAction:RequestHandler=(req:any,res,next)=>{
  if(!["POST","PUT","PATCH","DELETE"].includes(req.method)) return next();
  res.once("finish",()=>{
    const actor=req.user?.claims?.sub,route=req.route?.path;
    if(typeof actor!=="string" || !actor || typeof route!=="string" || res.statusCode<200 || res.statusCode>=300) return;
    if(route.includes("/alert-settings") || route.includes("/acknowledge")) return; // Already transactionally audited.
    const candidate=String(req.params?.id || req.params?.userId || "");
    const target=/^[a-z0-9_-]{1,160}$/i.test(candidate)?candidate:"";
    void audit(actor,`${req.method} ${route}`,target).catch(()=>console.error("[founder-audit] Could not record management action"));
  });
  next();
};
export async function syncFounderAlerts(owner:string,overview:Overview) {
  // An unavailable check is not proof that an earlier operational fault resolved.
  const current=overview.alerts.flatMap(a=>a.id.startsWith("check-")?[a.id,a.id.slice(6)]:[a.id]);
  for(const a of overview.alerts) {
    await pool.query(`INSERT INTO founder_alert_history(user_id,alert_id,title,severity,section) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(user_id,alert_id) DO UPDATE SET title=EXCLUDED.title,severity=EXCLUDED.severity,section=EXCLUDED.section,
      opened_at=CASE WHEN founder_alert_history.state='resolved' THEN now() ELSE founder_alert_history.opened_at END,
      acknowledged_at=CASE WHEN founder_alert_history.state='resolved' THEN NULL ELSE founder_alert_history.acknowledged_at END,
      resolved_at=NULL,state='open'`,[owner,a.id,a.title,a.severity,a.section]);
  }
  await pool.query(`UPDATE founder_alert_history SET state='resolved',resolved_at=now()
    WHERE user_id=$1 AND state='open' AND NOT(alert_id=ANY($2::text[]))`,[owner,current]);
}
function validPreferences(body:any):body is {enabled:boolean;recipientIds:number[]} {
  return typeof body?.enabled==="boolean" && Array.isArray(body.recipientIds) && body.recipientIds.length<=50 &&
    body.recipientIds.every((id:unknown)=>Number.isSafeInteger(id) && Number(id)>0);
}
export function registerFounderAlerts(app:Express,isFounder:RequestHandler,overview:()=>Promise<Overview>) {
  const noCache:RequestHandler=(_req,res,next)=>{res.set("Cache-Control","private, no-store");next();};
  const managementOrigin:RequestHandler=(req,res,next)=>{
    if(!isManagementOrigin(req.get("Origin"))) return res.status(403).json({error:"Use the platform dashboard for this action."});
    next();
  };
  app.get("/api/founder/alert-settings",isFounder,noCache,async(req:any,res)=>{
    try {
      const owner=req.user.claims.sub;
      const prefs=(await pool.query("SELECT * FROM founder_alert_preferences WHERE user_id=$1",[owner])).rows[0];
      const members=(await pool.query("SELECT id,name,email FROM team_members WHERE status='active' ORDER BY name")).rows;
      res.json({enabled:prefs?.enabled===true,recipientIds:prefs?.recipient_ids || [],members,
        lastCheckedAt:prefs?.last_checked_at || null,lastError:prefs?.last_error || null});
    } catch {res.status(503).json({error:"Notification settings unavailable."});}
  });
  app.put("/api/founder/alert-settings",isFounder,noCache,managementOrigin,async(req:any,res)=>{
    if(!validPreferences(req.body)) return res.status(400).json({error:"Choose valid notification settings and active team members."});
    const owner=req.user.claims.sub,ids=Array.from(new Set<number>(req.body.recipientIds));
    let client:PoolClient|undefined;
    try {
      client=await pool.connect();
      await client.query("BEGIN");
      const matches=await client.query("SELECT id FROM team_members WHERE id=ANY($1::int[]) AND status='active' FOR SHARE",[ids]);
      if(matches.rows.length!==ids.length) {await client.query("ROLLBACK");return res.status(400).json({error:"One or more team members are no longer active."});}
      await client.query(`INSERT INTO founder_alert_preferences(user_id,enabled,recipient_ids) VALUES($1,$2,$3::jsonb)
        ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,recipient_ids=EXCLUDED.recipient_ids,last_error=NULL`,
        [owner,req.body.enabled,JSON.stringify(ids)]);
      await client.query("INSERT INTO founder_action_audit(actor_id,action,target) VALUES($1,'alert-settings','notifications')",[owner]);
      await client.query("COMMIT");
      res.json({ok:true});
    } catch {await client?.query("ROLLBACK").catch(()=>{});res.status(503).json({error:"Notification settings were not saved. Please retry."});}
    finally {client?.release();}
  });
  app.get("/api/founder/alert-history",isFounder,noCache,async(req:any,res)=>{
    try {
      await syncFounderAlerts(req.user.claims.sub,await overview());
      const rows=(await pool.query(`SELECT alert_id,title,severity,section,state,opened_at,resolved_at,acknowledged_at
        FROM founder_alert_history WHERE user_id=$1 ORDER BY opened_at DESC LIMIT 100`,[req.user.claims.sub])).rows;
      res.json({rows});
    } catch {res.status(503).json({error:"Alert history unavailable."});}
  });
  app.post("/api/founder/alerts/:id/acknowledge",isFounder,noCache,managementOrigin,async(req:any,res)=>{
    try {
      const changed=await pool.query(`UPDATE founder_alert_history SET acknowledged_at=now()
        WHERE user_id=$1 AND alert_id=$2 AND state='open' RETURNING alert_id`,[req.user.claims.sub,req.params.id]);
      if(!changed.rows.length) return res.status(404).json({error:"Open alert not found."});
      await audit(req.user.claims.sub,"acknowledge-alert",req.params.id);
      res.json({ok:true});
    } catch {res.status(503).json({error:"Alert acknowledgement failed."});}
  });
}

let running=false;
/** Opt-in, metadata-only notifications. Record attempted delivery BEFORE dispatch; never auto-retry ambiguous sends. */
export async function pollFounderAlerts(overview:()=>Promise<Overview>,sender=sendEmail) {
  if(running) return;
  running=true;
  try {
    const prefs=(await pool.query("SELECT user_id,recipient_ids FROM founder_alert_preferences WHERE enabled=true")).rows;
    if(!prefs.length) return;
    const data=await overview();
    for(const pref of prefs) {
      await syncFounderAlerts(pref.user_id,data);
      const team=(await pool.query("SELECT email FROM team_members WHERE id=ANY($1::int[]) AND status='active'",[pref.recipient_ids])).rows;
      const recipients=Array.from(new Set<string>([FOUNDER_EMAIL,...team.map(r=>r.email)].filter(Boolean)));
      const alerts=(await pool.query(`SELECT alert_id,title,opened_at FROM founder_alert_history
        WHERE user_id=$1 AND state='open' AND acknowledged_at IS NULL`,[pref.user_id])).rows;
      let deliveryIssue=false;
      for(const alert of alerts) for(const recipient of recipients) {
        const claimed=await pool.query(`INSERT INTO founder_alert_deliveries(user_id,alert_id,opened_at,recipient,status)
          VALUES($1,$2,$3,$4,'attempted') ON CONFLICT DO NOTHING RETURNING alert_id`,
          [pref.user_id,alert.alert_id,alert.opened_at,recipient]);
        if(!claimed.rows.length) continue;
        let status="sent";
        try {
          await sender({from:process.env.EMAIL_FROM || process.env.EMAIL_API_DEMO_FROM || "noreply@afroaigroup.com",to:recipient,
            subject:"Afro AI founder alert",text:`${alert.title}\n\nOpen the Founder Dashboard to inspect this alert. No customer content or credentials are included in this notification.`});
        } catch {status="uncertain";deliveryIssue=true;}
        await pool.query(`UPDATE founder_alert_deliveries SET status=$5 WHERE user_id=$1 AND alert_id=$2 AND opened_at=$3 AND recipient=$4`,
          [pref.user_id,alert.alert_id,alert.opened_at,recipient,status]);
      }
      await pool.query(`UPDATE founder_alert_preferences SET last_checked_at=now(),last_error=$2 WHERE user_id=$1`,
        [pref.user_id,deliveryIssue?"A notification outcome is uncertain. It will not be retried automatically.":null]);
    }
  } catch {console.error("[founder-alerts] Notification check unavailable");}
  finally {running=false;}
}
export function startFounderAlertMonitor(overview:()=>Promise<Overview>) {
  const timer=setInterval(()=>void pollFounderAlerts(overview),5*60_000);
  timer.unref();
}
