import type { Express } from "express";
import { isAuthenticated } from "./replit_integrations/auth/replitAuth";
import { aiBurstLimiters } from "./replit_integrations/quota";
import { parseAttachment } from "./attachment-parse";
import { storage } from "./storage";
import { hasEmbeddingProvider } from "./embeddings";
import { ingestDocument } from "./knowledge";

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/** Only inline bytes: never accept a client-supplied URL or local path. */
export function validateDocumentUpload(body: any) {
  const { name, data, title } = body || {};
  if (typeof name !== "string" || name.length > 200 || !/\.(pdf|txt|md|csv|json)$/i.test(name)) return null;
  if (typeof data !== "string" || !data.length || data.length > Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 ||
      data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) return null;
  const extension = name.split(".").pop()!.toLowerCase();
  const mimetype = ({ pdf: "application/pdf", txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json" })[extension]!;
  return { originalName: name, mimetype, dataUrl: `data:${mimetype};base64,${data}`, title: typeof title === "string" && title.trim() ? title.trim().slice(0, 200) : name };
}

export function registerKnowledgeUploadRoutes(app: Express) {
  app.post("/api/knowledge/upload", isAuthenticated, aiBurstLimiters.chat, async (req: any, res) => {
    const userId = req.user?.claims?.sub || req.user?.claims?.id || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Authentication required." });
    const input = validateDocumentUpload(req.body);
    if (!input) return res.status(400).json({ message: "Upload a PDF, TXT, Markdown, CSV or JSON file up to 5 MB." });
    try {
      if (!hasEmbeddingProvider()) return res.status(503).json({ message: "Document indexing is unavailable." });
      const parsed = await parseAttachment(input);
      if (!parsed.ok || !parsed.text?.trim()) return res.status(422).json({ message: "Unable to extract text. Use a text-based document; scanned PDFs are not supported." });
      if (res.destroyed) return;
      const doc = await storage.createKnowledgeDocument({
        userId, title: input.title, sourceType: "file", sourceRef: input.originalName, content: parsed.text,
      });
      void ingestDocument(doc).catch(() => {});
      res.status(201).json(doc);
    } catch {
      res.status(500).json({ message: "Unable to import document." });
    }
  });
}