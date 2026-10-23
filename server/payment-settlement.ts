import type { Pool } from "pg";
import { CREDIT_PACKS } from "../shared/credit-checkout";
import { LOW_CREDIT_THRESHOLD_CENTS } from "../shared/credit-alerts";

export type VerifiedPayment = {
  status_code: number; merchant_reference: string; amount: number; currency: string;
  payment_method?: string; confirmation_code?: string; error?: unknown;
};

function cents(amount: unknown) {
  const value = Number(amount);
  if (amount === null || amount === "" || !Number.isFinite(value) || value <= 0 ||
      !Number.isSafeInteger(Math.round(value * 100))) throw new Error("Invalid payment amount");
  return Math.round(value * 100);
}

/** Only call with a response fetched server-side from the configured provider. */
export function verifyPaymentIdentity(payment: any, trackingId: string, status: VerifiedPayment) {
  const savedTracking = payment.pesapal_tracking_id ?? payment.pesapalTrackingId;
  if (!trackingId || (savedTracking && savedTracking !== trackingId) ||
      status.error ||
      status.merchant_reference !== (payment.merchant_reference ?? payment.merchantReference) ||
      status.currency?.toUpperCase() !== payment.currency?.toUpperCase() ||
      cents(status.amount) !== cents(payment.amount)) {
    throw new Error("Payment verification did not match the saved order");
  }
}

export function verifySettlement(payment: any, trackingId: string, status: VerifiedPayment) {
  verifyPaymentIdentity(payment, trackingId, status);
  if (status.status_code !== 1) throw new Error("Payment is not completed");
}

/** Row locks serialize browser polls, callbacks and repeated IPNs across processes.
 * Completion and purchased access commit together; a crash rolls both back.
 */
export async function settlePayment(pool: Pick<Pool, "connect">, merchantRef: string,
  trackingId: string, status: VerifiedPayment, isFounder: (email: string) => boolean) {
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    const payment = (await conn.query("SELECT * FROM payments WHERE merchant_reference=$1 FOR UPDATE", [merchantRef])).rows[0];
    if (!payment) throw new Error("Payment not found");
    verifySettlement(payment, trackingId, status);
    if (payment.status === "completed") {
      await conn.query("COMMIT");
      return { payment, newlyCompleted: false };
    }
    const account = (await conn.query("SELECT id,email,plan FROM users WHERE id=$1 FOR UPDATE", [payment.user_id])).rows[0];
    if (!account) throw new Error("Payment account not found");
    const plan = String(payment.plan);
    const pack = CREDIT_PACKS.find(p => `payg-${p.key}` === plan);
    if (pack) {
      const balance = (await conn.query(`UPDATE users SET payg_balance=payg_balance+$2,
        plan=CASE WHEN plan='starter' AND NOT $3 THEN 'payg' ELSE plan END,updated_at=NOW()
        WHERE id=$1 RETURNING payg_balance`, [payment.user_id, pack.credits, isFounder(account.email || "")])).rows[0];
      if (balance.payg_balance > LOW_CREDIT_THRESHOLD_CENTS) {
        // An absent reminder table must not roll back purchased credits.
        await conn.query("SAVEPOINT credit_reminder");
        try {
          await conn.query(`UPDATE activity_logs SET metadata=metadata || '{"active":false}'::jsonb
            WHERE user_id=$1 AND event_type='credits.low' AND metadata->>'active'='true'`, [payment.user_id]);
          await conn.query("RELEASE SAVEPOINT credit_reminder");
        } catch { await conn.query("ROLLBACK TO SAVEPOINT credit_reminder"); }
      }
    } else if (["chatbot-starter", "chatbot-business", "chatbot-agency"].includes(plan)) {
      const [replies, bots] = plan === "chatbot-starter" ? [1000, 1] : plan === "chatbot-business" ? [5000, 5] : [20000, -1];
      const updated = await conn.query(`UPDATE chatbot_subscriptions SET plan=$2,replies_limit=$3,bots_limit=$4,
        replies_used=0,status='active' WHERE user_id=$1 RETURNING id`, [payment.user_id, plan, replies, bots]);
      if (!updated.rowCount) await conn.query(`INSERT INTO chatbot_subscriptions
        (user_id,plan,replies_limit,bots_limit,replies_used,status) VALUES($1,$2,$3,$4,0,'active')`, [payment.user_id, plan, replies, bots]);
    } else if (["ussd-starter", "ussd-growth", "ussd-enterprise"].includes(plan)) {
      const updated = await conn.query(`UPDATE ussd_subscriptions SET plan=$2,status='active',
        expires_at=NOW()+INTERVAL '30 days' WHERE user_id=$1 RETURNING id`, [payment.user_id, plan.slice(5)]);
      if (!updated.rowCount) await conn.query(`INSERT INTO ussd_subscriptions(user_id,plan,status,expires_at)
        VALUES($1,$2,'active',NOW()+INTERVAL '30 days')`, [payment.user_id, plan.slice(5)]);
    } else if (["pro", "business"].includes(plan)) {
      if (!isFounder(account.email || "")) await conn.query("UPDATE users SET plan=$2,updated_at=NOW() WHERE id=$1", [payment.user_id, plan]);
      await conn.query(`UPDATE published_apps SET app_status='active',suspended_at=NULL,
        suspend_reason=NULL,updated_at=NOW() WHERE user_id=$1 AND app_status='suspended'`, [payment.user_id]);
    } else {
      throw new Error("Unknown purchased package; manual review required");
    }
    await conn.query(`UPDATE payments SET status='completed',pesapal_tracking_id=$2,
      payment_method=$3,confirmation_code=$4 WHERE id=$1`,
      [payment.id, trackingId, status.payment_method || null, status.confirmation_code || null]);
    await conn.query("COMMIT");
    return { payment, newlyCompleted: true };
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally { conn.release(); }
}
