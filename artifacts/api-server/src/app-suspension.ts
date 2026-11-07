import { pool } from "./db";
import { sendEmail, EmailProviderError } from "./email-provider";
import { checkResendDelivery } from "../shared/mail-delivery-status";
import { FREE_HOSTING_DAYS, FREE_HOSTING_EXPIRY_REASON, suspensionNotice, suspensionReason, hostingExpiryNotice } from "./app-suspension-policy";
import { FOUNDER_EMAILS } from "./founder-access";

/** Additive audit/outbox: no app/project/source rows are removed or backdated. */
export const APP_SUSPENSION_SCHEMA = `
CREATE TABLE IF NOT EXISTS app_status_events (
 id bigserial PRIMARY KEY,app_id integer NOT NULL,user_id varchar NOT NULL,
 action text NOT NULL,reason text NOT NULL,actor_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),email_status text NOT NULL DEFAULT 'pending',
 email_error text,provider text,provider_message_id text
);
CREATE INDEX IF NOT EXISTS app_status_events_app_idx ON app_status_events(app_id,id DESC);
CREATE INDEX IF NOT EXISTS app_status_events_pending_idx ON app_status_events(email_status,id);
CREATE UNIQUE INDEX IF NOT EXISTS app_status_events_hosting_warning_once
 ON app_status_events(app_id) WHERE action='hosting_expiry_warning';
`;
export async function prepareAppSuspensions() {
  await pool.query(APP_SUSPENSION_SCHEMA);
  // A process may have died after sending; never automatically send that message again.
  await pool.query(`UPDATE app_status_events SET email_status='uncertain',
    email_error='Sending was interrupted. Delivery is unconfirmed; no automatic resend was made.'
    WHERE email_status='sending' AND created_at < now()-interval '10 minutes'`);
}

