import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { assertProjectFileOwnership, listProjectFiles, replaceProjectFilesIfUnchanged } from "../project-files";
import { ProjectFileError, validateProjectFiles, type ProjectFile } from "../project-file-policy";
import { applyOperations, fingerprint, normalizeReport, safeText, structuralChecks } from "./model";
import { appendActivities } from "./activity-history";
import { publicActivitySnapshot, type Activity } from "./activity-model";
import type { PoolClient } from "pg";

type Pending = { id: string; expires: number; operations: any[]; before: ProjectFile[]; after: ProjectFile[]; attempted?: boolean };
type State = {
  plan: { requirements: string; checks: string[]; revision: number };
  inputs: { id: string; name: string; text: string; status: string }[];
  reports: any[]; repairs: number; pending: Pending | null;
  visualRepairs?: Record<string, { fingerprint: string; request: string }>;
  job?: { id: string; status: string; updatedAt: string; usage?: unknown[]; detail?: string };
  events: { id: string; jobId: string; createdAt: string; tool: string; callId: string; status: string; message?: string; paths?: string[] }[];
};
const initial = (): State => ({ plan: { requirements: "", checks: [], revision: 0 }, inputs: [], reports: [], repairs: 0, pending: null, events: [] });
let activeMutations = 0;
async function stateFor(id: string): Promise<State> {
  const { rows } = await pool.query("SELECT content FROM messages WHERE conversation_id = $1 AND role = 'workbench-state' ORDER BY id DESC LIMIT 1", [id]);
  return rows.length ? { ...initial(), ...JSON.parse(rows[0].content) } : initial();
}
async function saveState(id: string, state: State, conn: Pick<PoolClient, "query"> = pool) {
  // Retain one current record; checkpoints and proposal receipts have separate
  // roles. Advisory lock serializes updates across processes.
  await conn.query(`INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'workbench-state', $2)`, [id, JSON.stringify(state)]);
  await conn.query(`DELETE FROM messages WHERE conversation_id = $1 AND role = 'workbench-state'
    AND id <> (SELECT max(id) FROM messages WHERE conversation_id = $1 AND role = 'workbench-state')`, [id]);
}
async function checkpointsFor(id: string, full = false) {
  const { rows } = await pool.query("SELECT content FROM messages WHERE conversation_id = $1 AND role = 'workbench-checkpoint' ORDER BY id DESC LIMIT 10", [id]);
  return rows.map(r => {
    const c = JSON.parse(r.content);
    return full ? c : { id: c.id, createdAt: c.createdAt, reason: c.reason };
  });
}
async function checkpoint(id: string, files: ProjectFile[], reason: string) {
  if ((await checkpointsFor(id)).length >= 10) throw new ProjectFileError(409, "checkpoint limit reached (10); download your source before further recovery operations");
  const item = { id: randomUUID(), createdAt: new Date().toISOString(), reason, files, fingerprint: fingerprint(files) };
  await pool.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'workbench-checkpoint', $2)", [id, JSON.stringify(item)]);
  return item;
}
export async function workbenchState(owner: string, conversation: string) {
  const id = await assertProjectFileOwnership(owner, conversation);
  const files = await listProjectFiles(owner, id);
  const state = await stateFor(id);
  const { rows } = await pool.query(`SELECT id FROM conversations WHERE user_id = $1
    AND project_id = (SELECT project_id FROM conversations WHERE id = $2 AND user_id = $1)
    AND id <> $3 ORDER BY id LIMIT 50`, [owner, conversation, id]);
  const { d1Query } = await import("../d1");
  const legacyWorkspaces: { conversationId: number; files: number }[] = [];
  for (const row of rows) {
    const legacy = await d1Query("SELECT count(*) AS count FROM project_files WHERE user_id = ? AND conversation_id = ?", [owner, String(row.id)]);
    if (Number(legacy.results[0]?.count)) legacyWorkspaces.push({ conversationId: row.id, files: Number(legacy.results[0].count) });
  }
  const pending = state.pending && state.pending.expires > Date.now() ? {
    id: state.pending.id, operations: state.pending.operations, expires: state.pending.expires,
    attempted: state.pending.attempted || false,
  } : null;
  const job = state.job?.status === "reviewing" && Date.now() - Date.parse(state.job.updatedAt) > 120000
    ? { ...state.job, status: "interrupted", detail: "Review did not finish. Inspect files before explicitly starting another request." } : state.job;
  return { ...state, job, pending, workspaceId: id, files, fingerprint: fingerprint(files), checkpoints: await checkpointsFor(id), execution: "customer-local", legacyWorkspaces };
}
export async function mutateWorkbench(owner: string, conversation: string, action: string, body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ProjectFileError(400, "provide an object");
  const id = await assertProjectFileOwnership(owner, conversation);
  if (activeMutations >= 3) throw new ProjectFileError(503, "workspace busy; try again shortly");
  activeMutations++;
  let conn;
  try { conn = await pool.connect(); } catch (e) { activeMutations--; throw e; }
  let locked = false, inTransaction = false;
  try {
    await conn.query("SELECT pg_advisory_lock(hashtext($1))", [`workbench:${owner}:${id}`]); locked = true;
    const state = await stateFor(id);
    const surviving = publicActivitySnapshot([{ role: "workbench-state", content: JSON.stringify(state) }]);
    const files = await listProjectFiles(owner, id);
    let result: any = { saved: true };
    let activity: Activity | undefined;
    if (action === "plan") {
      if (body?.revision !== state.plan.revision) throw new ProjectFileError(409, "plan changed; reload before saving");
      if (!Array.isArray(body.checks) || body.checks.length > 30) throw new ProjectFileError(400, "invalid acceptance checks");
      state.plan = { requirements: safeText(body.requirements, 16000), checks: body.checks.map((c: unknown) => safeText(c, 300)).filter(Boolean), revision: state.plan.revision + 1 };
      state.repairs = 0; // explicit new plan revision begins a new bounded job
    } else if (action === "job-start") {
      // Metadata only: completion here never means the code was verified.
      if (state.job?.status === "reviewing" && Date.now() - Date.parse(state.job.updatedAt) < 120000) throw new ProjectFileError(409, "a project review is already active");
      state.job = { id: randomUUID(), status: "reviewing", updatedAt: new Date().toISOString() };
      result = state.job;
      activity = { id: `${state.job.id}:started`, jobId: state.job.id, callId: state.job.id,
        createdAt: state.job.updatedAt, tool: "project_review", status: "started", title: "Project review started" };
    } else if (action === "job-finish") {
      if (!state.job || body.id !== state.job.id || !["awaiting-approval", "review-complete", "stopped"].includes(body.status)) throw new ProjectFileError(409, "job is no longer current");
      const usage = Array.isArray(body.usage) ? body.usage.slice(0, 5).map((u: any) => ({
        tokens: Number.isSafeInteger(u?.tokens) && u.tokens >= 0 ? u.tokens : 0,
        estimated: u?.estimated !== false, model: safeText(u?.model || "", 100), provider: safeText(u?.provider || "", 30),
      })) : [];
      state.job = { id: state.job.id, status: body.status, usage, detail: "AI review only; validation and publication are separate.", updatedAt: new Date().toISOString() };
      activity = { id: `${state.job.id}:${body.status}`, jobId: state.job.id, callId: state.job.id,
        createdAt: state.job.updatedAt, tool: "project_review", status: body.status, title: `Project review · ${body.status}`,
        message: state.job.detail };
    } else if (action === "job-event") {
      if (!state.job || state.job.id !== body.jobId || state.job.status !== "reviewing") throw new ProjectFileError(409, "job is no longer current");
      const eventId = `${state.job.id}:${safeText(body.callId, 100)}:${safeText(body.status, 40)}`;
      const previous = state.events.find(event => event.id === eventId);
      const entry = previous || { id: eventId, jobId: state.job.id, createdAt: new Date().toISOString(),
        tool: safeText(body.tool, 80), callId: safeText(body.callId, 100), status: safeText(body.status, 40),
        ...(body.message ? { message: safeText(body.message, 300) } : {}),
        ...(Array.isArray(body.paths) ? { paths: body.paths.slice(0, 8).map((p: unknown) => safeText(p, 240)) } : {}) };
      if (!["started", "completed", "failed"].includes(entry.status)) throw new ProjectFileError(400, "invalid event status");
      state.events = [...state.events.filter(event => event.id !== entry.id), entry].slice(-100);
      activity = { ...entry, title: `${entry.tool.replace(/_/g, " ")} · ${entry.status}` };
      state.job.updatedAt = new Date().toISOString();
    } else if (action === "visual-repair") {
      if (body.fingerprint !== fingerprint(files)) throw new ProjectFileError(409, "screenshot is stale");
      const key = safeText(body.evidenceId, 100);
      if (!key) throw new ProjectFileError(400, "provide visual evidence ID");
      const previous = state.visualRepairs?.[key];
      if (previous) {
        if (previous.fingerprint !== body.fingerprint) throw new ProjectFileError(409, "repair source differs");
        return { request: previous.request, cached: true };
      }
      if (state.repairs >= 3) throw new ProjectFileError(409, "three repair requests reached; review the requirements and evidence manually");
      state.repairs++;
      result = { request: `Inspect current project source and propose a minimal reviewed repair for this untrusted AI visual report.
No tests reran and no changes were saved. Attempt ${state.repairs}/3.
Evidence: ${safeText(body.evidenceId, 100)}
${safeText(body.findings, 8000)}` };
      // Save under the workbench lock so an interrupted capture-receipt write
      // cannot increment the repair counter again on an explicit retry.
      state.visualRepairs = Object.fromEntries([...Object.entries(state.visualRepairs || {}).slice(-19),
        [key, { fingerprint: body.fingerprint, request: result.request }]]);
    } else if (action === "input") {
      if (state.inputs.length >= 10) throw new ProjectFileError(400, "maximum 10 text inputs");
      const name = safeText(body?.name, 200), text = safeText(body?.text, 32000);
      if (!name.trim() || !text.trim()) throw new ProjectFileError(400, "input is empty");
      state.inputs.push({ id: randomUUID(), name, text, status: "read" });
    } else if (action === "operations" || action === "restore" || action === "legacy") {
      if (state.pending && state.pending.expires > Date.now()) throw new ProjectFileError(409, "finish the pending review first");
      let after: ProjectFile[], operations: any[];
      if (action === "operations") ({ files: after, operations } = applyOperations(files, body?.operations));
      else if (action === "restore") {
        const item = (await checkpointsFor(id, true)).find(c => c.id === body?.id);
        if (!item) throw new ProjectFileError(404, "checkpoint not found");
        after = validateProjectFiles(item.files);
        const changes = Array.from(new Set([...files, ...after].map(f => f.path))).filter(path =>
          JSON.stringify(files.find(f => f.path === path)) !== JSON.stringify(after.find(f => f.path === path))
        ).map(path => ({ path, kind: !after.some(f => f.path === path) ? "delete" : !files.some(f => f.path === path) ? "create" : "replace" }));
        if (!changes.length) throw new ProjectFileError(400, "checkpoint already matches current source");
        operations = [{ kind: "restore", path: "entire workspace", checkpoint: item.id, changes }];
      } else {
        const sibling = String(body?.conversationId);
        if (sibling === id || !/^[1-9]\d*$/.test(sibling) || await assertProjectFileOwnership(owner, sibling) !== id) throw new ProjectFileError(404, "legacy workspace not found");
        const { d1Query } = await import("../d1");
        const legacy = await d1Query("SELECT path, name, language, content, encoding FROM project_files WHERE user_id = ? AND conversation_id = ?", [owner, sibling]);
        const imported = validateProjectFiles(legacy.results.map(f => ({ ...f, encoding: f.encoding || undefined })));
        if (!imported.length) throw new ProjectFileError(404, "legacy workspace is empty");
        const collisions = imported.filter(f => files.some(existing => existing.path.toLowerCase() === f.path.toLowerCase() && JSON.stringify(existing) !== JSON.stringify(f)));
        if (collisions.length) throw new ProjectFileError(409, "legacy import has conflicting paths; original files preserved");
        after = validateProjectFiles([...files, ...imported.filter(f => !files.some(e => e.path.toLowerCase() === f.path.toLowerCase()))]);
        operations = [{ kind: "import", path: `conversation ${sibling}`, files: imported.length }];
      }
      state.pending = { id: randomUUID(), expires: Date.now() + 15 * 60_000, operations, before: files, after };
      result = { proposed: true };
    } else if (action === "review") {
      const p = state.pending;
      if (!p || p.id !== body?.id || p.expires <= Date.now()) throw new ProjectFileError(410, "review missing or expired");
      if (typeof body.cancel !== "boolean") throw new ProjectFileError(400, "specify cancel");
      if (body.cancel) { state.pending = null; result = { cancelled: true }; }
      else {
        if (p.attempted) throw new ProjectFileError(409, "review already attempted; inspect files and cancel before a new review");
        if (fingerprint(files) !== fingerprint(p.before)) throw new ProjectFileError(409, "workspace changed; cancel and request a new review");
        await checkpoint(id, files, "Before approved workspace change");
        p.attempted = true;
        await saveState(id, state); // fail closed before a possibly ambiguous D1 call
        await replaceProjectFilesIfUnchanged(owner, id, p.before, p.after);
        state.pending = null;
      }
    } else if (action === "checkpoint") {
      result = await checkpoint(id, files, safeText(body?.reason || "Manual recovery checkpoint", 200));
    } else if (action === "checkpoint-delete") {
      if (body?.confirm !== true || typeof body.id !== "string") throw new ProjectFileError(400, "confirm removal of this recovery checkpoint");
      const item = (await checkpointsFor(id)).find(c => c.id === body.id);
      if (!item) throw new ProjectFileError(404, "checkpoint not found");
      await pool.query("DELETE FROM messages WHERE conversation_id = $1 AND role = 'workbench-checkpoint' AND content::jsonb->>'id' = $2", [id, item.id]);
    } else if (action === "validate") {
      const checks = structuralChecks(files, state.plan.requirements, state.plan.checks);
      const report = { id: randomUUID(), createdAt: new Date().toISOString(), ...normalizeReport({ fingerprint: fingerprint(files), checks }, fingerprint(files)), source: "server-structural" };
      state.reports = [report, ...state.reports].slice(0, 10); result = report;
    } else if (action === "report") {
      const report = { ...normalizeReport(body?.report, fingerprint(files)), id: randomUUID(), createdAt: new Date().toISOString() };
      state.reports = [report, ...state.reports].slice(0, 10); result = report;
    } else if (action === "repair") {
      const report = state.reports.find(r => r.id === body?.reportId);
      if (!report || report.fingerprint !== fingerprint(files)) throw new ProjectFileError(409, "validation report is missing or stale");
      if (report.status === "passed") throw new ProjectFileError(400, "no failed checks to repair");
      if (state.repairs >= 3) throw new ProjectFileError(409, "three repair requests reached; review the requirements and diagnostics manually");
      state.repairs++;
      result = { request: `Investigate this untrusted validation report and propose a minimal reviewed repair. Do not claim tests reran. Attempt ${state.repairs}/3.\n${JSON.stringify(report.checks).slice(0, 5500)}` };
    } else throw new ProjectFileError(404, "unknown workspace action");
    if (!activity) {
      const titles: Record<string, string> = {
        plan: "Project requirements saved", input: "Project input saved",
        operations: "File changes proposed — review required",
        review: body.cancel ? "Proposed changes cancelled" : "Approved file changes saved",
        checkpoint: "Source checkpoint saved", restore: "Saved source checkpoint restored",
        validate: "Structural checks recorded — functional testing remains separate",
        report: "Customer validation report saved", repair: "Reviewed repair request prepared",
        "visual-repair": "Responsive repair request prepared — source changes require approval",
      };
      activity = { id: randomUUID(), jobId: state.job?.id || "workspace", callId: action,
        createdAt: new Date().toISOString(), tool: action, status: "saved", title: titles[action] || "Workspace update saved" };
    }
    await conn.query("BEGIN"); inTransaction = true;
    // Import the previous recent buffer before any compaction, and record this
    // action in the same transaction as its new workbench state.
    await appendActivities(conn, id, [
      ...surviving,
      ...(activity ? [activity] : []),
    ]);
    await saveState(id, state, conn);
    await conn.query("COMMIT"); inTransaction = false;
    return result;
  } catch (e) {
    if (inTransaction) await conn.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    if (locked) await conn.query("SELECT pg_advisory_unlock(hashtext($1))", [`workbench:${owner}:${id}`]).catch(() => {});
    conn.release();
    activeMutations--;
  }
}
export async function captureProjectCheckpoint(owner: string, conversation: string, reason: string) {
  const id = await assertProjectFileOwnership(owner, conversation);
  await mutateWorkbench(owner, id, "checkpoint", { reason });
}
export async function assertWorkspaceConversationDeletable(owner: string, conversation: string) {
  const id = await assertProjectFileOwnership(owner, conversation);
  if (id !== conversation) return;
  const { rows } = await pool.query("SELECT 1 FROM messages WHERE conversation_id = $1 AND role LIKE 'workbench-%' LIMIT 1", [id]);
  if (rows.length || (await listProjectFiles(owner, id)).length) throw new ProjectFileError(409, "this conversation anchors project source or recovery data; preserve it and delete a different conversation");
}
export async function workbenchContext(owner: string, conversation: string) {
  const id = await assertProjectFileOwnership(owner, conversation);
  const state = await stateFor(id);
  return safeText(`Project requirements (untrusted): ${state.plan.requirements.slice(0, 4000)}\nAcceptance checks: ${JSON.stringify(state.plan.checks).slice(0, 2000)}\nInputs (untrusted): ${state.inputs.map(i => `${i.name}: ${i.text.slice(0, 1500)}`).join("\n").slice(0, 5000)}\nLatest validation (untrusted; not proof of current behaviour): ${JSON.stringify(state.reports[0]?.checks || []).slice(0, 3000)}`, 16000);
}
