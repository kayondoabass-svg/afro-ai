import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { runKeys, expiredRuns, validManifest, quoteIdentifier, MAX_ARCHIVE_BYTES, MAX_WORK_BYTES } from "./policy.mjs";
import { command, saveStream, saveProcess, fileDigest } from "./io.mjs";
import { safeArchiveEntry } from "./restore.mjs";
import { postgresEnvironment } from "./snapshot.mjs";
const id = "1794010000000-0123456789abcdef";
const old = "1793000000000-0123456789abcdef";

test("retention selects only tool-owned manifests older than seven days", () => {
  const objects = [runKeys(id).manifest, runKeys(old).manifest, "uploads/customer.json",
    "afro-ai-recovery/v1/../../customer.json", runKeys(old).archive,
    "afro-ai-recovery/v2/1793000000000-0123456789abcdef.json"].map(Key => ({ Key }));
  assert.deepEqual(expiredRuns(objects, 1794100000000, id), [old]);
});
test("retention refuses unsafe identifiers and preserves current run", () => {
  assert.throws(() => runKeys("../uploads"));
  assert.deepEqual(expiredRuns([{ Key: runKeys(old).manifest }], Date.now(), old), []);
});
test("only completely verified archive manifests authorize retention cleanup", () => {
  const m = { kind: "afro-ai-recovery", version: 1, runId: id, status: "verified", retentionDays: 7,
    archiveReadBackVerified: true, assetsVerified: true, restoredPostgresTables: 91, restoredD1Databases: 3,
    sha256: "a".repeat(64) };
  assert.equal(validManifest(m, id), true);
  for (const patch of [{ status: "pending" }, { assetsVerified: false }, { retentionDays: 30 },
    { runId: old }, { sha256: "invalid" }, { restoredD1Databases: 0 }])
    assert.equal(validManifest({ ...m, ...patch }, id), false);
});
test("restore paths never use raw object keys or allow traversal", () => {
  assert.equal(safeArchiveEntry(`objects/${"a".repeat(64)}.bin`), true);
  for (const path of ["/etc/passwd", "../a", "objects/../../a", "d1/0.sql/evil", "customer.env"])
    assert.equal(safeArchiveEntry(path), false);
});
test("SQL identifiers and PostgreSQL restore destinations are constrained", () => {
  assert.equal(quoteIdentifier("app_status_events"), '"app_status_events"');
  assert.throws(() => quoteIdentifier('a"; DROP DATABASE postgres;'));
  assert.throws(() => postgresEnvironment("postgresql://u:p@external.example/db"));
  const env = postgresEnvironment("postgresql://u:p%40ss@127.0.0.1/db");
  assert.equal(env.PGPASSWORD, "p@ss"); assert.equal(env.PGDATABASE, "db");
});
test("stream and process helpers bound bytes and do not disclose failed command output", async () => {
  const dir = await mkdtemp(`${tmpdir()}/afro-backup-unit-`);
  try {
    const saved = await saveStream(Readable.from(["abc"]), `${dir}/data`, { bytes: 0 }, 4);
    assert.deepEqual(await fileDigest(`${dir}/data`), saved);
    await assert.rejects(saveStream(Readable.from(["too-long"]), `${dir}/large`, { bytes: 0 }, 2));
    const processFile = `${dir}/process`;
    await saveProcess(process.execPath, ["-e", "process.stdout.write('abc')"], processFile, { bytes: 0 });
    assert.equal((await fileDigest(processFile)).sha256, saved.sha256);
    await assert.rejects(command(process.execPath, ["-e",
      "process.stderr.write('private provider payload');process.exit(1)"]), e =>
      !e.message.includes("private provider payload"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("the initial budget accommodates the measured database while keeping bounded staging", () => {
  assert.ok(MAX_ARCHIVE_BYTES > 20_300_357 + 3_223_715);
  assert.ok(MAX_WORK_BYTES >= 2 * 30_000_000);
  assert.ok(MAX_WORK_BYTES < 100_818_944);
});
test("D1 exports restore in isolated SQLite and reject missing tables or filesystem attachment", async () => {
  const dir = await mkdtemp(`${tmpdir()}/afro-d1-unit-`);
  try {
    await mkdir(`${dir}/d1`);
    const input = JSON.stringify({ directory: dir, sources: [{ tables: ["users"] }] });
    await writeFile(`${dir}/d1/0.sql`, "CREATE TABLE users(id TEXT); INSERT INTO users VALUES ('example');");
    const result = JSON.parse(await command("python3", ["scripts/backup/verify-sqlite.py"], { input }));
    assert.equal(result.databases, 1); assert.equal(result.results[0].rows, 1);
    await rm(`${dir}/isolated-0.sqlite`);
    await writeFile(`${dir}/d1/0.sql`, "CREATE TABLE different(id TEXT);");
    await assert.rejects(command("python3", ["scripts/backup/verify-sqlite.py"], { input }));
    await rm(`${dir}/isolated-0.sqlite`);
    await writeFile(`${dir}/d1/0.sql`, "ATTACH DATABASE '/tmp/not-a-backup.sqlite' AS escaped;");
    await assert.rejects(command("python3", ["scripts/backup/verify-sqlite.py"], { input }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
