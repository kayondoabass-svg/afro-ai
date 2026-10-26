// Vibe-coding upgrades for the AI chat: file chips, build ledger, secrets detector,
// snippet typecheck, and per-message rollback. Mounted by registerRoutes().

import type { Express, Request, Response } from "express";
import path from "path";
import fs from "fs/promises";
import { constants as fsConstants } from "fs";
import { spawn } from "child_process";
import { db } from "./db";
import { isAuthenticated, isFounder } from "./replit_integrations/auth";
import { vibeSteps, vibeFileRefs } from "@shared/models/vibe";
import { messages, appVersions } from "@shared/models/chat";
import { eq, asc, desc } from "drizzle-orm";

const PROJECT_ROOT = process.cwd();

// Host source is founder-only. Do not expose credentials even to the file-chip viewer.
// Validate both the requested path and its canonical target to prevent symlink escapes.
function restrictedPath(rel: string): boolean {
  return rel.split(path.sep).some(part =>
    part.startsWith(".") ||
    /^(?:node_modules|secrets|credentials)$/i.test(part) ||
    /^(?:id_rsa|id_ed25519|service-account(?:\..*)?)$/i.test(part) ||
    /\.(?:pem|key|p12|pfx)$/i.test(part));
}

function withinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function safeResolve(rel: string): Promise<string | null> {
  if (!rel || path.isAbsolute(rel) || rel.includes("\\") || rel.includes("\0") ||
      rel.split("/").some(part => !part || part === "." || part === "..")) return null;
  const abs = path.resolve(PROJECT_ROOT, rel);
  if (!withinRoot(PROJECT_ROOT, abs) || restrictedPath(path.relative(PROJECT_ROOT, abs))) return null;
  const root = await fs.realpath(PROJECT_ROOT);
  const canonical = await fs.realpath(abs);
  if (!withinRoot(root, canonical) || restrictedPath(path.relative(root, canonical))) return null;
  return canonical;
}

// --- Marker parsers ---
// File chips:    [[file:path/to/file.ts:12-45]]   or [[file:path/to/file.ts]]
// Build steps:   [[step:read|edit|write|test|deploy:Label]]
// Secrets hint:  [[needs-secret:OPENAI_API_KEY:reason]]
const FILE_RE = /\[\[file:([^:\]]+)(?::(\d+)(?:-(\d+))?)?\]\]/g;
const STEP_RE = /\[\[step:([a-z]+):([^\]]+)\]\]/g;
const SECRET_RE = /\[\[needs-secret:([A-Z0-9_]+)(?::([^\]]+))?\]\]/g;

export function extractFileRefs(text: string) {
  const out: { path: string; startLine?: number; endLine?: number }[] = [];
  let m;
  while ((m = FILE_RE.exec(text)) !== null) {
    out.push({
      path: m[1].trim(),
      startLine: m[2] ? parseInt(m[2]) : undefined,
      endLine: m[3] ? parseInt(m[3]) : (m[2] ? parseInt(m[2]) : undefined),
    });
  }
  return out;
}

export function extractSteps(text: string) {
  const out: { kind: string; label: string; ord: number }[] = [];
  let m, ord = 0;
  while ((m = STEP_RE.exec(text)) !== null) {
    out.push({ kind: m[1], label: m[2].trim(), ord: ord++ });
  }
  return out;
}

// --- Secrets scanner: finds env-var references in code ---
const ENV_PATTERNS = [
  /process\.env\.([A-Z_][A-Z0-9_]+)/g,
  /process\.env\["([A-Z_][A-Z0-9_]+)"\]/g,
  /import\.meta\.env\.([A-Z_][A-Z0-9_]+)/g,
  /Deno\.env\.get\("([A-Z_][A-Z0-9_]+)"\)/g,
];
const COMMON_PUBLIC_VARS = new Set([
  "NODE_ENV", "PORT", "HOST", "PUBLIC_URL", "BASE_URL", "VERCEL_URL",
  "REPL_ID", "REPL_SLUG", "REPL_OWNER", "REPLIT_DB_URL",
]);

export function scanForSecrets(code: string): string[] {
  const found = new Set<string>();
  for (const re of ENV_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      const v = m[1];
      if (!COMMON_PUBLIC_VARS.has(v)) found.add(v);
    }
  }
  return [...found];
}

