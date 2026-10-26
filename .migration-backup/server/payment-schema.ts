import type { Pool } from "pg";

export const PAYMENT_SCHEMA = `
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('afro-payment-details'));
ALTER TABLE payments ADD COLUMN IF NOT EXISTS purchase_details JSONB;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS payments_domain_order_unique
  ON payments ((purchase_details->>'domainOrderId'))
  WHERE purchase_details->>'category'='domain';
COMMIT;`;

export async function preparePaymentSchema(pool: Pick<Pool, "connect">) {
  const conn = await pool.connect();
  try {
    const ready = await conn.query(`SELECT count(*)::int AS count,
      to_regclass('payments_domain_order_unique') IS NOT NULL AS indexed FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='payments' AND column_name IN ('purchase_details','completed_at')`);
    if (ready.rows[0]?.count !== 2 || !ready.rows[0]?.indexed) await conn.query(PAYMENT_SCHEMA);
  } catch {
    await conn.query("ROLLBACK").catch(() => {});
    throw new Error("Payment database setup failed; application is not ready.");
  } finally { conn.release(); }
}
