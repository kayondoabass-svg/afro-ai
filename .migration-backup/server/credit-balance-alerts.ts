import { pool } from "./db";
import { isFounderEmail } from "./founder-access";
import { creditAmount, isLowCredit, LOW_CREDIT_THRESHOLD_CENTS } from "../shared/credit-alerts";
import { sendLowBalanceEmail } from "./mailer";

const EVENT = "credits.low";
type Alert = { id: number; userId: string; balanceCents: number; currency: string };
export type CreditNotice = {
  id: number; balanceCents: number; thresholdCents: number;
  balance: ReturnType<typeof creditAmount>; threshold: ReturnType<typeof creditAmount>;
  topUpUrl: string;
};

// Existing owner-scoped activity records serve as the durable notification
// outbox. No new schema, wallet conversion or changes to customer prices.
export async function observeCreditBalance(userId: string, displayCurrency?: string): Promise<CreditNotice | null> {
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    const { rows: [account] } = await conn.query(
      "SELECT email, plan, payg_balance, email_verified FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (!account || isFounderEmail(account.email) || !["pro", "business", "payg"].includes(account.plan)) {
      await conn.query("COMMIT");
      return null;
    }
    const { rows: [previous] } = await conn.query(
      "SELECT id, metadata FROM activity_logs WHERE user_id=$1 AND event_type=$2 ORDER BY id DESC LIMIT 1", [userId, EVENT]);
    if (!isLowCredit(account.payg_balance)) {
      if (account.payg_balance > LOW_CREDIT_THRESHOLD_CENTS && previous?.metadata?.active) {
        await conn.query("UPDATE activity_logs SET metadata=metadata || $2::jsonb WHERE id=$1",
          [previous.id, JSON.stringify({ active: false })]);
      }
      await conn.query("COMMIT");
      return null;
    }
    let row = previous;
    if (!previous?.metadata?.active) {
      const { rows: [payment] } = await conn.query(
        "SELECT currency FROM payments WHERE user_id=$1 AND status='completed' ORDER BY created_at DESC LIMIT 1", [userId]);
      const currency = creditAmount(account.payg_balance, payment?.currency ?? "USD").currency;
      const metadata = { active: true, balanceCents: account.payg_balance, currency, emailStatus: "pending" };
      const inserted = await conn.query(
        `INSERT INTO activity_logs(user_id,event_type,title,description,metadata)
         VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id,metadata`,
        [userId, EVENT, "Credits running low", "Your available prepaid credits have reached US$5 or less. Top up to keep using paid generations.", JSON.stringify(metadata)]);
      row = inserted.rows[0];
    }
    await conn.query("COMMIT");
    return {
      id: row.id, balanceCents: account.payg_balance, thresholdCents: LOW_CREDIT_THRESHOLD_CENTS,
      balance: creditAmount(account.payg_balance, displayCurrency ?? row.metadata.currency),
      threshold: creditAmount(LOW_CREDIT_THRESHOLD_CENTS, displayCurrency ?? row.metadata.currency),
      topUpUrl: "/pricing",
    };
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally { conn.release(); }
}

export async function deliverCreditAlert(userId: string) {
  const conn = await pool.connect();
  let alert: Alert | undefined;
  let email: string | undefined;
  try {
    await conn.query("BEGIN");
    const { rows: [account] } = await conn.query(
      "SELECT email, plan, payg_balance, email_verified FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (account?.email && account.email_verified && !isFounderEmail(account.email) &&
        ["pro", "business", "payg"].includes(account.plan) && isLowCredit(account.payg_balance)) {
      // Claim once before touching the email provider. A timeout/crash is not
      // automatically retried because delivery may already have happened.
      const claimed = await conn.query(
        `UPDATE activity_logs SET metadata=metadata || '{"emailStatus":"dispatching"}'::jsonb
         WHERE id=(SELECT id FROM activity_logs WHERE user_id=$1 AND event_type=$2 ORDER BY id DESC LIMIT 1)
         AND metadata->>'active'='true' AND metadata->>'emailStatus'='pending'
         RETURNING id,metadata`, [userId, EVENT]);
      if (claimed.rows[0]) {
        alert = { id: claimed.rows[0].id, userId, balanceCents: account.payg_balance, currency: claimed.rows[0].metadata.currency };
        email = account.email;
      }
    }
    await conn.query("COMMIT");
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally { conn.release(); }
  if (!alert || !email) return;
  let emailStatus = "failed";
  try {
    if (await sendLowBalanceEmail(email, { balanceCents: alert.balanceCents, currency: alert.currency })) emailStatus = "sent";
  } catch {
    emailStatus = "uncertain";
  }
  await pool.query("UPDATE activity_logs SET metadata=metadata || $3::jsonb WHERE id=$1 AND user_id=$2",
    [alert.id, userId, JSON.stringify({ emailStatus })]);
  if (emailStatus !== "sent") console.warn("[credit-alert] Email delivery not confirmed; the in-app notification remains available.");
}

const queued = new Set<string>();
export function queueCreditBalanceCheck(userId: string) {
  if (process.env.NODE_ENV !== "production" || process.env.CI || queued.has(userId)) return;
  queued.add(userId);
  setImmediate(async () => {
    try {
      await observeCreditBalance(userId);
      await deliverCreditAlert(userId);
    } catch { console.error("[credit-alert] Could not check prepaid balance after a charge."); }
    finally { queued.delete(userId); }
  });
}

let started = false;
export function startCreditBalanceAlerts() {
  // Never send real customer mail from development, tests or fixture databases.
  if (started || process.env.NODE_ENV !== "production" || process.env.CI) return;
  started = true;
  let running = false, cursor = "";
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // Cursor batches bound work; account-row locks coordinate other instances.
      const { rows } = await pool.query(
        `SELECT id FROM users WHERE id > $1 AND plan IN ('pro','business','payg')
         AND (payg_balance > 0 OR payg_spent > 0) ORDER BY id LIMIT 50`, [cursor]);
      for (const row of rows) {
        await observeCreditBalance(row.id);
        await deliverCreditAlert(row.id);
      }
      cursor = rows.length === 50 ? rows[rows.length - 1].id : "";
    } catch { console.error("[credit-alert] Could not check prepaid balances."); }
    finally { running = false; }
  };
  setTimeout(tick, 15_000).unref();
  setInterval(tick, 60_000).unref();
}
