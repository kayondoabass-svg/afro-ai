import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
export class MediaAssetError extends Error {
  constructor(public code: string) { super(code); }
}
export function mediaExtension(kind: unknown, mime: unknown): string {
  const types: Record<string, Record<string, string>> = {
    image: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" },
    video: { "video/mp4": "mp4", "video/webm": "webm" },
  };
  const ext = typeof kind === "string" && typeof mime === "string"
    && Object.hasOwn(types, kind) && Object.hasOwn(types[kind], mime) ? types[kind][mime] : undefined;
  if (!ext) throw new MediaAssetError("MEDIA_ASSET_TYPE");
  return ext;
}

function privateStore() {
  // Explicit private bucket attestation required; never reuse public uploads blindly.
  const bucket = process.env.MEDIA_R2_BUCKET;
  if (process.env.MEDIA_R2_PRIVATE !== "true" || !bucket ||
      !process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) return null;
  return {
    bucket,
    client: new S3Client({
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: "auto",
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
      maxAttempts: 1,
    }),
  };
}

export async function storeMedia(id: string, bytes: Buffer, mime: string) {
  if (!["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"].includes(mime))
    throw new MediaAssetError("MEDIA_ASSET_TYPE");
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new MediaAssetError("MEDIA_ASSET_SIZE_LIMIT");
  const store = privateStore();
  if (store) {
    const key = `private-media/${id}`;
    try {
      await store.client.send(new PutObjectCommand({
        Bucket: store.bucket, Key: key, Body: bytes, ContentType: mime,
      }), { abortSignal: AbortSignal.timeout(30_000) });
      // Persist bucket with key so configuration changes cannot silently read another bucket.
      return { key: `${store.bucket}/${key}`, bytes: null };
    } catch {
      // A bounded, durable bytea fallback is intentional, not a public URL fallback.
    }
  }
  return { key: null, bytes };
}

export async function deleteStoredMedia(key: string): Promise<void> {
  const store = privateStore();
  if (!store || !key.startsWith(`${store.bucket}/private-media/`))
    throw new MediaAssetError("MEDIA_STORAGE_UNAVAILABLE");
  await store.client.send(new DeleteObjectCommand({
    Bucket: store.bucket, Key: key.slice(store.bucket.length + 1),
  }), { abortSignal: AbortSignal.timeout(30_000) });
}

export async function readMedia(row: any): Promise<Buffer> {
  mediaExtension(row.kind, row.mime_type);
  if (row.asset_bytes) {
    if (!Buffer.isBuffer(row.asset_bytes) || !row.asset_bytes.length || row.asset_bytes.length > MAX_MEDIA_BYTES)
      throw new MediaAssetError("MEDIA_ASSET_SIZE_LIMIT");
    return row.asset_bytes;
  }
  const store = privateStore();
  if (!store || !row.asset_key?.startsWith(`${store.bucket}/private-media/`)) throw new MediaAssetError("MEDIA_STORAGE_UNAVAILABLE");
  try {
    const result = await store.client.send(new GetObjectCommand({
      Bucket: store.bucket, Key: row.asset_key.slice(store.bucket.length + 1),
    }), { abortSignal: AbortSignal.timeout(30_000) });
    if (!result.Body || (result.ContentLength ?? 0) > MAX_MEDIA_BYTES) throw new MediaAssetError("MEDIA_ASSET_UNAVAILABLE");
    const bytes = Buffer.from(await result.Body.transformToByteArray());
    if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new MediaAssetError("MEDIA_ASSET_SIZE_LIMIT");
    return bytes;
  } catch (e) {
    if (e instanceof MediaAssetError) throw e;
    throw new MediaAssetError("MEDIA_STORAGE_UNAVAILABLE");
  }
}