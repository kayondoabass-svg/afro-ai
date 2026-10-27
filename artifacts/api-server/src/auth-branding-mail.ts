import { pool } from "./db";
import { authQuery } from "./founder-auth-records";
import { mailEventTimes, mailTimestamp } from "../shared/mail-timestamps";
import { checkResendDelivery, DELIVERY_MESSAGES, type DeliveryCheck } from "../shared/mail-delivery-status";

export const MAIL_TIMESTAMP_FORMAT = "ISO 8601 UTC string, or null when unavailable";
const metadata = (value: unknown): any => {
  try { return typeof value === "string" ? JSON.parse(value) : value && typeof value === "object" ? value : {}; }
  catch { return {}; }
};
type AuditRow = { id: string | number; action: string; metadata: unknown; created_at: unknown };
type MailRow = {
  id: string | number; purpose: string; outcome: string; reason: string | null;
  message_id: string | null; created_at: unknown; updated_at: unknown; provider?: string | null;
};

export async function recentBrandingMail(projectId: string, ownerId: string) {
  const events = await authQuery(`SELECT id,purpose,outcome,reason,message_id,created_at,updated_at
    FROM tenant_mail_events WHERE tenant_id=? ORDER BY created_at DESC LIMIT 10`, [projectId]) as MailRow[];
  const audits: AuditRow[] = (await pool.query(`SELECT id,action,metadata,created_at FROM auth_branding_audit
    WHERE project_id=$1 AND owner_id=$2 AND action='branding.test.accepted'
    ORDER BY created_at DESC,id DESC LIMIT 10`, [projectId, ownerId])).rows;
  const snapshots: Pick<AuditRow,"metadata"|"created_at">[] = (await pool.query(`SELECT DISTINCT ON (metadata->>'eventId') metadata,created_at FROM auth_branding_audit
    WHERE project_id=$1 AND owner_id=$2 AND action='mail.delivery.checked'
    ORDER BY metadata->>'eventId',created_at DESC,id DESC LIMIT 50`, [projectId, ownerId])).rows;
  const checks = new Map<string, DeliveryCheck>();
  for (const row of snapshots) {
    const data = metadata(row.metadata);
    if (typeof data.eventId === "string" && !checks.has(data.eventId)) {
      checks.set(data.eventId, { status: data.status || null, error: data.error || null, checkedAt: mailTimestamp(data.checkedAt) });
    }
  }
  const tests: MailRow[] = audits.filter(row => row.action === "branding.test.accepted").map(row => {
    const data = metadata(row.metadata);
    return { id: `branding-test:${row.id}`, purpose: data.purpose === "reset" ? "reset" : "verify",
      outcome: "accepted", reason: "Branding preview only — not a sign-in link.", message_id: data.messageId || null,
      provider: data.provider || (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(data.messageId || "") ? "resend" : null),
      created_at: row.created_at, updated_at: row.created_at };
  });
  return [...events.map(event => ({ ...event, provider: "resend" })), ...tests]
    .map(event => ({ ...mailEventTimes(event), delivery: checks.get(String(event.id)) || null }))
    .sort((a, b) => (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0)).slice(0, 10);
}

/** Only call after ownedAuthProject authorization. Never resends or changes original mail events. */
export async function refreshBrandingMail(projectId: string, ownerId: string) {
  const events = await recentBrandingMail(projectId, ownerId);
  // Bounded read-only lookups; throttling is exposed rather than treated as delivery.
  for (const event of events.slice(0, 4)) {
    const lookup = !event.message_id
      ? { status: null, error: DELIVERY_MESSAGES.missing_id, checkedAt: new Date().toISOString() }
      : event.provider === "resend"
      ? await checkResendDelivery(String(event.message_id), process.env.RESEND_API_KEY)
      : { status: null, error: DELIVERY_MESSAGES.unsupported, checkedAt: new Date().toISOString() };
    // A failed refresh must not erase an earlier confirmed provider result.
    const delivery = { ...lookup, status: lookup.status || event.delivery?.status || null };
    event.delivery = delivery;
    await pool.query(`INSERT INTO auth_branding_audit(actor_id,owner_id,project_id,action,metadata)
      VALUES($1,$2,$3,'mail.delivery.checked',$4)`,
    [ownerId, ownerId, projectId, JSON.stringify({ eventId: String(event.id), ...delivery })]);
  }
  return events;
}
