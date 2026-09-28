import { createHash } from "node:crypto";
import { pool } from "./db";
import { COST_CENTS, DAILY_REQUEST_LIMITS, type UserPlan } from "./replit_integrations/quota";

export class AudioReservationError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/**
 * Durable at-most-once admission without schema changes. The usage model field
 * stores the idempotency/fingerprint marker; do not overwrite it on completion.
 * Reservations are retained after provider failure/cancellation because billing
 * may already have happened. Replays never call a provider or debit again.
 */
export async function reserveAudioUsage(userId: string, key: string, provider: string, audio: Buffer, conversationId?: number): Promise<void> {
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) {
    throw new AudioReservationError(400, "INVALID_IDEMPOTENCY_KEY", "Provide a valid audio request key.");
  }
  const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  const prefix = `audio-reservation:${digest(key)}:`;
  const model = `${prefix}${digest(Buffer.concat([Buffer.from(provider + ":"), audio]))}`;
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Same users row lock as media-jobs.ts: serializes audio/media PAYG spend.
    const { rows: [user] } = await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (!user) throw new AudioReservationError(401, "UNAUTHENTICATED", "Please sign in.");
    const { rows: [existing] } = await c.query(
      "SELECT model FROM usage_logs WHERE user_id=$1 AND kind='audio' AND model LIKE $2 LIMIT 1",
      [userId, `${prefix}%`],
    );
    if (existing) {
      throw new AudioReservationError(409, existing.model === model ? "AUDIO_ALREADY_RESERVED" : "IDEMPOTENCY_CONFLICT",
        existing.model === model ? "This audio request was already submitted. It will not be charged or generated again." : "This request key was used for different audio.");
    }
    const plan: UserPlan = ["pro", "business", "payg"].includes(user.plan) ? user.plan : "starter";
    const cost = COST_CENTS.audio;
    const { rows: [usage] } = await c.query(
      `SELECT count(*) FILTER (WHERE kind='audio')::int AS used, coalesce(sum(cost_cents),0)::int AS spent
       FROM usage_logs WHERE user_id=$1 AND created_at >= (date_trunc('day',now() AT TIME ZONE 'UTC'))`, [userId],
    );
    if (usage.used >= DAILY_REQUEST_LIMITS.audio[plan]) throw new AudioReservationError(429, "DAILY_QUOTA_REACHED", "Daily audio limit reached. Resets at midnight UTC.");
    if (plan === "payg") {
      if ((user.payg_balance ?? 0) < cost) throw new AudioReservationError(402, "PAYG_INSUFFICIENT_BALANCE", "Insufficient PAYG credits.");
      if (user.payg_limit > 0 && usage.spent + cost > user.payg_limit) throw new AudioReservationError(402, "PAYG_LIMIT_REACHED", "Daily PAYG spending limit reached.");
      await c.query("UPDATE users SET payg_balance=payg_balance-$2,payg_spent=payg_spent+$2 WHERE id=$1", [userId, cost]);
    }
    await c.query("INSERT INTO usage_logs(user_id,kind,model,tokens_used,cost_cents,conversation_id) VALUES($1,'audio',$2,0,$3,$4)", [userId, model, cost, conversationId ?? null]);
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}