import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { COST_CENTS, DAILY_REQUEST_LIMITS, type UserPlan } from "./replit_integrations/quota";
import { generateImageWithImagen, generateImageWithOpenAIFallback, isImagenAvailable } from "./imagen";
import { generateVideoWithVeo, isVeoAvailable } from "./veo";
import { storeMedia, deleteStoredMedia, mediaExtension, MAX_MEDIA_BYTES, MediaAssetError } from "./media-assets";

export const mediaInput = z.object({
  kind: z.enum(["image", "video"]),
  prompt: z.string().trim().min(1).max(4000),
  duration: z.number().int().min(2).max(5).optional(),
  idempotencyKey: z.string().min(1).max(128),
}).superRefine((v, ctx) => {
  if (v.kind === "video" && v.prompt.length > 2000) ctx.addIssue({ code: "custom", message: "Video prompt maximum is 2000 characters", path: ["prompt"] });
  if (v.kind === "image" && v.duration !== undefined) ctx.addIssue({ code: "custom", message: "Duration is only supported for video", path: ["duration"] });
});
export class MediaError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function publicMediaJob(row: any) {
  return {
    id: row.id, kind: row.kind, status: row.status, prompt: row.prompt,
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.error ? { error: row.error } : {}),
    ...(row.status === "succeeded" ? { assetUrl: `/api/media/jobs/${row.id}/asset` } : {}),
  };
}
export async function mediaReady() {
  try {
    await pool.query("SELECT id,lease_until,lease_token,asset_bytes,usage_log_id FROM media_jobs LIMIT 0");
  } catch {
    throw new MediaError(503, "MEDIA_MIGRATION_REQUIRED", "Media storage is unavailable. Apply the media jobs migration and verify database connectivity.");
  }
}
function providerReady(kind: string) {
  if (kind === "video" ? !isVeoAvailable() :
    !(isImagenAvailable() || process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY)) {
    throw new MediaError(503, "MEDIA_PROVIDER_UNAVAILABLE", `${kind} generation is not configured.`);
  }
}
export async function submitMedia(userId: string, raw: unknown) {
  const input = mediaInput.parse(raw);
  await mediaReady();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Serializes idempotency, cap accounting and PAYG reservations for this user.
    const { rows: [user] } = await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [userId]);
    if (!user) throw new MediaError(401, "UNAUTHENTICATED", "Please sign in.");
    const { rows: [old] } = await c.query("SELECT * FROM media_jobs WHERE user_id=$1 AND idempotency_key=$2", [userId, input.idempotencyKey]);
    const duration = input.kind === "video" ? input.duration ?? 5 : null;
    if (old) {
      if (old.kind !== input.kind || old.prompt !== input.prompt || old.duration !== duration)
        throw new MediaError(409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for another request.");
      await c.query("COMMIT");
      return old;
    }
    providerReady(input.kind);
    const plan: UserPlan = ["pro", "business", "payg"].includes(user.plan) ? user.plan : "starter";
    const cost = COST_CENTS[input.kind];
    const { rows: [usage] } = await c.query(
      `SELECT count(*) FILTER (WHERE kind=$2)::int AS used, coalesce(sum(cost_cents),0)::int AS spent
       FROM usage_logs WHERE user_id=$1 AND created_at >= (date_trunc('day',now() AT TIME ZONE 'UTC'))`,
      [userId, input.kind]);
    if (usage.used >= DAILY_REQUEST_LIMITS[input.kind][plan])
      throw new MediaError(429, "DAILY_QUOTA_REACHED", "Daily generation limit reached. Resets at midnight UTC.");
    if (plan === "payg") {
      if (user.payg_balance < cost) throw new MediaError(402, "PAYG_INSUFFICIENT_BALANCE", "Insufficient PAYG credits.");
      if (user.payg_limit > 0 && usage.spent + cost > user.payg_limit)
        throw new MediaError(402, "PAYG_LIMIT_REACHED", "Daily PAYG spending limit reached.");
      await c.query("UPDATE users SET payg_balance=payg_balance-$2,payg_spent=payg_spent+$2 WHERE id=$1", [userId, cost]);
    }
    const { rows: [log] } = await c.query(
      "INSERT INTO usage_logs(user_id,kind,model,tokens_used,cost_cents) VALUES($1,$2,$3,0,$4) RETURNING id",
      [userId, input.kind, `media-reservation:${input.kind}`, cost]);
    const { rows: [job] } = await c.query(
      `INSERT INTO media_jobs(id,user_id,kind,prompt,duration,idempotency_key,plan,cost_cents,usage_log_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [randomUUID(), userId, input.kind, input.prompt, duration, input.idempotencyKey, plan, cost, log.id]);
    await c.query("COMMIT");
    return job;
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}
export async function findMedia(userId: string, id: string) {
  const { rows: [row] } = await pool.query("SELECT * FROM media_jobs WHERE user_id=$1 AND id=$2", [userId, id]);
  if (!row) throw new MediaError(404, "MEDIA_NOT_FOUND", "Media job not found.");
  return row;
}
export async function cancelMedia(userId: string, id: string) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    const { rows: [job] } = await c.query("SELECT * FROM media_jobs WHERE user_id=$1 AND id=$2 FOR UPDATE", [userId, id]);
    if (!job) throw new MediaError(404, "MEDIA_NOT_FOUND", "Media job not found.");
    if (job.status === "queued" || job.status === "running") {
      if (job.status === "queued") {
        await c.query("DELETE FROM usage_logs WHERE id=$1", [job.usage_log_id]);
        if (job.plan === "payg") await c.query(
          "UPDATE users SET payg_balance=payg_balance+$2,payg_spent=GREATEST(0,payg_spent-$2) WHERE id=$1", [userId, job.cost_cents]);
      }
      const message = job.status === "running" ? "Cancelled delivery. Generation may already be billed; reserved quota is retained." : null;
      await c.query("UPDATE media_jobs SET status='cancelled',error=$2 WHERE id=$1", [id, message]);
      job.status = "cancelled"; job.error = message;
    }
    await c.query("COMMIT");
    return job;
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}

export async function claimMedia() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(746321)");
    // Expired paid calls are NEVER requeued, including across process restarts.
    await c.query(`UPDATE media_jobs SET status='failed',error='MEDIA_WORKER_INTERRUPTED: Worker interrupted or timed out. Provider outcome is unknown; not automatically retried.'
      WHERE status='running' AND lease_until < now()`);
    const { rows: [active] } = await c.query("SELECT count(*)::int AS n FROM media_jobs WHERE lease_until > now()");
    const cap = Math.max(1, Math.min(4, Number(process.env.MEDIA_CONCURRENCY) || 2));
    let job;
    if (active.n < cap) {
      const { rows } = await c.query(`UPDATE media_jobs SET status='running',lease_until=now()+interval '8 minutes',lease_token=$1
        WHERE id=(SELECT id FROM media_jobs WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, [randomUUID()]);
      job = rows[0];
    }
    await c.query("COMMIT");
    return job;
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}
export function mediaFailureCategory(error: unknown, timedOut = false): string {
  if (timedOut || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))) return "MEDIA_PROVIDER_TIMEOUT";
  if (error instanceof z.ZodError) return "MEDIA_INVALID_JOB";
  if (error instanceof MediaAssetError && ["MEDIA_ASSET_SIZE_LIMIT", "MEDIA_ASSET_TYPE", "MEDIA_STORAGE_UNAVAILABLE"].includes(error.code)) return error.code;
  if (error instanceof MediaError && error.code === "MEDIA_PROVIDER_UNAVAILABLE") return error.code;
  const status = (error as { status?: unknown })?.status;
  if (status === 401 || status === 403) return "MEDIA_PROVIDER_AUTH";
  if (status === 429) return "MEDIA_PROVIDER_RATE_LIMIT";
  if (status === 400 || status === 422) return "MEDIA_PROVIDER_REJECTED";
  return "MEDIA_GENERATION_FAILED";
}
async function hasFreshLease(job: any): Promise<boolean> {
  const { rows } = await pool.query(
    "SELECT id FROM media_jobs WHERE id=$1 AND user_id=$2 AND lease_token=$3 AND status='running' AND lease_until > now()",
    [job.id, job.user_id, job.lease_token]);
  return rows.length === 1;
}
export async function executeMedia(job: any) {
  const signal = AbortSignal.timeout(6 * 60_000);
  try {
    // Validate persisted input too: the table may have been created by schema push,
    // without migration CHECK constraints. Invalid jobs must never call a provider.
    mediaInput.parse({ kind: job.kind, prompt: job.prompt, idempotencyKey: job.idempotency_key,
      ...(job.kind === "video" ? { duration: job.duration } : job.duration != null ? { duration: job.duration } : {}) });
    if (!await hasFreshLease(job)) return;
    providerReady(job.kind);
    let b64: string, mime: string;
    if (job.kind === "video") {
      const result = await generateVideoWithVeo(job.prompt, { durationSeconds: job.duration, signal });
      b64 = result.videoBase64; mime = result.mimeType;
    } else {
      // Select exactly one provider: never issue a second paid call after an ambiguous error.
      const result = isImagenAvailable()
        ? await generateImageWithImagen(job.prompt, { signal })
        : await generateImageWithOpenAIFallback(job.prompt, "1024x1024", signal);
      b64 = result.b64_json; mime = result.mimeType;
    }
    if (b64.length > Math.ceil(MAX_MEDIA_BYTES * 4 / 3) + 4) throw new MediaAssetError("MEDIA_ASSET_SIZE_LIMIT");
    mediaExtension(job.kind, mime);
    const bytes = Buffer.from(b64, "base64");
    // DB clock and token fence, immediately before the storage side effect.
    if (!await hasFreshLease(job)) return;
    const asset = await storeMedia(`${job.id}/${job.lease_token}`, bytes, mime);
    const updated = await pool.query(`UPDATE media_jobs SET status='succeeded',asset_key=$3,asset_bytes=$4,mime_type=$5,lease_until=NULL,error=NULL
      WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until > now()
      AND (($3::text IS NULL) <> ($4::bytea IS NULL))
      RETURNING id`, [job.id, job.lease_token, asset.key, asset.bytes, mime]);
    if (updated.rows.length === 0 && asset.key) {
      // This upload is token-specific, so deleting it cannot remove another
      // lease's output. A DB exception is ambiguous and deliberately does NOT delete.
      try { await deleteStoredMedia(asset.key); }
      catch { console.warn("[media] MEDIA_ORPHAN_CLEANUP_FAILED"); }
    }
  } catch (error) {
    const category = mediaFailureCategory(error, signal.aborted);
    await pool.query(`UPDATE media_jobs SET status='failed',error=$3,lease_until=NULL
      WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until > now()`,
      [job.id, job.lease_token, `${category}: Generation did not complete. Provider billing may be unknown; quota retained. No automatic retry.`]);
  } finally {
    await pool.query("UPDATE media_jobs SET lease_until=NULL WHERE id=$1 AND lease_token=$2 AND status='cancelled'", [job.id, job.lease_token]);
  }
}
let workerStarted = false;
export function startMediaWorker() {
  if (workerStarted) return;
  workerStarted = true;
  let ticking = false;
  const timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void (async () => {
      try {
        await mediaReady();
        const job = await claimMedia();
        if (job) void executeMedia(job).catch(() => { /* Lease recovery handles DB outages. */ });
      } catch { /* Fail closed; routes report readiness and interval retries DB availability. */ }
      finally { ticking = false; }
    })();
  }, 2000);
  timer.unref();
}