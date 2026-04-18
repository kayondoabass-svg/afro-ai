import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import path from "path";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accessKeyId || !secretAccessKey || !accountId) {
    throw new Error("R2 credentials not configured (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ACCOUNT_ID missing)");
  }
  _client = new S3Client({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return _client;
}

export function isR2Configured(): boolean {
  return !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME);
}

export async function uploadToR2(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
  const client = getClient();
  const bucket = process.env.R2_BUCKET_NAME!;
  const accountId = process.env.R2_ACCOUNT_ID!;
  const key = `uploads/${filename}`;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  }));
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
}

export async function deleteFromR2(fileUrl: string): Promise<void> {
  try {
    const client = getClient();
    const bucket = process.env.R2_BUCKET_NAME!;
    let key: string;
    if (fileUrl.startsWith("http")) {
      const url = new URL(fileUrl);
      key = url.pathname.replace(`/${bucket}/`, "").replace(/^\//, "");
    } else {
      key = `uploads/${path.basename(fileUrl)}`;
    }
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    console.error("R2 delete error:", e);
  }
}

// Generic blob helpers — write/read structured content (HTML, JSON, etc.) to R2 by key.
// Used for: published-app HTML, email-campaign HTML, email API bodies, chatbot scans, exports.
export async function putBlob(key: string, body: string | Buffer, contentType = "application/octet-stream"): Promise<string> {
  const client = getClient();
  const bucket = process.env.R2_BUCKET_NAME!;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return key;
}

export async function getBlobText(key: string): Promise<string | null> {
  try {
    const client = getClient();
    const bucket = process.env.R2_BUCKET_NAME!;
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return (await res.Body!.transformToString()) || null;
  } catch (e: any) {
    if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return null;
    console.error("R2 get error:", e?.message || e);
    return null;
  }
}

export async function deleteBlob(key: string): Promise<void> {
  try {
    const client = getClient();
    const bucket = process.env.R2_BUCKET_NAME!;
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e: any) {
    console.error("R2 delete blob error:", e?.message || e);
  }
}
