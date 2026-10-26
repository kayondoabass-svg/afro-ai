import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { queueCreditBalanceCheck } from "../credit-balance-alerts";
import { ProjectFileError } from "../project-file-policy";
import { isFounderEmail } from "../founder-access";

export const JOB_BUDGET = { maxTokens: 50000, maxRounds: 5, paygChargeCents: 2 };
type Budget = {
  id: string; maxTokens: number; reservedCents: number; usedTokens: number;
  estimated: boolean; calls: number; completed: number; rejected: number; createdAt: string;
  status: "reserved" | "dispatched" | "settled" | "released" | "uncertain";
  quotaExempt?: boolean;
};
export function tokenBudget(value: unknown) {
  if (value === undefined) return JOB_BUDGET.maxTokens;
  if (!Number.isSafeInteger(value) || Number(value) < 10000 || Number(value) > JOB_BUDGET.maxTokens)
    throw new ProjectFileError(400, "Job token limit must be between 10000 and 50000.");
  return Number(value);
}
export function assertNextCall(b: Budget, inputUpperBound: number, outputLimit: number) {
  if (!Number.isSafeInteger(inputUpperBound) || inputUpperBound < 0 || !Number.isSafeInteger(outputLimit) || outputLimit <= 0)
    throw new ProjectFileError(400, "Invalid model-call token estimate.");
  // Finite workflows remain a safety boundary, not a customer entitlement.
  if (b.quotaExempt && b.calls >= JOB_BUDGET.maxRounds)
    throw new ProjectFileError(429, "Request safety limit reached. Review progress before starting another request.");
  if (!b.quotaExempt && (b.calls >= JOB_BUDGET.maxRounds || b.usedTokens + inputUpperBound + outputLimit > b.maxTokens))
    throw new ProjectFileError(402, "Job budget reached. Progress is preserved; review it before starting another request.");
}

export function fitJobOutput(b: Pick<Budget, "maxTokens" | "usedTokens" | "quotaExempt">, input: number, requested: number) {
  if (!Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(requested) || requested <= 0)
    throw new ProjectFileError(400, "Invalid model-call token estimate.");
  if (b.quotaExempt) return requested;
  const available = b.maxTokens - b.usedTokens - input;
  const granted = Math.min(requested, available);
  if (!Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(requested) || requested <= 0 ||
      granted < Math.min(requested, 256))
    throw new ProjectFileError(402, "Job token allowance is too small for this context. Use fewer attachments, a shorter conversation, or a larger allowance if available. No additional AI call was started.");
  return granted;
}

// Durable reservations use the existing application database, not in-memory
// counters. Debit BOTH balance and spending allowance before provider dispatch.
// Retain ambiguous dispatched charges; never promise a provider refund.
export async function reserveJob(owner: string, conversation: string, maxTokens = JOB_BUDGET.maxTokens, chargeCents = 0, authenticatedEmail?: unknown) {
  if (![0, JOB_BUDGET.paygChargeCents].includes(chargeCents)) throw new ProjectFileError(400, "Invalid job charge.");
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    const { rows: accounts } = await conn.query(
      "SELECT email, payg_balance, payg_limit, payg_spent FROM users WHERE id = $1 FOR UPDATE", [owner]);
    if (!accounts.length) throw new ProjectFileError(404, "Account not found.");
    const { rows: owned } = await conn.query("SELECT id FROM conversations WHERE id = $1 AND user_id = $2", [conversation, owner]);
    if (!owned.length) throw new ProjectFileError(404, "Conversation not found.");
    const account = accounts[0];
    // Both the authenticated session and locked account must match. Never
    // accept an exemption/role/email from the request body or a project file.
    const quotaExempt = isFounderEmail(authenticatedEmail) && isFounderEmail(account.email);
    if (quotaExempt) { maxTokens = JOB_BUDGET.maxTokens; chargeCents = 0; }
    else tokenBudget(maxTokens);
    if (chargeCents && (account.payg_balance < chargeCents || account.payg_spent + chargeCents > account.payg_limit))
      throw new ProjectFileError(402, "Insufficient PAYG balance or spending allowance for this job.");
    if (chargeCents) await conn.query(
      "UPDATE users SET payg_balance = payg_balance - $2, payg_spent = payg_spent + $2 WHERE id = $1", [owner, chargeCents]);
    const b: Budget = { id: randomUUID(), maxTokens, reservedCents: chargeCents, usedTokens: 0,
      estimated: false, calls: 0, completed: 0, rejected: 0, status: "reserved", createdAt: new Date().toISOString(),
      ...(quotaExempt ? { quotaExempt: true } : {}) };
    await conn.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'workbench-budget', $2)", [conversation, JSON.stringify(b)]);
    await conn.query("COMMIT");
    if (chargeCents) queueCreditBalanceCheck(owner);
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
export async function dispatchJobCall(job: JobReservation, inputUpperBound: number, outputLimit: number, fitOutput = false) {
  let granted = outputLimit;
  const budget = await changeJob(job, b => {
    if (!["reserved", "dispatched"].includes(b.status)) throw new ProjectFileError(409, "Job is no longer active.");
    if (fitOutput) granted = fitJobOutput(b, inputUpperBound, outputLimit);
    assertNextCall(b, inputUpperBound, granted);
    b.calls++; b.status = "dispatched";
  });
  return { ...budget, outputLimit: granted };
}
export async function recordJobUsage(job: JobReservation, tokens: number, estimated: boolean) {
  return changeJob(job, b => {
    if (b.status !== "dispatched" || b.completed >= b.calls || !Number.isSafeInteger(tokens) || tokens < 0)
      throw new ProjectFileError(409, "Invalid job usage.");
    b.completed++; b.usedTokens += tokens; b.estimated ||= estimated;
  });
}
export async function finishJob(job: JobReservation, usableResult = true) {
  // Customer pricing remains charge-after-usable-result. Known completed but
  // unusable responses refund the customer's reservation, NOT supplier usage.
  // An incomplete dispatch still remains uncertain for explicit reconciliation.
  return changeJob(job, b => {
    if (b.status === "reserved") b.status = "released";
    else if (b.status === "dispatched") b.status = b.calls === b.completed
      ? (!usableResult || b.calls === b.rejected ? "released" : "settled") : "uncertain";
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
