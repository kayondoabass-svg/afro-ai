import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, statfs, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PREFIX, RETENTION_DAYS, MAX_ARCHIVE_BYTES, MAX_STORED_BYTES, runKeys, expiredRuns, validManifest } from "./policy.mjs";
import { command, saveStream, fileDigest, atomicJson } from "./io.mjs";
import { snapshotPostgres, snapshotD1, snapshotUploads, listObjects } from "./snapshot.mjs";
import { verifyArchive } from "./restore.mjs";

process.umask(0o077);
const root = "/run/afro-ai-backup";
const statusFile = process.env.AFRO_BACKUP_STATUS_FILE || "/srv/afro-ai/backups/status.json";
const startedAt = new Date().toISOString();
const runId = `${Date.now()}-${randomBytes(8).toString("hex")}`;
const keys = runKeys(runId);
let directory, backup, uploads, stage = "configuration";
const credentials = prefix => ({
  accessKeyId: process.env[`${prefix}_ACCESS_KEY_ID`],
  secretAccessKey: process.env[`${prefix}_SECRET_ACCESS_KEY`],
});
const client = (account, credential) => new S3Client({
  endpoint: `https://${account}.r2.cloudflarestorage.com`, region: "auto", forcePathStyle: true,
  maxAttempts: 1, credentials: credential,
});
try {
  for (const key of ["BACKUP_R2_ACCOUNT_ID", "BACKUP_R2_BUCKET_NAME", "BACKUP_R2_ACCESS_KEY_ID",
    "BACKUP_R2_SECRET_ACCESS_KEY", "R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"])
    if (!process.env[key]) throw new Error("Backup configuration incomplete");
  if (process.env.BACKUP_R2_BUCKET_NAME !== "afro-ai-backups" ||
    process.env.BACKUP_R2_BUCKET_NAME === process.env.R2_BUCKET_NAME)
    throw new Error("Dedicated recovery bucket is required");
  if (process.env.BACKUP_RETENTION_DAYS !== "7") throw new Error("Backup retention must match the approved seven days");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const space = await statfs(root);
  if (space.bavail * space.bsize < 65_000_000) throw new Error("Insufficient temporary recovery-check space");
  directory = await mkdtemp(`${root}/run-`);
  const staging = `${directory}/snapshot`;
  await mkdir(staging, { mode: 0o700 });
  const budget = { bytes: 0 };
  backup = client(process.env.BACKUP_R2_ACCOUNT_ID, credentials("BACKUP_R2"));
  uploads = client(process.env.R2_ACCOUNT_ID, credentials("R2"));
  const bucket = process.env.BACKUP_R2_BUCKET_NAME;
  stage = "postgres-snapshot";
  const postgres = await snapshotPostgres(staging, budget);
  stage = "d1-snapshots";
  const d1 = await snapshotD1(staging, budget, postgres.infrastructure);
  stage = "upload-snapshot";
  const objects = await snapshotUploads(uploads, process.env.R2_BUCKET_NAME, staging, budget);
  let revision = null;
  try { revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
  await writeFile(`${staging}/snapshot.json`, JSON.stringify({ version: 1, runId, startedAt,
    capturedAt: new Date().toISOString(), revision, postgres, d1, uploadObjects: objects.length,
    uploadsBucket: process.env.R2_BUCKET_NAME }), { mode: 0o600 });
  stage = "archive";
  const archive = `${directory}/recovery.tar.gz`;
  const beforeArchive = await statfs(root);
  if (beforeArchive.bavail * beforeArchive.bsize < budget.bytes + 10_000_000)
    throw new Error("Insufficient temporary space to package this recovery point");
  const snapshotBytes = budget.bytes;
  await command("tar", ["-czf", archive, "-C", staging, "snapshot.json", "postgres.dump", "d1", "objects", "uploads.json"],
    { timeout: 120000 });
  const digest = await fileDigest(archive);
  if (digest.bytes > MAX_ARCHIVE_BYTES) throw new Error("Archive exceeds the approved initial storage budget");
  const previous = await listObjects(backup, bucket, PREFIX);
  if (previous.reduce((sum, o) => sum + (o.Size ?? 0), 0) + digest.bytes > MAX_STORED_BYTES)
    throw new Error("Managed backup storage safety threshold reached");
  stage = "archive-upload";
  await backup.send(new PutObjectCommand({ Bucket: bucket, Key: keys.archive, Body: createReadStream(archive),
    ContentLength: digest.bytes, ContentType: "application/gzip", IfNoneMatch: "*",
    Metadata: { sha256: digest.sha256 } }), { abortSignal: AbortSignal.timeout(120000) });
  // Once uploaded, remove only our local copies. Verification must use the
  // off-host read-back, and the small /run filesystem must not hold four copies.
  await rm(staging, { recursive: true, force: true });
  await rm(archive);
  stage = "archive-read-back";
  const downloaded = await backup.send(new GetObjectCommand({ Bucket: bucket, Key: keys.archive }),
    { abortSignal: AbortSignal.timeout(60000) });
  const recoveredFile = `${directory}/read-back.tar.gz`;
  const recovered = await saveStream(downloaded.Body, recoveredFile, budget, MAX_ARCHIVE_BYTES);
  if (recovered.sha256 !== digest.sha256 || recovered.bytes !== digest.bytes) throw new Error("Off-host archive checksum failed");
  const beforeRestore = await statfs(root);
  if (beforeRestore.bavail * beforeRestore.bsize < snapshotBytes + 10_000_000)
    throw new Error("Insufficient temporary space for isolated recovery verification");
  stage = "isolated-restore";
  const verified = await verifyArchive(recoveredFile, `${directory}/restored`, runId.replace("-", "_"));
  const manifest = { kind: "afro-ai-recovery", version: 1, runId, startedAt,
    completedAt: new Date().toISOString(), status: "verified", retentionDays: RETENTION_DAYS,
    ...digest, ...verified, archiveReadBackVerified: true, scopes: ["postgres", "d1", "uploads"] };
  await backup.send(new PutObjectCommand({ Bucket: bucket, Key: keys.manifest, Body: JSON.stringify(manifest),
    ContentType: "application/json", IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(30000) });
  // Retention applies only to verified, tool-owned archive pairs, after a new
  // recovery point succeeds. Unrelated objects and customer uploads are excluded.
  stage = "retention";
  for (const oldId of expiredRuns(previous, Date.now(), runId)) {
    const old = runKeys(oldId);
    const response = await backup.send(new GetObjectCommand({ Bucket: bucket, Key: old.manifest }));
    const oldManifest = JSON.parse(await response.Body.transformToString());
    if (!validManifest(oldManifest, oldId)) continue;
    for (const key of [old.archive, old.manifest])
      await backup.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
  await atomicJson(statusFile, manifest);
  process.stdout.write(JSON.stringify({ event: "backup_verified", bytes: digest.bytes,
    uploadObjects: objects.length, postgresTables: verified.restoredPostgresTables,
    d1Databases: verified.restoredD1Databases, retentionDays: RETENTION_DAYS }) + "\n");
} catch {
  await atomicJson(statusFile, { version: 1, status: "failed", startedAt,
    failedAt: new Date().toISOString(), stage, retentionDays: RETENTION_DAYS }).catch(() => {});
  process.stderr.write(JSON.stringify({ event: "backup_failed", stage,
    message: "Recovery backup did not complete verification. Inspect configuration without printing secrets or data." }) + "\n");
  process.exitCode = 1;
} finally {
  backup?.destroy(); uploads?.destroy();
  if (directory) await rm(directory, { recursive: true, force: true });
}
