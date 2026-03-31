import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import path from "path";

const GCS_BUCKET = "afroai-uploads";
const GCS_ENDPOINT = "https://storage.googleapis.com";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  const accessKeyId = process.env.GCS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.GCS_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("GCS credentials not configured (GCS_ACCESS_KEY_ID / GCS_SECRET_KEY missing)");
  }
  _client = new S3Client({
    endpoint: GCS_ENDPOINT,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return _client;
}

export function isGcsConfigured(): boolean {
  return !!(process.env.GCS_ACCESS_KEY_ID && process.env.GCS_SECRET_KEY);
}

export async function uploadToGcs(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
  const client = getClient();
  const key = `uploads/${filename}`;
  await client.send(new PutObjectCommand({
    Bucket: GCS_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  }));
  return `${GCS_ENDPOINT}/${GCS_BUCKET}/${key}`;
}

export async function deleteFromGcs(fileUrl: string): Promise<void> {
  try {
    const client = getClient();
    let key: string;
    if (fileUrl.startsWith("http")) {
      const url = new URL(fileUrl);
      key = url.pathname.replace(`/${GCS_BUCKET}/`, "");
    } else {
      key = `uploads/${path.basename(fileUrl)}`;
    }
    await client.send(new DeleteObjectCommand({ Bucket: GCS_BUCKET, Key: key }));
  } catch (e) {
    console.error("GCS delete error:", e);
  }
}
