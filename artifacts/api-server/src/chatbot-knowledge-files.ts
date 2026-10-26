import crypto from "node:crypto";
import type { Express, RequestHandler } from "express";
import { d1GetDatabaseInfo, d1Query, isD1Configured } from "./d1";
import { storage } from "./storage";
import type { ScanResult } from "./chatbot-autoscan";
import type { InsertChatbotWidget } from "@shared/schema";
import { manualKnowledge } from "./chatbot-support";

export class KnowledgeFileError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function validateKnowledgeFile(path: unknown, content?: unknown) {
  if (typeof path !== "string" || !/^(knowledge|scan-[a-f0-9]{32})\.md$/.test(path)) {
    throw new KnowledgeFileError(400, "Invalid knowledge filename");
  }
  if (content !== undefined && (typeof content !== "string" || Buffer.byteLength(content, "utf8") > 65536)) {
    throw new KnowledgeFileError(400, "Knowledge files must be text, at most 64 KB");
  }
  return path;
}
let identity: { target: string; until: number } | undefined;
async function query(sql: string, params: unknown[]) {
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const expectedName = process.env.PROJECT_FILES_D1_DATABASE_NAME;
  if (!isD1Configured() || !expectedName || expectedName === "afro-ai-auth") {
    throw new KnowledgeFileError(503, "Private knowledge storage is not configured. Ask the operator to check the project-files D1 settings.");
  }
  const target = `${databaseId}:${expectedName}`;
  try {
    if (!identity || identity.target !== target || identity.until < Date.now()) {
      const actual = await d1GetDatabaseInfo();
      if (actual.uuid !== databaseId || actual.name !== expectedName || actual.name === "afro-ai-auth") {
        throw new KnowledgeFileError(503, "Private knowledge storage identity check failed.");
      }
      identity = { target, until: Date.now() + 120_000 };
    }
    return await d1Query(sql, params);
  } catch (error) {
    if (error instanceof KnowledgeFileError) throw error;
    // Provider messages can contain SQL, content and identifiers.
    console.error("[knowledge-files] D1 operation failed");
    throw new KnowledgeFileError(503, "Private knowledge storage unavailable. Check connectivity and apply knowledge-folder migration 004 to the project-files D1 database.");
  }
}
export async function listKnowledgeFiles(userId: string, widgetId: number) {
  return (await query(
    "SELECT path, version, updated_at, length(CAST(content AS BLOB)) AS bytes FROM chatbot_knowledge_files WHERE user_id = ? AND widget_id = ? ORDER BY path",
    [userId, widgetId],
  )).results;
}
export async function readKnowledgeFile(userId: string, widgetId: number, path: string) {
  validateKnowledgeFile(path);
  const file = (await query(
    "SELECT path, content, version, updated_at FROM chatbot_knowledge_files WHERE user_id = ? AND widget_id = ? AND path = ?",
    [userId, widgetId, path],
  )).results[0];
  if (!file) throw new KnowledgeFileError(404, "Knowledge file not found");
  return file;
}
export async function writeKnowledgeFile(userId: string, widgetId: number, path: string, content: string, version: unknown) {
  validateKnowledgeFile(path, content);
  if (version !== null && (!Number.isSafeInteger(version) || Number(version) < 1)) {
    throw new KnowledgeFileError(400, "A file version is required; reopen the file before saving");
  }
  const result = version === null
    ? await query(`INSERT INTO chatbot_knowledge_files (user_id, widget_id, path, content)
        SELECT ?, ?, ?, ? WHERE (SELECT count(*) FROM chatbot_knowledge_files WHERE user_id = ? AND widget_id = ?) < 200
        ON CONFLICT (user_id, widget_id, path) DO NOTHING RETURNING path, content, version, updated_at`,
        [userId, widgetId, path, content, userId, widgetId])
    : await query(`UPDATE chatbot_knowledge_files SET content = ?, version = version + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE user_id = ? AND widget_id = ? AND path = ? AND version = ?
        RETURNING path, content, version, updated_at`,
        [content, userId, widgetId, path, version]);
  const file = result.results[0];
  if (!file) throw new KnowledgeFileError(409, "The file changed or the folder limit was reached. Reopen it before saving; your draft has not been overwritten.");
  return file;
}
export async function deleteKnowledgeFolder(userId: string, widgetId: number) {
  await query("DELETE FROM chatbot_knowledge_files WHERE user_id = ? AND widget_id = ?", [userId, widgetId]);
}
export async function createWidgetWithPrivateKnowledge(data: InsertChatbotWidget) {
  const { db } = await import("./db");
  const { chatbotWidgets } = await import("@shared/schema");
  if (data.knowledgeBase && data.knowledgeBase.length > 8000) throw new KnowledgeFileError(400, "Approved knowledge is limited to 8,000 characters");
  return db.transaction(async tx => {
    const [widget] = await tx.insert(chatbotWidgets).values(data).returning();
    // If private saving fails, the new chatbot is rolled back, not left as a
    // duplicate that the owner unknowingly creates again on retry.
    if (data.knowledgeBase) await writeKnowledgeFile(data.userId, widget.id, "knowledge.md", data.knowledgeBase, null);
    return widget;
  });
}
export async function archiveScan(userId: string, widgetId: number, result: ScanResult) {
  if (!result.rows.length || !result.pagesScanned) throw new Error("No usable website knowledge extracted");
  const existing = await listKnowledgeFiles(userId, widgetId);
  for (const source of result.sources || []) {
    const path = `scan-${crypto.createHash("sha256").update(source.url).digest("hex").slice(0, 32)}.md`;
    const content = `# ${source.title || "Scanned website"}\nSource: ${source.url}\n\n${manualKnowledge(source.text)}`;
    const file = existing.find(f => f.path === path);
    // Preserve owner-edited source files instead of overwriting them on rescan.
    if (!file) await writeKnowledgeFile(userId, widgetId, path, content, null);
  }
}

