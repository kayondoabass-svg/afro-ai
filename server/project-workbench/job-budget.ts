import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { ProjectFileError } from "../project-file-policy";

export const JOB_BUDGET = { maxTokens: 50000, maxRounds: 5, paygChargeCents: 2 };
type Budget = {
  id: string; maxTokens: number; reservedCents: number; usedTokens: number;
  estimated: boolean; calls: number; completed: number; rejected: number; createdAt: string;
  status: "reserved" | "dispatched" | "settled" | "released" | "uncertain";
};
export function tokenBudget(value: unknown) {
  if (value === undefined) return JOB_BUDGET.maxTokens;
  if (!Number.isSafeInteger(value) || Number(value) < 10000 || Number(value) > JOB_BUDGET.maxTokens)
    throw new ProjectFileError(400, "Job token limit must be between 10000 and 50000.");
  return Number(value);
}
export function assertNextCall(b: Budget, inputUpperBound: number, outputLimit: number) {
  if (b.calls >= JOB_BUDGET.maxRounds || b.usedTokens + inputUpperBound + outputLimit > b.maxTokens)
    throw new ProjectFileError(402, "Job budget reached. Progress is preserved; review it before starting another request.");
}

// Durable reservations use the existing application database, not in-memory
// counters. Debit BOTH balance and spending allowance before provider dispatch.
// Retain ambiguous dispatched charges; never promise a provider refund.
export async function reserveJob(owner: string, conversation: string, maxTokens = JOB_BUDGET.maxTokens, chargeCents = 0) {
  tokenBudget(maxTokens);
  if (![0, JOB_BUDGET.paygChargeCents].includes(chargeCents)) throw new ProjectFileError(400, "Invalid job charge.");
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    const { rows: accounts } = await conn.query(
      "SELECT payg_balance, payg_limit, payg_spent FROM users WHERE id = $1 FOR UPDATE", [owner]);
    if (!accounts.length) throw new ProjectFileError(404, "Account not found.");
    const { rows: owned } = await conn.query("SELECT id FROM conversations WHERE id = $1 AND user_id = $2", [conversation, owner]);
    if (!owned.length) throw new ProjectFileError(404, "Conversation not found.");
    const account = accounts[0];
    if (chargeCents && (account.payg_balance < chargeCents || account.payg_spent + chargeCents > account.payg_limit))
      throw new ProjectFileError(402, "Insufficient PAYG balance or spending allowance for this job.");
    if (chargeCents) await conn.query(
      "UPDATE users SET payg_balance = payg_balance - $2, payg_spent = payg_spent + $2 WHERE id = $1", [owner, chargeCents]);
    const b: Budget = { id: randomUUID(), maxTokens, reservedCents: chargeCents, usedTokens: 0,
      estimated: false, calls: 0, completed: 0, rejected: 0, status: "reserved", createdAt: new Date().toISOString() };
    await conn.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'workbench-budget', $2)", [conversation, JSON.stringify(b)]);
    await conn.query("COMMIT");
    return { owner, conversation, id: b.id };
  } catch (error) { await conn.query("ROLLBACK"); throw error; }
  finally { conn.release(); }
}
export type JobReservation = Awaited<ReturnType<typeof reserveJob>>;
async function changeJob(job: JobReservation, mutate: (b: Budget) => void) {
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    // Fixed lock order for reservations, settlement and competing jobs.
    await conn.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [job.owner]);
    const { rows } = await conn.query(`SELECT m.id, m.content FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $1 AND c.id = $2 AND m.role = 'workbench-budget'
      AND m.content::jsonb->>'id' = $3 FOR UPDATE OF m`, [job.owner, job.conversation, job.id]);
    if (!rows.length) throw new ProjectFileError(409, "Job reservation is unavailable.");
    const b = JSON.parse(rows[0].content) as Budget;
    const previous = b.status;
    mutate(b);
    if (b.status === "released" && ["reserved", "dispatched"].includes(previous) && b.reservedCents) {
      await conn.query("UPDATE users SET payg_balance = payg_balance + $2, payg_spent = GREATEST(payg_spent - $2, 0) WHERE id = $1",
        [job.owner, b.reservedCents]);
    }
    await conn.query("UPDATE messages SET content = $2 WHERE id = $1", [rows[0].id, JSON.stringify(b)]);
    await conn.query("COMMIT");
    return b;
  } catch (error) { await conn.query("ROLLBACK"); throw error; }
  finally { conn.release(); }
}
export async function dispatchJobCall(job: JobReservation, inputUpperBound: number, outputLimit: number) {
  return changeJob(job, b => {
    if (!["reserved", "dispatched"].includes(b.status)) throw new ProjectFileError(409, "Job is no longer active.");
    assertNextCall(b, inputUpperBound, outputLimit);
    b.calls++; b.status = "dispatched";
  });
}
export async function recordJobUsage(job: JobReservation, tokens: number, estimated: boolean) {
  return changeJob(job, b => {
    if (b.status !== "dispatched" || b.completed >= b.calls || !Number.isSafeInteger(tokens) || tokens < 0)
      throw new ProjectFileError(409, "Invalid job usage.");
    b.completed++; b.usedTokens += tokens; b.estimated ||= estimated;
  });
}
export async function finishJob(job: JobReservation) {
  return changeJob(job, b => {
    if (b.status === "reserved") b.status = "released";
    else if (b.status === "dispatched") b.status = b.calls === b.completed
      ? (b.calls === b.rejected ? "released" : "settled") : "uncertain";
  });
}
export async function recordJobRejection(job: JobReservation) {
  return changeJob(job, b => {
    if (b.status !== "dispatched" || b.completed >= b.calls) return;
    b.completed++; b.rejected++;
  });
}
export async function jobHistory(owner: string, conversation: string) {
  const { rows } = await pool.query(`SELECT m.content FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = $1 AND m.role = 'workbench-budget'
    AND (c.id = $2 OR c.project_id = (SELECT project_id FROM conversations WHERE id = $2 AND user_id = $1))
    ORDER BY m.id DESC LIMIT 20`, [owner, conversation]);
  return rows.map(r => JSON.parse(r.content));
}
export async function deleteConversationWithBudgetGuard(owner: string, conversation: string) {
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    // The same account lock used by reserveJob prevents a new reservation
    // racing between the pending-job check and conversation deletion.
    const { rows: account } = await conn.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [owner]);
    if (!account.length) throw new ProjectFileError(404, "Account not found.");
    const { rows: owned } = await conn.query("SELECT id FROM conversations WHERE id = $1 AND user_id = $2", [conversation, owner]);
    if (!owned.length) throw new ProjectFileError(404, "Conversation not found.");
    const { rows: active } = await conn.query(`SELECT 1 FROM messages WHERE conversation_id = $1 AND role = 'workbench-budget'
      AND content::jsonb->>'status' IN ('reserved', 'dispatched', 'uncertain') LIMIT 1`, [conversation]);
    if (active.length) throw new ProjectFileError(409, "This conversation has an active job or an unresolved reservation. Reconcile it before deleting.");
    await conn.query("DELETE FROM messages WHERE conversation_id = $1", [conversation]);
    await conn.query("DELETE FROM conversations WHERE id = $1 AND user_id = $2", [conversation, owner]);
    await conn.query("COMMIT");
  } catch (e) { await conn.query("ROLLBACK"); throw e; }
  finally { conn.release(); }
}
