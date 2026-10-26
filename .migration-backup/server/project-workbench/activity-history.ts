import type { PoolClient } from "pg";
import { pool } from "../db";
import { ProjectFileError } from "../project-file-policy";
import { publicActivitySnapshot, safeActivity, type Activity } from "./activity-model";

export const ACTIVITY_ROLE = "workbench-activity";
const IMPORT_ROLE = "workbench-activity-import";
export const HISTORY_POLICY = {
  retention: "project-lifetime",
  legacyHistory: "Only surviving legacy activity can be imported. Previously discarded events cannot be recovered.",
} as const;

export function activityCursor(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > BigInt("9223372036854775807"))
    throw new ProjectFileError(400, "Invalid activity cursor.");
  return value;
}
export function activityLimit(value: unknown): number {
  if (value === undefined) return 50;
  if (typeof value !== "string" || !/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > 100)
    throw new ProjectFileError(400, "Activity page size must be 1–100.");
  return Number(value);
}

// Caller must hold a transaction. The lock makes duplicate checks safe across
// processes and serializes commits so sequence cursors cannot miss late commits.
export async function appendActivities(conn: Pick<PoolClient, "query">, workspace: string, events: Activity[]) {
  await conn.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`activity:${workspace}`]);
  const safe = events.map(safeActivity);
  if (!safe.length) return;
  const existing = await conn.query(`SELECT content::jsonb->>'id' AS event_id FROM messages
    WHERE conversation_id = $1 AND role = $2 AND content::jsonb->>'id' = ANY($3::text[])`,
    [workspace, ACTIVITY_ROLE, safe.map(event => event.id)]);
  const seen = new Set(existing.rows.map(row => row.event_id));
  for (const event of safe) {
    if (seen.has(event.id)) continue;
    await conn.query(`INSERT INTO messages (conversation_id, role, content)
      SELECT $1, $2, $3 WHERE NOT EXISTS (
        SELECT 1 FROM messages WHERE conversation_id = $1 AND role = $2 AND content::jsonb->>'id' = $4
      )`, [workspace, ACTIVITY_ROLE, JSON.stringify(event), event.id]);
    seen.add(event.id);
  }
}

export async function archiveActivities(workspace: string, events: Activity[]) {
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    await appendActivities(conn, workspace, events);
    await conn.query("COMMIT");
  } catch (e) {
    await conn.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { conn.release(); }
}

// Import once from surviving bounded records, without running tools or providers.
// Reconciliation of recent captures also records interrupted/uncertain outcomes.
export async function importLegacyActivity(workspace: string) {
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    await conn.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`activity:${workspace}`]);
    const marker = await conn.query("SELECT id FROM messages WHERE conversation_id = $1 AND role = $2 LIMIT 1", [workspace, IMPORT_ROLE]);
    if (!marker.rows.length) {
      let cursor = "0";
      // Recover every surviving capture receipt, not only the current 20-run UI.
      while (true) {
        const { rows } = await conn.query(`SELECT id::text AS source_sequence, role, content FROM messages WHERE conversation_id = $1
          AND role IN ('workbench-state', 'workbench-capture') AND id > $2::bigint ORDER BY id ASC LIMIT 200`, [workspace, cursor]);
        await appendActivities(conn, workspace, publicActivitySnapshot(rows));
        if (rows.length < 200) break;
        cursor = String(rows[rows.length - 1].source_sequence);
      }
    } else {
      const { rows } = await conn.query(`SELECT role, content FROM messages WHERE conversation_id = $1
        AND role = 'workbench-capture' ORDER BY id DESC LIMIT 20`, [workspace]);
      await appendActivities(conn, workspace, publicActivitySnapshot(rows));
    }
    if (!marker.rows.length) {
      await conn.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)",
        [workspace, IMPORT_ROLE, JSON.stringify({ importedAt: new Date().toISOString(), ...HISTORY_POLICY })]);
    }
    await conn.query("COMMIT");
  } catch (e) {
    await conn.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { conn.release(); }
}

export async function readActivityPage(workspace: string, options: { before?: string; after?: string; limit: number }) {
  const ascending = options.after !== undefined;
  const cursor = ascending ? options.after : options.before;
  const { rows } = await pool.query(`SELECT id::text AS sequence, content FROM messages
    WHERE conversation_id = $1 AND role = $2 ${cursor ? `AND id ${ascending ? ">" : "<"} $3::bigint` : ""}
    ORDER BY id ${ascending ? "ASC" : "DESC"} LIMIT $${cursor ? 4 : 3}`,
    cursor ? [workspace, ACTIVITY_ROLE, cursor, options.limit + 1] : [workspace, ACTIVITY_ROLE, options.limit + 1]);
  const hasMore = rows.length > options.limit;
  const selected = rows.slice(0, options.limit);
  const items = selected.map(row => ({ ...safeActivity(JSON.parse(row.content)), sequence: String(row.sequence) }));
  if (!ascending) items.reverse();
  return { items, hasMore, nextBefore: hasMore && !ascending ? items[0]?.sequence ?? null : null, ...HISTORY_POLICY };
}

export async function resolveActivityCursor(workspace: string, cursor: string) {
  // Accept old SSE event IDs for existing clients; new IDs are database sequences.
  const numeric = /^[1-9]\d*$/.test(cursor);
  if (numeric) activityCursor(cursor);
  const { rows } = await pool.query(`SELECT id::text AS sequence FROM messages WHERE conversation_id = $1 AND role = $2
    AND ${numeric ? "id = $3::bigint" : "content::jsonb->>'id' = $3"} LIMIT 1`, [workspace, ACTIVITY_ROLE, cursor]);
  return rows.length ? String(rows[0].sequence) : undefined;
}