export function registerChatbotKnowledgeRoutes(app: Express, auth: RequestHandler) {
  const owned: RequestHandler = async (req: any, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Cookie, Authorization");
    const userId = req.user?.claims?.sub;
    const id = Number(req.params.id);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: "Invalid chatbot" });
    try {
      const widget = await storage.getChatbotWidgetById(id);
      // No admin/founder bypass and no public widget API-key authentication.
      if (!widget || widget.userId !== userId) return res.status(404).json({ message: "Not found" });
      res.locals.knowledgeOwner = { userId, id };
      next();
    } catch { res.status(503).json({ message: "Could not verify ownership" }); }
  };
  const handle = (fn: (req: any, res: any, owner: { userId: string; id: number }) => Promise<any>): RequestHandler =>
    async (req, res) => {
      try { await fn(req, res, res.locals.knowledgeOwner); }
      catch (error) {
        res.status(error instanceof KnowledgeFileError ? error.status : 500)
          .json({ message: error instanceof KnowledgeFileError ? error.message : "Knowledge operation failed. Please retry." });
      }
    };
  const base = "/api/chatbots/:id/knowledge-files";
  app.get(base, auth, owned, handle(async (_req, res, owner) => {
    res.json({ backend: "D1", folder: `chatbots/${owner.id}/knowledge`, files: await listKnowledgeFiles(owner.userId, owner.id) });
  }));
  app.get(`${base}/:file`, auth, owned, handle(async (req, res, owner) => {
    const file = await readKnowledgeFile(owner.userId, owner.id, req.params.file);
    if (req.query.download === "1") {
      res.setHeader("Content-Disposition", `attachment; filename="${file.path}"`);
      return res.type("text/plain").send(file.content);
    }
    res.json(file);
  }));
  app.put(`${base}/:file`, auth, owned, handle(async (req, res, owner) => {
    const { content, version, publish } = req.body || {};
    validateKnowledgeFile(req.params.file, content);
    if (typeof content !== "string") throw new KnowledgeFileError(400, "Text content required");
    if (publish && req.params.file !== "knowledge.md") throw new KnowledgeFileError(400, "Add source content to the knowledge draft before publishing");
    if (publish && content.length > 8000) throw new KnowledgeFileError(400, "Approved knowledge is limited to 8,000 characters");
    const file = await writeKnowledgeFile(owner.userId, owner.id, req.params.file, content, version);
    if (publish) {
      try { await storage.updateChatbotWidget(owner.id, { knowledgeBase: content }); }
      catch {
        return res.status(502).json({ message: "Saved privately in D1, but could not update the live chatbot. Reopen the saved file and retry publishing.", saved: true, file });
      }
    }
    res.json({ ...file, published: !!publish });
  }));
  app.delete(`${base}/:file`, auth, owned, handle(async (req, res, owner) => {
    const path = validateKnowledgeFile(req.params.file);
    if (path === "knowledge.md") throw new KnowledgeFileError(400, "To clear approved knowledge, empty the draft and save it");
    const version = Number(req.query.version);
    if (!Number.isSafeInteger(version) || version < 1) throw new KnowledgeFileError(400, "File version required");
    const deleted = await query(
      "DELETE FROM chatbot_knowledge_files WHERE user_id = ? AND widget_id = ? AND path = ? AND version = ? RETURNING path",
      [owner.userId, owner.id, path, version]);
    if (!deleted.results.length) throw new KnowledgeFileError(409, "The file changed. Reopen it before deleting.");
    res.json({ success: true });
  }));
}
