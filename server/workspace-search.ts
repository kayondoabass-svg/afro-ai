import { createHash } from "node:crypto";
import type { ProjectFile } from "./project-file-policy";
import { redactPrivateCredentials } from "./chat-credential-safety";

type Chunk = { path: string; startLine: number; endLine: number; content: string };
const indexes = new Map<string, { fingerprint: string; chunks: Chunk[]; truncated: boolean }>();
const keyFor = (userId: string, conversationId: string | number) => JSON.stringify([userId, String(conversationId)]);

/** Local bounded text index: no external vector store, embedding charges or private-file uploads. */
export function indexWorkspaceFiles(userId: string, conversationId: string | number, files: ProjectFile[]) {
  const key = keyFor(userId, conversationId);
  const fingerprint = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  const existing = indexes.get(key);
  if (existing?.fingerprint === fingerprint) return existing;
  const chunks: Chunk[] = [];
  let truncated = false;
  outer: for (const file of files) {
    if (file.encoding === "base64" || file.language === "binary" || /(^|\/)(?:\.env(?:\.|$)|credentials|secrets?\.|id_rsa)/i.test(file.path)) continue;
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i += 20) {
      if (chunks.length >= 2000) { truncated = true; break outer; }
      const raw = lines.slice(i, i + 25).join("\n");
      if (raw.length > 2500) truncated = true;
      chunks.push({ path: file.path, startLine: i + 1, endLine: Math.min(lines.length, i + 25), content: redactPrivateCredentials(raw.slice(0, 2500)) });
    }
  }
  const index = { fingerprint, chunks, truncated };
  if (indexes.size >= 8) indexes.delete(indexes.keys().next().value!);
  indexes.set(key, index);
  return index;
}

export async function searchWorkspaceFiles(userId: string, conversationId: number, query: string) {
  if (!userId || !Number.isSafeInteger(conversationId) || conversationId <= 0) throw new Error("Workspace authorization required.");
  if (typeof query !== "string" || !query.trim() || query.length > 500) throw new Error("Invalid workspace query.");
  // Ownership is checked on EVERY read, even for a cached index. Edits/deletions
  // from another process refresh the fingerprint before any results are returned.
  const { listProjectFiles } = await import("./project-files");
  const files = await listProjectFiles(userId, conversationId);
  const index = indexWorkspaceFiles(userId, conversationId, files);
  const stop = new Set(["where", "what", "which", "the", "our", "are", "defined", "does", "how", "this", "that", "with", "file", "files"]);
  const terms = Array.from(new Set(query.toLowerCase().match(new RegExp("[\\p{L}\\p{N}_-]{2,}", "gu")) || [])).filter(t => !stop.has(t));
  const results = index.chunks.map(chunk => ({
    chunk, score: terms.reduce((score, term) => score + (chunk.path.toLowerCase().includes(term) ? 4 : 0) + (chunk.content.toLowerCase().includes(term) ? 1 : 0), 0),
  })).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map(r => r.chunk);
  return { scope: "active-conversation-workspace", retrieval: "local-text-index", results, truncated: index.truncated, untrusted: true };
}