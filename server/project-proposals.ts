import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { pool } from "./db";
import { chatStorage } from "./replit_integrations/chat/storage";
import { assertProjectFileOwnership, applyProjectFileChanges, listProjectFiles } from "./project-files";
import { ProjectFileError, validateProjectFiles } from "./project-file-policy";
import type { ProjectChange } from "./project-tools";

interface Proposal {
  version: 1; id: string; owner: string; conversation: string; expires: number;
  changes: ProjectChange[];
}
function secret() {
  if (!process.env.SESSION_SECRET) throw new ProjectFileError(503, "SESSION_SECRET is required for project proposals");
  return process.env.SESSION_SECRET;
}
export function signProjectProposal(proposal: Proposal): string {
  const body = Buffer.from(JSON.stringify(proposal)).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}
export function verifyProjectProposal(token: unknown, owner: string, conversation: string): Proposal {
  if (typeof token !== "string" || token.length > 100000) throw new ProjectFileError(400, "invalid proposal");
  const parts = token.split(".");
  if (parts.length !== 2) throw new ProjectFileError(400, "invalid proposal");
  const mac = createHmac("sha256", secret()).update(parts[0]).digest();
  const received = Buffer.from(parts[1], "base64url");
  if (mac.length !== received.length || !timingSafeEqual(mac, received)) throw new ProjectFileError(400, "proposal signature invalid");
  let p: Proposal;
  try { p = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
  catch { throw new ProjectFileError(400, "invalid proposal"); }
  if (p.version !== 1 || p.owner !== owner || p.conversation !== conversation || typeof p.id !== "string") throw new ProjectFileError(403, "proposal ownership mismatch");
  if (!Number.isFinite(p.expires) || p.expires <= Date.now()) throw new ProjectFileError(410, "proposal expired; request a new review");
  if (!Array.isArray(p.changes) || !p.changes.length || p.changes.length > 8) throw new ProjectFileError(400, "invalid proposal changes");
  validateProjectFiles(p.changes.map(c => c.file));
  return p;
}
export async function createProjectProposal(owner: string, conversation: string, changes: ProjectChange[]) {
  await assertProjectFileOwnership(owner, conversation);
  const proposal: Proposal = { version: 1, id: randomUUID(), owner, conversation, expires: Date.now() + 15 * 60 * 1000, changes };
  const token = signProjectProposal(proposal);
  await chatStorage.createMessage(Number(conversation), "project-proposal", JSON.stringify({ token, proposal }));
  return { token, id: proposal.id, expires: proposal.expires, changes };
}

/** A durable receipt is committed BEFORE the D1 operation. This deliberately
 * fails closed on an ambiguous network/crash outcome rather than replaying edits.
 * PostgreSQL advisory lock serializes attempts across server instances. */
export async function finishProjectProposal(owner: string, conversation: string, token: unknown, cancel: boolean) {
  await assertProjectFileOwnership(owner, conversation);
  const p = verifyProjectProposal(token, owner, conversation);
  const connection = await pool.connect();
  let locked = false;
  try {
    await connection.query("SELECT pg_advisory_lock(hashtext($1))", [`project-proposal:${p.id}`]);
    locked = true;
    const prior = await connection.query("SELECT content FROM messages WHERE conversation_id = $1 AND role = 'project-proposal-receipt' AND content::jsonb->>'id' = $2 ORDER BY id DESC LIMIT 1", [conversation, p.id]);
    if (prior.rows.length) {
      const receipt = JSON.parse(prior.rows[0].content);
      if (cancel && receipt.status === "cancelled") return { cancelled: true };
      if (receipt.status !== "applied") throw new ProjectFileError(409, "proposal already cancelled or attempted; reload files and request a new proposal");
      const files = await listProjectFiles(owner, conversation);
      if (!p.changes.every(c => files.some(f => JSON.stringify(f) === JSON.stringify(c.file)))) throw new ProjectFileError(409, "proposal was already applied; files have since changed");
      return { saved: true, alreadyApplied: true, files };
    }
    const receipt = await connection.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'project-proposal-receipt', $2) RETURNING id",
      [conversation, JSON.stringify({ id: p.id, status: cancel ? "cancelled" : "attempted" })]);
    if (cancel) return { cancelled: true };
    const files = await applyProjectFileChanges(owner, conversation, p.changes);
    await connection.query("UPDATE messages SET content = $1 WHERE id = $2", [JSON.stringify({ id: p.id, status: "applied" }), receipt.rows[0].id]);
    return { saved: true, files };
  } finally {
    if (locked) await connection.query("SELECT pg_advisory_unlock(hashtext($1))", [`project-proposal:${p.id}`]).catch(() => {});
    connection.release();
  }
}

export async function pendingProjectProposal(owner: string, conversation: string) {
  await assertProjectFileOwnership(owner, conversation);
  const history = await chatStorage.getMessagesByConversation(Number(conversation));
  const receipts = new Set(history.filter(m => m.role === "project-proposal-receipt").map(m => JSON.parse(m.content).id));
  for (const message of [...history].reverse()) {
    if (message.role !== "project-proposal") continue;
    const { token, proposal } = JSON.parse(message.content);
    if (receipts.has(proposal.id) || proposal.expires <= Date.now()) continue;
    const p = verifyProjectProposal(token, owner, conversation);
    return { token, id: p.id, expires: p.expires, changes: p.changes };
  }
  return null;
}