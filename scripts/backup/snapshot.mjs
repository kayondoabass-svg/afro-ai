import pg from "pg";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { saveProcess, saveStream } from "./io.mjs";
import { quoteIdentifier } from "./policy.mjs";

export function postgresEnvironment(url) {
  const u = new URL(url);
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(u.hostname))
    throw new Error("Isolated recovery verification requires the configured local PostgreSQL server");
  return { ...process.env, PGHOST: u.hostname.replace(/^\[|\]$/g, ""), PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)), PGCONNECT_TIMEOUT: "10",
    PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=300000" };
}
export async function snapshotPostgres(dir, budget) {
  const env = postgresEnvironment(process.env.DATABASE_URL);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  const c = await pool.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await c.query("SET LOCAL statement_timeout='30s'");
    const snapshot = (await c.query("SELECT pg_export_snapshot() AS snapshot")).rows[0].snapshot;
    const names = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const counts = {};
    for (const { tablename } of names)
      counts[tablename] = (await c.query(`SELECT count(*)::text AS n FROM public.${quoteIdentifier(tablename)}`)).rows[0].n;
    const infrastructure = names.some(r => r.tablename === "project_infrastructure")
      ? (await c.query("SELECT database_id AS id, database_name AS label FROM project_infrastructure WHERE database_id IS NOT NULL AND state <> 'deleted'")).rows : [];
    const { bytes } = await saveProcess("pg_dump", ["--format=custom", "--no-owner", "--no-acl",
      "--compress=6", `--snapshot=${snapshot}`], `${dir}/postgres.dump`, budget, { env, timeout: 300000 });
    await c.query("ROLLBACK");
    return { tables: counts, bytes, infrastructure };
  } finally { c.release(); await pool.end(); }
}
export async function cloudflare(path, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.BACKUP_R2_ACCOUNT_ID}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_D1_TOKEN}`,
      "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error("Cloudflare backup request was not authorized or failed");
  return data.result;
}
export async function d1Sources(infrastructure = []) {
  const ids = new Map();
  for (const key of ["CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_LEGACY_D1_DATABASE_ID",
    "CLOUDFLARE_AUTH_D1_DATABASE_ID", "AUTH_D1_DATABASE_ID"])
    if (process.env[key]) ids.set(process.env[key], key);
  const toml = await readFile("cloudflare/wrangler.toml", "utf8");
  for (const m of toml.matchAll(/database_name\s*=\s*"([^"]+)"\s*\ndatabase_id\s*=\s*"([^"]+)"/g))
    if (!ids.has(m[2])) ids.set(m[2], m[1]);
  for (const source of infrastructure)
    if (!ids.has(source.id)) ids.set(source.id, source.label);
  if (ids.size < 3) throw new Error("Required D1 backup inventory is incomplete");
  for (const id of ids.keys())
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Invalid D1 inventory identifier");
  return [...ids].map(([id, label]) => ({ id, label }));
}
export async function snapshotD1(dir, budget, infrastructure = []) {
  const sources = await d1Sources(infrastructure); const exports = [];
  await mkdir(`${dir}/d1`);
  for (const [index, source] of sources.entries()) {
    const base = `/d1/database/${source.id}`;
    const tableQuery = await cloudflare(`${base}/query`, {
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
      params: [],
    });
    if (tableQuery[0]?.success === false) throw new Error("D1 source inventory failed");
    const tables = tableQuery[0]?.results?.map(r => r.name);
    if (!Array.isArray(tables) || !tables.length) throw new Error("D1 source tables unavailable");
    let bookmark; let download;
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await cloudflare(`${base}/export`, { output_format: "polling",
        ...(bookmark ? { current_bookmark: bookmark } : {}) });
      if (result.status === "error") throw new Error("D1 export failed");
      if (result.status === "complete") { download = result.result?.signed_url; break; }
      bookmark = result.at_bookmark ?? bookmark;
      await new Promise(r => setTimeout(r, 2000));
    }
    // Signed export URLs are short-lived credentials; never persist or log them.
    if (!download) throw new Error("D1 export did not complete within the deadline");
    const u = new URL(download);
    if (u.protocol !== "https:" || !(u.hostname.endsWith(".r2.cloudflarestorage.com") ||
      u.hostname.endsWith(".cloudflare.com"))) throw new Error("Unrecognized D1 export download host");
    const response = await fetch(download, { signal: AbortSignal.timeout(60000), redirect: "error" });
    if (!response.ok || !response.body) throw new Error("D1 export download failed");
    const file = `d1/${index}.sql`;
    const saved = await saveStream(Readable.fromWeb(response.body), `${dir}/${file}`, budget, 15_000_000);
    exports.push({ ...source, file, tables, ...saved });
  }
  return exports;
}
export async function listObjects(client, bucket, prefix) {
  const result = []; let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix,
      ContinuationToken: token, MaxKeys: 1000 }), { abortSignal: AbortSignal.timeout(30000) });
    result.push(...(page.Contents ?? []));
    if (result.length > 10000) throw new Error("Backup object inventory exceeds initial safety limit");
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && !token) throw new Error("Incomplete object pagination");
  } while (token);
  return result;
}
export async function snapshotUploads(client, bucket, dir, budget) {
  await mkdir(`${dir}/objects`);
  const objects = await listObjects(client, bucket);
  const inventory = [];
  for (const object of objects) {
    const file = `objects/${createHash("sha256").update(object.Key).digest("hex")}.bin`;
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: object.Key }),
      { abortSignal: AbortSignal.timeout(60000) });
    if (!response.Body) throw new Error("An upload could not be read");
    const saved = await saveStream(response.Body, `${dir}/${file}`, budget, 20_000_000);
    if (saved.bytes !== object.Size) throw new Error("An upload changed during backup; retry at the next run");
    inventory.push({ key: object.Key, file, contentType: response.ContentType ?? null, ...saved });
  }
  await writeFile(`${dir}/uploads.json`, JSON.stringify(inventory), { mode: 0o600 });
  return inventory;
}
