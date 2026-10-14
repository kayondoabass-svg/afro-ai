// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), release: vi.fn() }));
vi.mock("../db", () => ({ pool: { query: m.query, connect: m.connect } }));
import { ACTIVITY_ROLE, activityCursor, activityLimit, archiveActivities, importLegacyActivity, readActivityPage, resolveActivityCursor } from "./activity-history";
import { safeActivity, type Activity } from "./activity-model";

type Row = { sequence: string; workspace: string; role: string; content: string };
let records: Row[], next: bigint;
const event = (i: number): Activity => ({
  id: `job:call-${i}:completed`, jobId: "job", callId: `call-${i}`,
  createdAt: "2026-10-14T00:00:00.000Z", tool: "write_file", status: "completed", title: "Edited file",
});
beforeEach(() => {
  vi.clearAllMocks(); records = []; next = 1n;
  m.connect.mockResolvedValue({ query: m.query, release: m.release });
  m.query.mockImplementation(async (sql: string, params: any[] = []) => {
    const [workspace, role] = params;
    let rows = records.filter(row => row.workspace === workspace);
    if (sql.includes("pg_advisory") || ["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith("INSERT INTO messages")) {
      if (sql.includes("NOT EXISTS") && rows.some(row => row.role === role && JSON.parse(row.content).id === params[3])) return { rows: [] };
      records.push({ sequence: String(next++), workspace, role, content: params[2] });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("AS event_id")) return { rows: rows.filter(row => row.role === role && params[2].includes(JSON.parse(row.content).id)).map(row => ({ event_id: JSON.parse(row.content).id })) };
    if (sql.includes("AS source_sequence")) return { rows: rows.filter(row => ["workbench-state", "workbench-capture"].includes(row.role) && BigInt(row.sequence) > BigInt(params[1]))
      .slice(0, 200).map(row => ({ ...row, source_sequence: row.sequence })) };
    if (sql.includes("role = 'workbench-capture'")) return { rows: rows.filter(row => row.role === "workbench-capture").slice(-20) };
    rows = rows.filter(row => row.role === role);
    if (sql.startsWith("SELECT id FROM")) return { rows: rows.slice(0, 1) };
    if (sql.includes("content::jsonb->>'id' = $3")) return { rows: rows.filter(row => JSON.parse(row.content).id === params[2]) };
    if (sql.includes("id = $3::bigint")) return { rows: rows.filter(row => row.sequence === params[2]) };
    if (sql.includes("id < $3")) rows = rows.filter(row => BigInt(row.sequence) < BigInt(params[2]));
    if (sql.includes("id > $3")) rows = rows.filter(row => BigInt(row.sequence) > BigInt(params[2]));
    rows.sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1);
    if (sql.includes("ORDER BY id DESC")) rows.reverse();
    return { rows: rows.slice(0, params[params.length - 1]) };
  });
});