export class AppStatusConflict extends Error {}
type Selection = { appId?: number; userId?: string; expiredOnly?: boolean; expirySuspensionsOnly?: boolean };
export async function changeAppStatus(selection: Selection, action: "suspended" | "reactivated", rawReason: string, actorId: string) {
  const reason = suspensionReason(rawReason);
  if (!selection.appId && !selection.userId && !selection.expiredOnly) throw new Error("App selection is required.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const params: unknown[] = [];
    const where = [action === "suspended" ? "a.app_status='active'" : "a.app_status='suspended'"];
    if (selection.appId) { params.push(selection.appId); where.push(`a.id=$${params.length}`); }
    if (selection.userId) { params.push(selection.userId); where.push(`a.user_id=$${params.length}`); }
    if (selection.expirySuspensionsOnly) {
      params.push(FREE_HOSTING_EXPIRY_REASON);
      where.push(`a.suspend_reason=$${params.length}`);
    }
    if (selection.expiredOnly) {
      params.push(FOUNDER_EMAILS.map(e => e.toLowerCase()));
      where.push(`u.plan='starter' AND lower(coalesce(u.email,''))<>ALL($${params.length}::text[])`,
        `a.created_at < now()-interval '${FREE_HOSTING_DAYS} days'`);
    }
    const { rows } = await client.query(`SELECT a.id,a.user_id,a.suspend_reason FROM published_apps a
      JOIN users u ON u.id=a.user_id WHERE ${where.join(" AND ")} FOR UPDATE OF a`, params);
    let changed = 0;
    for (const app of rows) {
      if (selection.expiredOnly) {
        // Read again after taking the app lock: a concurrent completed upgrade must not be expired.
        const user = (await client.query("SELECT plan,email FROM users WHERE id=$1", [app.user_id])).rows[0];
        if (user?.plan !== "starter" || FOUNDER_EMAILS.includes(String(user.email || "").trim().toLowerCase())) continue;
      }
      // Pending deletion/unpublishing cannot be undone by the suspension controls.
      if (action === "reactivated" && ["deletion-pending", "unpublish-pending", "customer-unpublished"].includes(app.suspend_reason))
        throw new AppStatusConflict("Finish the app's existing publication or cleanup operation instead.");
      await client.query(`UPDATE published_apps SET app_status=$2,suspend_reason=$3,suspended_at=$4,updated_at=now() WHERE id=$1`,
        [app.id, action === "suspended" ? "suspended" : "active", action === "suspended" ? reason : null, action === "suspended" ? new Date() : null]);
      await client.query(`INSERT INTO app_status_events(app_id,user_id,action,reason,actor_id,email_status)
        VALUES($1,$2,$3,$4,$5,$6)`,
        [app.id, app.user_id, action, reason, actorId, action === "suspended" ? "pending" : "not_requested"]);
      changed++;
    }
    await client.query("COMMIT");
    return changed;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
export const expireFreeHosting = () => changeAppStatus(
  { expiredOnly: true }, "suspended", FREE_HOSTING_EXPIRY_REASON, "system:free-hosting-expiry");

/** One additive reminder per app, only while its existing free-hosting period is still active. */
export async function queueHostingExpiryWarnings() {
  return pool.query(`WITH candidates AS (
    SELECT a.id,a.user_id FROM published_apps a JOIN users u ON u.id=a.user_id
    WHERE a.app_status='active' AND u.plan='starter'
      AND lower(coalesce(u.email,''))<>ALL($1::text[])
      AND a.created_at<=now()-interval '27 days' AND a.created_at>now()-interval '30 days'
      AND NOT EXISTS(SELECT 1 FROM app_status_events e WHERE e.app_id=a.id AND e.action='hosting_expiry_warning')
    ORDER BY a.id LIMIT 20 FOR UPDATE OF a SKIP LOCKED
  ) INSERT INTO app_status_events(app_id,user_id,action,reason,actor_id,email_status)
    SELECT id,user_id,'hosting_expiry_warning','The existing 30-day free public-hosting deadline is approaching.',
    'system:free-hosting-reminder','pending' FROM candidates ON CONFLICT DO NOTHING`,
    [FOUNDER_EMAILS.map(email => email.toLowerCase())]);
}

/** Claims persist before contacting a provider. Concurrent workers cannot send the same event. */
export async function processAppSuspensionEmails() {
  const { rows } = await pool.query(`UPDATE app_status_events SET email_status='sending'
    WHERE id IN (SELECT id FROM app_status_events WHERE email_status='pending' ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED)
    AND email_status='pending' RETURNING id,app_id,user_id,reason,action,created_at`);
  for (const event of rows) {
    try {
      const owner = (await pool.query("SELECT email,plan FROM users WHERE id=$1", [event.user_id])).rows[0];
      const app = (await pool.query("SELECT id,title,created_at,app_status FROM published_apps WHERE id=$1 AND user_id=$2", [event.app_id, event.user_id])).rows[0];
      if (!owner?.email || !app) {
        await pool.query("UPDATE app_status_events SET email_status='failed',email_error=$2 WHERE id=$1",
          [event.id, "The app or its owner's email address is unavailable."]);
        continue;
      }
      if (event.action === "hosting_expiry_warning" && (owner.plan !== "starter" || app.app_status !== "active")) {
        await pool.query("UPDATE app_status_events SET email_status='skipped',email_error=$2 WHERE id=$1",
          [event.id, "Hosting status changed; this reminder is no longer applicable."]);
        continue;
      }
      const notice = event.action === "hosting_expiry_warning" ? hostingExpiryNotice(app) : suspensionNotice(app, event.reason, new Date(event.created_at));
      const result = await sendEmail({
        from: process.env.EMAIL_FROM || "Afro AI <noreply@afroaigroup.com>", to: owner.email,
        ...notice, idempotencyKey: `app-suspension-${event.id}`,
      });
      await pool.query(`UPDATE app_status_events SET email_status='accepted',provider=$2,provider_message_id=$3,email_error=$4 WHERE id=$1`,
        [event.id, result.provider, result.messageId,
          result.provider === "ses" ? "Provider accepted the message; inbox delivery has not been confirmed." : null]);
    } catch (error) {
      const uncertain = !(error instanceof EmailProviderError) || error.uncertain;
      await pool.query("UPDATE app_status_events SET email_status=$2,email_error=$3 WHERE id=$1", [
        event.id, uncertain ? "uncertain" : "failed",
        uncertain ? "Provider acceptance could not be confirmed. No automatic resend was made."
          : "The email provider rejected this notification. Check platform sender configuration or sending limits.",
      ]);
    }
  }
  // Existing safe provider lookup strips message bodies/links and distinguishes sent from delivered.
  const accepted = await pool.query(`SELECT id,provider_message_id FROM app_status_events
    WHERE provider='resend' AND provider_message_id IS NOT NULL
    AND email_status IN ('accepted','queued','sent','scheduled','delivery_delayed')
    AND created_at>now()-interval '7 days' ORDER BY id DESC LIMIT 20`);
  for (const event of accepted.rows) {
    const result = await checkResendDelivery(event.provider_message_id, process.env.RESEND_API_KEY);
    await pool.query(`UPDATE app_status_events SET email_status=coalesce($2,email_status),email_error=$3 WHERE id=$1`,
      [event.id, result.status, result.error]);
  }
}
let running = false;
export function startAppSuspensionEmails() {
  const tick = async () => {
    if (running) return;
    running = true;
    try { await queueHostingExpiryWarnings(); await processAppSuspensionEmails(); }
    catch { console.error("[app-suspension] Notification processing unavailable; review founder app details."); }
    finally { running = false; }
  };
  void tick();
  setInterval(tick, 60_000).unref();
}
