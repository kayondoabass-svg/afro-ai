import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./db";
import { camelRow, integrationError } from "./email-projects";

export const fingerprintEmailSecret = (secret: string) => crypto.createHash("sha256").update(secret).digest("hex");
export const emailPayloadHash = (body: unknown) => fingerprintEmailSecret(JSON.stringify(body));

/** Indexed lookup for new keys, bounded suffix lookup + hash verification for legacy keys. */
export async function resolveEmailKey(token: string) {
  if (token.startsWith("afro_live_")) {
    const { rows } = await pool.query("SELECT * FROM email_api_keys WHERE public_key=$1 AND is_active", [token]);
    return rows[0] ? camelRow(rows[0]) : null;
  }
  if (!/^sk_live_[a-f0-9]{64}$/.test(token)) return null;
  const fingerprint = fingerprintEmailSecret(token);
  const { rows } = await pool.query(`SELECT k.* FROM email_api_keys k JOIN email_key_state s ON s.key_id=k.id
    WHERE k.is_active AND s.revoked_at IS NULL AND
      (s.secret_fingerprint=$1 OR (s.secret_fingerprint IS NULL AND k.secret_key_preview=$2))
    ORDER BY (s.secret_fingerprint=$1) DESC NULLS LAST LIMIT 20`, [fingerprint, token.slice(-4)]);
  for (const row of rows) {
    if (await bcrypt.compare(token, row.secret_key_hash)) {
      await pool.query("UPDATE email_key_state SET secret_fingerprint=$1 WHERE key_id=$2 AND revoked_at IS NULL", [fingerprint,row.id]);
      return camelRow(row);
    }
  }
  return null;
}

export async function reserveEmailSend(input: {
  userId: string; keyId: number; projectId: number; quotaKeyId: number;
  idempotencyKey: string; payloadHash: string; recipientCount: number; exempt: boolean;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize same-key requests including repeats; quota UPDATE also serializes rotated keys.
    const { rows: [key] } = await client.query(`SELECT k.id,q.monthly_limit FROM email_api_keys k
      JOIN email_key_state s ON s.key_id=k.id JOIN email_api_keys q ON q.id=s.quota_key_id
      WHERE k.id=$1 AND k.user_id=$2 AND s.project_id=$3 AND s.quota_key_id=$4
      AND k.is_active AND s.revoked_at IS NULL FOR UPDATE OF k`,
      [input.keyId,input.userId,input.projectId,input.quotaKeyId]);
    if (!key) integrationError(401,"API key is inactive or revoked");
    const hash = fingerprintEmailSecret(input.idempotencyKey);
    const { rows: [previous] } = await client.query(`SELECT * FROM email_send_requests
      WHERE user_id=$1 AND key_id=$2 AND idempotency_hash=$3`, [input.userId,input.keyId,hash]);
    if (previous) {
      if (previous.payload_hash!==input.payloadHash) integrationError(409,"This request ID was already used for different email content. Use a new Idempotency-Key.");
      await client.query("COMMIT");
      return { ...camelRow(previous), replayed:true };
    }
    const id = crypto.randomUUID();
    const {rows:[period]} = await client.query("SELECT date_trunc('month',now() AT TIME ZONE 'UTC')::date AS month");
    const {rowCount} = await client.query(`INSERT INTO email_quota_periods(quota_key_id,period,used)
      SELECT $1::integer,$2::date,$3::integer WHERE $4::boolean OR $3::integer<=$5::integer
      ON CONFLICT(quota_key_id,period) DO UPDATE SET used=email_quota_periods.used+excluded.used
      WHERE $4::boolean OR email_quota_periods.used+excluded.used<=$5::integer RETURNING used`,
      [input.quotaKeyId,period.month,input.recipientCount,input.exempt,key.monthly_limit]);
    if (!rowCount) integrationError(429,"Monthly email limit reached. Each recipient uses one email from your allowance.");
    const {rows:[request]} = await client.query(`INSERT INTO email_send_requests
      (id,user_id,key_id,project_id,quota_key_id,period,idempotency_hash,payload_hash,recipient_count,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') RETURNING *`,
      [id,input.userId,input.keyId,input.projectId,input.quotaKeyId,period.month,hash,input.payloadHash,input.recipientCount]);
    await client.query("COMMIT");
    return {...camelRow(request),replayed:false};
  } catch(error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function settleEmailSend(id: string, userId: string, status: "accepted"|"rejected"|"uncertain", messageId?: string, code?: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {rows:[row]} = await client.query(`UPDATE email_send_requests SET status=$3,message_id=$4,error_code=$5,updated_at=now()
      WHERE id=$1 AND user_id=$2 AND status='pending' RETURNING *`, [id,userId,status,messageId||null,code||null]);
    if (row && status==="rejected") {
      await client.query(`UPDATE email_quota_periods SET used=GREATEST(0,used-$3) WHERE quota_key_id=$1 AND period=$2`,
        [row.quota_key_id,row.period,row.recipient_count]);
    }
    await client.query("COMMIT");
  } catch(error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
