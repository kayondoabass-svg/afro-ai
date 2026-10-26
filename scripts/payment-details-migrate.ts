import { pool } from "../server/db";
import { PAYMENT_SCHEMA } from "../server/payment-schema";
try {
  await pool.query(PAYMENT_SCHEMA);
  console.log("Payment snapshots ready; existing purchases preserved.");
} catch {
  console.error("Payment setup failed; deployment must not continue.");
  process.exitCode = 1;
} finally { await pool.end(); }
