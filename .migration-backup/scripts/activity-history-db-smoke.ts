// Opt-in integration check. Uses a connection-local temporary table only;
// never inserts, updates or deletes rows in the application's messages table.
import assert from "node:assert/strict";
import { pool } from "../server/db";
import { archiveActivities, importLegacyActivity, readActivityPage, resolveActivityCursor } from "../server/project-workbench/activity-history";
import type { Activity } from "../server/project-workbench/activity-model";

async function main() {
  if (!process.argv.includes("--confirm-temporary-table")) {
    throw new Error("Pass --confirm-temporary-table to run this isolated database smoke check.");
  }
  const conn = await pool.connect();
  const query = pool.query, connect = pool.connect;
  try {
    await conn.query(`CREATE TEMP TABLE messages (
      id bigserial PRIMARY KEY, conversation_id integer NOT NULL,
      role text NOT NULL, content text NOT NULL
    )`);
    pool.query = conn.query.bind(conn) as typeof pool.query;
    pool.connect = (async () => ({ query: conn.query.bind(conn), release() {} })) as unknown as typeof pool.connect;
    const events: Activity[] = Array.from({ length: 260 }, (_, i) => ({
      id: `job:call-${i}:completed`, jobId: "job", callId: `call-${i}`, createdAt: new Date().toISOString(),
      tool: "write_file", status: "completed", title: "Edited project file",
    }));
    await archiveActivities("1", events);
    await archiveActivities("1", events);
    await archiveActivities("2", [{ ...events[0], id: "other-project" }]);
    await importLegacyActivity("1");
    const newest = await readActivityPage("1", { limit: 50 });
    assert.equal(newest.items.length, 50);
    assert.equal(newest.items[0].id, events[210].id);
    const restored = [...newest.items]; let before = newest.nextBefore;
    while (before) {
      const older = await readActivityPage("1", { limit: 50, before });
      restored.unshift(...older.items); before = older.nextBefore;
    }
    assert.equal(restored.length, 260);
    assert.equal(new Set(restored.map(item => item.id)).size, 260);
    const cursor = await resolveActivityCursor("1", events[4].id);
    const missed = await readActivityPage("1", { after: cursor, limit: 100 });
    assert.equal(missed.items[0].id, events[5].id);
    assert.equal(missed.hasMore, true);
    assert.equal(await resolveActivityCursor("2", events[4].id), undefined);
    // Prove the append/commit path leaves no partial activity after rollback.
    const atomicQuery = pool.query;
    let failed = false;
    pool.connect = (async () => ({
      query: async (sql: string, values?: unknown[]) => {
        if (!failed && sql.includes("INSERT INTO messages") && String(values?.[3]).includes("rollback-second")) {
          failed = true; throw new Error("Injected transaction failure");
        }
        return conn.query(sql, values);
      }, release() {},
    })) as unknown as typeof pool.connect;
    await assert.rejects(() => archiveActivities("1", [
      { ...events[0], id: "rollback-first" }, { ...events[0], id: "rollback-second" },
    ]));
    pool.query = atomicQuery;
    assert.equal(await resolveActivityCursor("1", "rollback-first"), undefined);
    console.log("PostgreSQL activity smoke check passed: 260 retained records, pagination, deduplication, cursor replay, project isolation and atomic rollback.");
  } finally {
    pool.query = query; pool.connect = connect;
    await conn.query("DROP TABLE IF EXISTS pg_temp.messages").catch(() => {});
    conn.release();
  }
}
main().catch(error => {
  console.error("Activity database smoke check failed:", error instanceof Error ? error.message : "Unknown failure");
  process.exitCode = 1;
}).finally(() => pool.end());