describe("append-only owned project activity ledger", () => {
  it("retains and paginates all 260 records, beyond both former caps", async () => {
    await archiveActivities("one", Array.from({ length: 260 }, (_, i) => event(i)));
    const first = await readActivityPage("one", { limit: 50 });
    expect(first.items).toHaveLength(50); expect(first.items[0].id).toBe(event(210).id);
    expect(first.hasMore).toBe(true); expect(first.retention).toBe("project-lifetime");
    const all = [...first.items]; let before = first.nextBefore;
    while (before) {
      const page = await readActivityPage("one", { limit: 50, before });
      all.unshift(...page.items); before = page.nextBefore;
    }
    expect(all).toHaveLength(260); expect(new Set(all.map(e => e.id)).size).toBe(260);
    expect(all[0].id).toBe(event(0).id);
  });
  it("deduplicates repeated callbacks and refresh/backfill without rewriting old records", async () => {
    await archiveActivities("one", [event(1), event(1)]);
    await archiveActivities("one", [{ ...event(1), title: "different retry" }]);
    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0].content).title).toBe("Edited file");
    expect(m.query.mock.calls.some(([sql]) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
  });
  it("resumes all missed events by committed sequence without duplicate replay", async () => {
    await archiveActivities("one", Array.from({ length: 220 }, (_, i) => event(i)));
    const cursor = await resolveActivityCursor("one", event(4).id);
    const page = await readActivityPage("one", { after: cursor, limit: 100 });
    expect(page.items[0].id).toBe(event(5).id);
    expect(page.hasMore).toBe(true);
    expect((await readActivityPage("one", { after: page.items.at(-1)!.sequence, limit: 100 })).items[0].id).toBe(event(105).id);
  });
  it("isolates projects and refuses foreign legacy cursors", async () => {
    await archiveActivities("one", [event(1)]); await archiveActivities("two", [event(2)]);
    expect((await readActivityPage("one", { limit: 50 })).items.map(e => e.id)).toEqual([event(1).id]);
    expect(await resolveActivityCursor("two", event(1).id)).toBeUndefined();
  });
  it("handles sequences above JavaScript's safe-integer range exactly", async () => {
    next = 9007199254740993n;
    await archiveActivities("one", [event(1), event(2)]);
    const page = await readActivityPage("one", { limit: 1 });
    expect(page.items[0].sequence).toBe("9007199254740994");
    expect((await readActivityPage("one", { limit: 1, before: page.nextBefore! })).items[0].sequence).toBe("9007199254740993");
  });
  it("imports surviving legacy events once and cannot invent discarded events", async () => {
    records.push({ sequence: String(next++), workspace: "one", role: "workbench-state", content: JSON.stringify({ events: [event(1), event(2)] }) });
    await importLegacyActivity("one"); await importLegacyActivity("one");
    const page = await readActivityPage("one", { limit: 50 });
    expect(page.items).toHaveLength(2);
    expect(page.legacyHistory).toContain("cannot be recovered");
    expect(records.filter(row => row.role === "workbench-activity-import")).toHaveLength(1);
  });
  it("imports capture receipts older than the old 20-run window in bounded batches", async () => {
    for (let i = 0; i < 230; i++) records.push({ sequence: String(next++), workspace: "one", role: "workbench-capture",
      content: JSON.stringify({ id: `capture-${i}`, status: "captured", updatedAt: event(i).createdAt, evidenceIds: ["desktop", "mobile"] }) });
    await importLegacyActivity("one");
    expect(records.filter(row => row.role === ACTIVITY_ROLE)).toHaveLength(230);
  });
  it("rolls back on a database failure instead of broadcasting a fabricated success", async () => {
    m.query.mockRejectedValueOnce(new Error("unavailable"));
    await expect(archiveActivities("one", [event(1)])).rejects.toThrow("unavailable");
    expect(m.query).toHaveBeenCalledWith("ROLLBACK"); expect(m.release).toHaveBeenCalled();
  });
  it("rejects invalid limits/cursors, including injection and integer overflow", () => {
    for (const cursor of ["-1", "1 OR 1=1", "0", "9223372036854775808", ["1"]]) expect(() => activityCursor(cursor)).toThrow();
    for (const limit of ["0", "101", "all", ["50"]]) expect(() => activityLimit(limit)).toThrow();
    expect(activityLimit(undefined)).toBe(50); expect(activityCursor("123")).toBe("123");
  });
  it("never archives screenshot bytes, credentials, private reasoning or provider fields", async () => {
    const input = { ...event(1), base64: "IMAGEBYTES", reasoning: "PRIVATE_THOUGHTS", provider: "PRIVATE_PROVIDER", apiKey: "SECRET" };
    await archiveActivities("one", [input]);
    expect(records[0].content).not.toMatch(/IMAGEBYTES|PRIVATE_THOUGHTS|PRIVATE_PROVIDER|SECRET/);
    expect(safeActivity(input)).not.toHaveProperty("sequence");
  });
});
