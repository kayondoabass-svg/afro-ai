import { mkdir, readFile } from "node:fs/promises";
import { command, fileDigest } from "./io.mjs";
import { quoteIdentifier } from "./policy.mjs";

export function safeArchiveEntry(entry) {
  return /^(snapshot\.json|postgres\.dump|uploads\.json|d1\/|d1\/\d+\.sql|objects\/|objects\/[a-f0-9]{64}\.bin)$/.test(entry);
}
async function restorePostgres(archiveFile, tables, suffix) {
  const name = `afro_recovery_${suffix}`;
  const quoted = quoteIdentifier(name);
  const env = { ...process.env, PGHOST: "/var/run/postgresql", PGPORT: "5432",
    PGUSER: "postgres", PGPASSWORD: "", PGDATABASE: "postgres", PGOPTIONS: "" };
  const asPostgres = (program, args, extra = {}) =>
    command("runuser", ["-u", "postgres", "--", program, ...args], { env, timeout: 300000, ...extra });
  let role = false, database = false;
  try {
    await asPostgres("psql", ["-X", "--set=ON_ERROR_STOP=1", "-d", "postgres"],
      { input: `CREATE ROLE ${quoted} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;` });
    role = true;
    await asPostgres("createdb", ["--owner", name, name]); database = true;
    await asPostgres("pg_restore", ["--dbname", name, "--role", name, "--no-owner", "--no-acl", "--exit-on-error"],
      { inputFile: archiveFile });
    const pairs = Object.keys(tables).map(table =>
      `('${table}',(SELECT count(*)::text FROM public.${quoteIdentifier(table)}))`);
    const output = await asPostgres("psql", ["-X", "-qAt", "--set=ON_ERROR_STOP=1", "-d", name],
      { input: `SET ROLE ${quoted}; SELECT json_object_agg(name,n)::text FROM (VALUES ${pairs.join(",")}) counts(name,n);` });
    const restored = JSON.parse(output.trim());
    if (Object.keys(restored).length !== Object.keys(tables).length ||
      Object.keys(tables).some(t => restored[t] !== tables[t]))
      throw new Error("Isolated PostgreSQL row counts do not match the captured snapshot");
    return Object.keys(tables).length;
  } finally {
    // Only this run's randomly named restore database/role; never a customer DB.
    if (database) await asPostgres("dropdb", ["--force", name]);
    if (role) await asPostgres("psql", ["-X", "--set=ON_ERROR_STOP=1", "-d", "postgres"],
      { input: `DROP ROLE ${quoted};` });
  }
}
export async function verifyArchive(archive, dir, suffix) {
  const entries = (await command("tar", ["-tzf", archive], { timeout: 30000 }))
    .trim().split("\n");
  if (!entries.length || entries.some(entry => !safeArchiveEntry(entry)))
    throw new Error("Archive contains an unexpected recovery path");
  await mkdir(dir, { mode: 0o700 });
  await command("tar", ["-xzf", archive, "--no-same-owner", "--no-same-permissions", "-C", dir],
    { timeout: 60000 });
  const snapshot = JSON.parse(await readFile(`${dir}/snapshot.json`, "utf8"));
  if (snapshot.version !== 1 || !snapshot.postgres?.tables || snapshot.d1?.length < 3)
    throw new Error("Incomplete recovery inventory");
  const restoredPostgresTables = await restorePostgres(`${dir}/postgres.dump`, snapshot.postgres.tables, suffix);
  for (const source of snapshot.d1) {
    const d = await fileDigest(`${dir}/${source.file}`);
    if (d.sha256 !== source.sha256 || d.bytes !== source.bytes) throw new Error("D1 checksum differs");
  }
  const sqlite = JSON.parse(await command("python3", ["scripts/backup/verify-sqlite.py"],
    { input: JSON.stringify({ directory: dir, sources: snapshot.d1 }), timeout: 120000 }));
  const objects = JSON.parse(await readFile(`${dir}/uploads.json`, "utf8"));
  if (objects.length !== snapshot.uploadObjects) throw new Error("Upload inventory differs");
  for (const object of objects) {
    if (!/^objects\/[a-f0-9]{64}\.bin$/.test(object.file)) throw new Error("Unsafe upload path");
    const d = await fileDigest(`${dir}/${object.file}`);
    if (d.sha256 !== object.sha256 || d.bytes !== object.bytes) throw new Error("Upload checksum differs");
  }
  return { restoredPostgresTables, restoredD1Databases: sqlite.databases,
    uploadObjects: objects.length, assetsVerified: true };
}