export function registerVibeRoutes(app: Express): void {
  // ---- 1. FILE CHIPS: founder-only host project source (not user app files) ----
  app.get("/api/vibe/file", isFounder, async (req: Request, res: Response) => {
    try {
      const rel = String(req.query.path || "");
      const start = req.query.start ? parseInt(String(req.query.start)) : 1;
      const end = req.query.end ? parseInt(String(req.query.end)) : start + 200;
      if (!rel) return res.status(400).json({ error: "path required" });
      let abs: string | null;
      try {
        abs = await safeResolve(rel);
      } catch (e: any) {
        if (e?.code === "ENOENT" || e?.code === "ENOTDIR") return res.status(404).json({ error: "Not found" });
        throw e;
      }
      if (!abs) return res.status(403).json({ error: "Path is outside project sandbox or restricted" });
      let content: string;
      // O_NOFOLLOW prevents the final component changing into a symlink between
      // validation and open. Only read from the validated, canonical path.
      const handle = await fs.open(abs, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      try {
        // On Linux, verify the *opened descriptor* too: an intermediate directory
        // could have been replaced after realpath() but before open().
        if (process.platform === "linux" && await fs.realpath(`/proc/self/fd/${handle.fd}`) !== abs)
          return res.status(403).json({ error: "Path changed while opening" });
        const stat = await handle.stat();
        if (!stat.isFile()) return res.status(400).json({ error: "Not a file" });
        if (stat.size > 2_000_000) return res.status(413).json({ error: "File too large" });
        content = await handle.readFile({ encoding: "utf8" });
      } finally {
        await handle.close();
      }
      const lines = content.split("\n");
      const sliceStart = Math.max(1, start);
      const sliceEnd = Math.min(lines.length, Math.max(sliceStart, end));
      const snippet = lines.slice(sliceStart - 1, sliceEnd).join("\n");
      res.json({
        path: rel,
        totalLines: lines.length,
        startLine: sliceStart,
        endLine: sliceEnd,
        snippet,
        language: detectLanguage(rel),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---- 2. BUILD LEDGER: parse + persist steps for an assistant message ----
  app.get("/api/vibe/steps/:messageId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.messageId);
      const rows = await db.select().from(vibeSteps).where(eq(vibeSteps.messageId, id)).orderBy(asc(vibeSteps.ord));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/vibe/refs/:messageId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.messageId);
      const rows = await db.select().from(vibeFileRefs).where(eq(vibeFileRefs.messageId, id));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Index a freshly-finished message: extract file/step markers and store them.
  app.post("/api/vibe/index/:messageId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.messageId);
      const [msg] = await db.select().from(messages).where(eq(messages.id, id));
      if (!msg) return res.status(404).json({ error: "Message not found" });
      const text = msg.content || "";
      const steps = extractSteps(text);
      const refs = extractFileRefs(text);
      // Replace existing rows (idempotent re-index)
      await db.delete(vibeSteps).where(eq(vibeSteps.messageId, id));
      await db.delete(vibeFileRefs).where(eq(vibeFileRefs.messageId, id));
      if (steps.length) {
        await db.insert(vibeSteps).values(steps.map(s => ({ messageId: id, kind: s.kind, label: s.label, ord: s.ord, status: "done" as const })));
      }
      if (refs.length) {
        await db.insert(vibeFileRefs).values(refs.map(r => ({ messageId: id, path: r.path, startLine: r.startLine ?? null, endLine: r.endLine ?? null })));
      }
      res.json({ steps: steps.length, refs: refs.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---- 3. SECRETS DETECTOR: scan code, return needed-vs-set vars ----
  app.post("/api/vibe/scan-secrets", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const code = String(req.body?.code || "");
      if (!code) return res.json({ needed: [], missing: [] });
      const needed = scanForSecrets(code);
      const missing = needed.filter(v => !process.env[v]);
      res.json({ needed, missing });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ---- 4. TYPECHECK: run tsc --noEmit on a snippet ----
  app.post("/api/vibe/typecheck", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const code = String(req.body?.code || "");
      const lang = String(req.body?.lang || "ts");
      if (!code) return res.json({ ok: true, errors: [] });
      const ext = lang === "tsx" ? "tsx" : lang === "js" ? "js" : "ts";
      const tmpDir = path.join(PROJECT_ROOT, ".local", "vibe-tc");
      await fs.mkdir(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, `snippet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
      await fs.writeFile(tmpFile, code);
      const errors = await new Promise<string>((resolve) => {
        let buf = "";
        const proc = spawn("npx", ["--no-install", "tsc", "--noEmit", "--esModuleInterop", "--target", "es2020", "--moduleResolution", "node", "--jsx", "react-jsx", "--skipLibCheck", tmpFile], {
          cwd: PROJECT_ROOT, timeout: 12000,
        });
        proc.stdout.on("data", (d) => { buf += d.toString(); });
        proc.stderr.on("data", (d) => { buf += d.toString(); });
        proc.on("close", () => resolve(buf));
        proc.on("error", () => resolve(buf));
      });
      await fs.unlink(tmpFile).catch(() => {});
      const lines = errors.split("\n").filter(l => l.includes("error TS")).slice(0, 20);
      res.json({ ok: lines.length === 0, errors: lines });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ---- 5. PER-MESSAGE ROLLBACK: restore the app version saved at this message ----
  // Returns the most recent app_version created at-or-before the assistant message timestamp.
  app.post("/api/vibe/rollback/:messageId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.messageId);
      const [msg] = await db.select().from(messages).where(eq(messages.id, id));
      if (!msg) return res.status(404).json({ error: "Message not found" });
      // Find the version snapshot whose createdAt <= message.createdAt for this conversation
      const versions = await db.select().from(appVersions)
        .where(eq(appVersions.conversationId, msg.conversationId))
        .orderBy(desc(appVersions.createdAt));
      const target = versions.find(v => new Date(v.createdAt).getTime() <= new Date(msg.createdAt).getTime() + 5000);
      if (!target) return res.status(404).json({ error: "No version snapshot at this point" });
      res.json({ versionId: target.id, label: target.label, html: target.htmlContent, createdAt: target.createdAt });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
}

function detectLanguage(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    json: "json", md: "markdown", html: "html", css: "css",
    py: "python", sql: "sql", sh: "shell", yml: "yaml", yaml: "yaml",
  };
  return map[ext] || "plaintext";
}
