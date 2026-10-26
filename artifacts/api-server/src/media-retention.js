import {S3Client, DeleteObjectCommand} from "@aws-sdk/client-s3";

export function isMediaExpired(row, now = Date.now()) {
  return !!row.expired_at || (!!row.expires_at && new Date(row.expires_at).getTime() <= now);
}

export async function removePrivateMedia(key) {
  const bucket = process.env.MEDIA_R2_BUCKET;
  if (process.env.MEDIA_R2_PRIVATE !== "true" || !bucket ||
      !process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY ||
      !key.startsWith(`${bucket}/private-media/`)) {
    throw Object.assign(new Error("MEDIA_STORAGE_UNAVAILABLE"), {code: "MEDIA_STORAGE_UNAVAILABLE"});
  }
  const client = new S3Client({
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: "auto", maxAttempts: 1,
    credentials: {accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY},
  });
  try {
    await client.send(new DeleteObjectCommand({Bucket: bucket, Key: key.slice(bucket.length + 1)}),
      {abortSignal: AbortSignal.timeout(15_000)});
  } finally {client.destroy();}
}

// Keep minimal accounting/idempotency stubs, never the expired generated content.
// SKIP LOCKED allows the app and a scheduled maintenance process to cooperate.
export async function purgeExpiredMedia(db, {limit = 10, remove = removePrivateMedia} = {}) {
  const client = await db.connect();
  let purged = 0, retry = 0;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const {rows} = await client.query(`SELECT id,asset_key FROM media_jobs
      WHERE status='succeeded' AND expires_at <= now() AND expired_at IS NULL
      ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED`, [Math.max(1, Math.min(50, limit))]);
    for (const row of rows) {
      // Even if object storage is down, remove any database payload immediately.
      await client.query("UPDATE media_jobs SET asset_bytes=NULL,prompt='' WHERE id=$1", [row.id]);
      try {
        if (row.asset_key) await remove(row.asset_key);
      } catch {
        // Keep the pointer for a later deletion attempt; never lose an orphan.
        retry++;
        continue;
      }
      await client.query(`UPDATE media_jobs SET asset_key=NULL,mime_type=NULL,expired_at=now()
        WHERE id=$1`, [row.id]);
      purged++;
    }
    await client.query("COMMIT");
    return {purged, retry};
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {client.release();}
}
