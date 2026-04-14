import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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
