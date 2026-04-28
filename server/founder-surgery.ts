import fs from "fs";
import path from "path";
import crypto from "crypto";
import { aiChatComplete } from "./ai-chat-provider";

const PROJECT_ROOT = process.cwd();
const BACKUP_ROOT = path.join(PROJECT_ROOT, ".surgery-backups");
const AUDIT_LOG = path.join(PROJECT_ROOT, ".surgery-log.jsonl");

const ALLOWED_PREFIXES = [
  "client/src/",
  "client/public/",
  "server/",
  "shared/",
];

const BLOCKED_PATHS = new Set([
  "server/founder-surgery.ts",
  "server/replit_integrations/auth/replitAuth.ts",
  "server/replit_integrations/auth/storage.ts",
  "server/replit_integrations/auth/cfBridge.ts",
  "server/replit_integrations/auth/index.ts",
  "server/replit_integrations/auth/routes.ts",
  "server/db.ts",
  "server/index.ts",
  "server/vite.ts",
]);

const BLOCKED_FRAGMENTS = [
  "/.env",
  ".env.",
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  "secrets",
  "package.json",
  "package-lock.json",
  "drizzle.config.ts",
  "vite.config.ts",
  "tsconfig.json",
  ".surgery-backups/",
  ".surgery-log",
];

export type SurgeryAction = "replace" | "create" | "delete";

export interface SurgeryFile {
  path: string;
  action: SurgeryAction;
  newContent?: string;
  reason?: string;
}

export interface SurgeryPlan {
  summary: string;
  files: SurgeryFile[];
}

export interface ProposalResult {
  planId: string;
  plan: SurgeryPlan;
  diffs: { path: string; action: SurgeryAction; before: string; after: string }[];
  warnings: string[];
}

interface StoredPlan {
  plan: SurgeryPlan;
  founderId: string;
  createdAt: number;
}

const pendingPlans = new Map<string, StoredPlan>();
const PLAN_TTL_MS = 15 * 60 * 1000; // 15 minutes

function gcPlans() {
  const now = Date.now();
  pendingPlans.forEach((p, id) => {
    if (now - p.createdAt > PLAN_TTL_MS) pendingPlans.delete(id);
  });
}

/**
 * Canonicalize a relative path the AI proposed:
 *  - Reject anything that isn't a non-empty string.
 *  - Replace \\ with /, strip leading ./.
 *  - Reject absolute paths and any segment of "" / "." / ".." (which collapses
 *    sneaky forms like "server//vite.ts" or "server/./vite.ts" before we
 *    check the blocklist).
 *  - Re-join from validated segments so the form we test against
 *    BLOCKED_PATHS is identical to the form we eventually write to.
 */
function canonicalizeRelPath(relPath: string): { ok: true; canon: string } | { ok: false; reason: string } {
  if (!relPath || typeof relPath !== "string") return { ok: false, reason: "empty path" };
  let s = relPath.replace(/\\/g, "/").trim();
  while (s.startsWith("./")) s = s.slice(2);
  if (s === "" || s === "." || s === "..") return { ok: false, reason: "empty path" };
  if (s.startsWith("/")) return { ok: false, reason: "absolute paths not allowed" };
  const parts = s.split("/");
  for (const seg of parts) {
    if (seg === "" || seg === "." ) return { ok: false, reason: "path contains empty or '.' segment" };
    if (seg === "..") return { ok: false, reason: "parent traversal not allowed" };
    if (seg.includes("\0")) return { ok: false, reason: "null byte in path" };
  }
  return { ok: true, canon: parts.join("/") };
}

export function isPathSafe(relPath: string): { ok: boolean; reason?: string; canon?: string } {
  const canonRes = canonicalizeRelPath(relPath);
  if (!canonRes.ok) return canonRes;
  const canon = canonRes.canon;

  if (BLOCKED_PATHS.has(canon)) return { ok: false, reason: "this file is protected" };
  for (const frag of BLOCKED_FRAGMENTS) {
    if (canon.includes(frag)) return { ok: false, reason: `path contains blocked fragment '${frag}'` };
  }
  if (!ALLOWED_PREFIXES.some((p) => canon.startsWith(p))) {
    return { ok: false, reason: `only ${ALLOWED_PREFIXES.join(", ")} are editable` };
  }
  // Resolve against project root and ensure no escape.
  const abs = path.resolve(PROJECT_ROOT, canon);
  if (abs !== PROJECT_ROOT && !abs.startsWith(PROJECT_ROOT + path.sep)) {
    return { ok: false, reason: "resolves outside project" };
  }
  return { ok: true, canon };
}

/**
 * Defence-in-depth check performed at write time. isPathSafe protects against
 * crafted strings; this protects against the filesystem itself — symlinks
 * pointing outside PROJECT_ROOT or to protected files (directly or via a
 * symlinked ancestor directory).
 *
 * Strategy: realpath the deepest *existing* ancestor of the target, then
 * append any not-yet-existing segments. The resulting canonical project-
 * relative path is re-validated against ALLOWED_PREFIXES, BLOCKED_PATHS, and
 * BLOCKED_FRAGMENTS. This closes the "symlink ancestor → protected file"
 * bypass (e.g. `server/x` symlinks to `server/replit_integrations/auth`,
 * then `server/x/replitAuth.ts` would otherwise resolve to a protected file).
 */
function isFsTargetSafe(canonRelPath: string): { ok: boolean; reason?: string } {
  const segments = canonRelPath.split("/");
  let existingDepth = segments.length;
  let realBase = PROJECT_ROOT;
  for (let i = segments.length; i >= 0; i--) {
    const partial = path.join(PROJECT_ROOT, ...segments.slice(0, i));
    try {
      realBase = fs.realpathSync(partial);
      existingDepth = i;
      break;
    } catch (err: any) {
      if (err && err.code === "ENOENT") continue;
      return { ok: false, reason: `cannot resolve ${segments.slice(0, i).join("/")}: ${err?.message || err}` };
    }
  }

  // Build the fully-resolved final target path (real ancestor + still-virtual
  // remaining segments). Reject any remaining segment that is itself unsafe
  // (defence in depth — segments are validated already, but be explicit).
  const remaining = segments.slice(existingDepth);
  for (const seg of remaining) {
    if (seg === "" || seg === "." || seg === "..") {
      return { ok: false, reason: "unsafe remaining segment" };
    }
  }
  const resolvedTarget = remaining.length > 0
    ? path.join(realBase, ...remaining)
    : realBase;

  if (resolvedTarget !== PROJECT_ROOT && !resolvedTarget.startsWith(PROJECT_ROOT + path.sep)) {
    return { ok: false, reason: "symlink escapes project root" };
  }

  const resolvedRel = path.relative(PROJECT_ROOT, resolvedTarget).replace(/\\/g, "/");
  if (resolvedRel === "") return { ok: false, reason: "target is project root" };

  // Re-apply the same allowlist + blocklist checks as isPathSafe, but on the
  // *post-symlink* canonical path. This is what catches a symlinked ancestor
  // directory pointing into protected territory.
  if (BLOCKED_PATHS.has(resolvedRel)) {
    return { ok: false, reason: "resolved target is a protected file" };
  }
  for (const frag of BLOCKED_FRAGMENTS) {
    if (resolvedRel.includes(frag)) {
      return { ok: false, reason: `resolved target contains blocked fragment '${frag}'` };
    }
  }
  if (!ALLOWED_PREFIXES.some((p) => resolvedRel.startsWith(p))) {
    return { ok: false, reason: "resolved target is outside the editable prefixes" };
  }
  return { ok: true };
}

function listProjectTree(maxDepth = 3): string {
  const lines: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = path.relative(PROJECT_ROOT, path.join(dir, entry.name)).replace(/\\/g, "/");
      if (
        rel.startsWith("node_modules") ||
        rel.startsWith(".git") ||
        rel.startsWith(".surgery-") ||
        rel.startsWith("dist") ||
        rel.startsWith("attached_assets") ||
        rel === ".local"
      ) continue;
      if (entry.isDirectory()) {
        if (ALLOWED_PREFIXES.some((p) => rel.startsWith(p) || p.startsWith(rel + "/")) || depth === 0) {
          lines.push(rel + "/");
          walk(path.join(dir, entry.name), depth + 1);
        }
      } else {
        if (ALLOWED_PREFIXES.some((p) => rel.startsWith(p))) {
          lines.push(rel);
        }
      }
    }
  }
  walk(PROJECT_ROOT, 0);
  return lines.join("\n");
}

const SURGEON_SYSTEM_PROMPT = `You are a careful code surgeon for the Afro AI codebase (Express + React + TypeScript + Drizzle).

You will be given:
1. A directory tree of editable files
2. The contents of files relevant to the task
3. A founder instruction describing a code change

Your job: produce a precise patch plan as JSON.

You MAY only edit files inside: client/src/, client/public/, server/, shared/
You MAY NOT touch: package.json, vite.config.ts, drizzle.config.ts, tsconfig.json, any .env, server/index.ts, server/db.ts, server/vite.ts, anything in server/replit_integrations/auth/, server/founder-surgery.ts.

If the requested change requires touching protected files, set files=[] and explain in summary.

For replace actions you MUST return the COMPLETE new file content (not a diff, not snippets).
For create actions you MUST return the full content for a new file.
Keep changes MINIMAL and SURGICAL — only change what the instruction asks for. Preserve all unrelated code byte-for-byte.

Match the codebase's existing style: TypeScript, ES modules, shadcn/ui components, tailwind classes, drizzle-orm patterns.

If you are not confident the change will work without breaking the build, set files=[] and explain what you'd need to know.`;

interface ReadStepResponse {
  filesToRead: string[];
  reasoning?: string;
}

async function planFilesToRead(instruction: string, tree: string): Promise<string[]> {
  const result = await aiChatComplete({
    messages: [
      { role: "system", content: SURGEON_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Project tree (editable files only):\n${tree}\n\nInstruction:\n${instruction}\n\nList up to 8 file paths from the tree above that you need to READ before you can make this change. Pick the most likely files. Reply with JSON ONLY in this shape: { "filesToRead": ["path/to/file.ts", ...], "reasoning": "..." }`,
      },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0.2,
    maxTokens: 600,
  });
  try {
    const parsed = JSON.parse(result.text) as ReadStepResponse;
    const list = Array.isArray(parsed.filesToRead) ? parsed.filesToRead : [];
    return list.filter((p) => isPathSafe(p).ok && fs.existsSync(path.join(PROJECT_ROOT, p))).slice(0, 8);
  } catch {
    return [];
  }
}

function readFilesForContext(paths: string[]): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  let totalBytes = 0;
  const MAX_BYTES = 240_000; // ~60k tokens
  for (const p of paths) {
    try {
      const abs = path.join(PROJECT_ROOT, p);
      const content = fs.readFileSync(abs, "utf-8");
      if (totalBytes + content.length > MAX_BYTES) {
        out.push({ path: p, content: content.slice(0, Math.max(0, MAX_BYTES - totalBytes)) + "\n/* ... truncated for context ... */" });
        break;
      }
      out.push({ path: p, content });
      totalBytes += content.length;
    } catch {
      // ignore
    }
  }
  return out;
}

async function generatePatchPlan(
  instruction: string,
  tree: string,
  fileContents: { path: string; content: string }[],
): Promise<SurgeryPlan> {
  const filesBlock = fileContents
    .map((f) => `=== FILE: ${f.path} ===\n${f.content}`)
    .join("\n\n");

  const result = await aiChatComplete({
    messages: [
      { role: "system", content: SURGEON_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Project tree (editable files only):\n${tree}\n\nCurrent file contents:\n${filesBlock}\n\nInstruction:\n${instruction}\n\nReturn the patch plan as JSON ONLY in this exact shape:
{
  "summary": "1-3 sentence plain-language summary of what will change",
  "files": [
    { "path": "client/src/...", "action": "replace", "newContent": "<COMPLETE NEW FILE CONTENT>", "reason": "why this changes" }
  ]
}
Use action "replace" to update an existing file (newContent = full new content).
Use action "create" for a new file (newContent = full content).
Use action "delete" for removing a file (no newContent).
If you cannot safely complete the request, return { "summary": "explain why", "files": [] }.`,
      },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0.2,
    maxTokens: 16000,
  });

  let parsed: any;
  try {
    parsed = JSON.parse(result.text);
  } catch (err) {
    throw new Error("AI returned invalid JSON for surgery plan.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("AI returned an unexpected plan shape.");
  const summary = typeof parsed.summary === "string" ? parsed.summary : "(no summary)";
  const files: SurgeryFile[] = Array.isArray(parsed.files) ? parsed.files : [];
  return { summary, files };
}

export async function proposeSurgery(opts: { instruction: string; founderId: string }): Promise<ProposalResult> {
  gcPlans();
  const tree = listProjectTree(3);
  const filesToRead = await planFilesToRead(opts.instruction, tree);
  const fileContents = readFilesForContext(filesToRead);
  const plan = await generatePatchPlan(opts.instruction, tree, fileContents);

  const warnings: string[] = [];
  const safeFiles: SurgeryFile[] = [];
  for (const f of plan.files) {
    const check = isPathSafe(f.path);
    if (!check.ok) {
      warnings.push(`Skipped ${f.path}: ${check.reason}`);
      continue;
    }
    if (f.action !== "replace" && f.action !== "create" && f.action !== "delete") {
      warnings.push(`Skipped ${f.path}: unknown action '${f.action}'`);
      continue;
    }
    if ((f.action === "replace" || f.action === "create") && typeof f.newContent !== "string") {
      warnings.push(`Skipped ${f.path}: missing newContent`);
      continue;
    }
    safeFiles.push(f);
  }

  const finalPlan: SurgeryPlan = { summary: plan.summary, files: safeFiles };

  // Compute before/after for display
  const diffs = safeFiles.map((f) => {
    let before = "";
    if (f.action !== "create") {
      try {
        before = fs.readFileSync(path.join(PROJECT_ROOT, f.path), "utf-8");
      } catch {
        before = "(file does not exist)";
      }
    }
    const after = f.action === "delete" ? "(file will be deleted)" : (f.newContent || "");
    return { path: f.path, action: f.action, before, after };
  });

  const planId = crypto.randomBytes(12).toString("hex");
  pendingPlans.set(planId, { plan: finalPlan, founderId: opts.founderId, createdAt: Date.now() });

  return { planId, plan: finalPlan, diffs, warnings };
}

export interface ApplyResult {
  applied: { path: string; action: SurgeryAction; backedUpTo?: string }[];
  failed: { path: string; reason: string }[];
  backupDir: string;
}

export async function applySurgery(opts: { planId: string; founderId: string }): Promise<ApplyResult> {
  gcPlans();
  const stored = pendingPlans.get(opts.planId);
  if (!stored) throw new Error("Plan not found or expired. Re-run the surgery command.");
  if (stored.founderId !== opts.founderId) throw new Error("This plan belongs to a different session.");

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(BACKUP_ROOT, ts);
  fs.mkdirSync(backupDir, { recursive: true });

  const applied: ApplyResult["applied"] = [];
  const failed: ApplyResult["failed"] = [];

  for (const f of stored.plan.files) {
    const check = isPathSafe(f.path);
    if (!check.ok || !check.canon) {
      failed.push({ path: f.path, reason: check.reason || "unsafe path" });
      continue;
    }
    const canon = check.canon;
    // Defence-in-depth: re-check the live filesystem for symlink shenanigans
    // in case the project tree changed between propose and apply.
    const fsCheck = isFsTargetSafe(canon);
    if (!fsCheck.ok) {
      failed.push({ path: canon, reason: fsCheck.reason || "filesystem check failed" });
      continue;
    }
    const abs = path.join(PROJECT_ROOT, canon);
    try {
      let backedUpTo: string | undefined;
      if (fs.existsSync(abs)) {
        const backupAbs = path.join(backupDir, canon);
        fs.mkdirSync(path.dirname(backupAbs), { recursive: true });
        fs.copyFileSync(abs, backupAbs);
        backedUpTo = path.relative(PROJECT_ROOT, backupAbs).replace(/\\/g, "/");
      }

      if (f.action === "delete") {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } else {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, f.newContent ?? "", "utf-8");
      }
      applied.push({ path: canon, action: f.action, backedUpTo });
    } catch (err: any) {
      failed.push({ path: canon, reason: err?.message || String(err) });
    }
  }

  // Audit log
  try {
    const entry = {
      at: new Date().toISOString(),
      founderId: opts.founderId,
      planId: opts.planId,
      summary: stored.plan.summary,
      backupDir: path.relative(PROJECT_ROOT, backupDir).replace(/\\/g, "/"),
      applied,
      failed,
    };
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + "\n");
  } catch (logErr) {
    console.warn("[surgery] audit log write failed:", logErr);
  }

  pendingPlans.delete(opts.planId);

  // Trim old backups (keep last 20)
  try {
    const all = fs.readdirSync(BACKUP_ROOT).sort();
    while (all.length > 20) {
      const old = all.shift()!;
      fs.rmSync(path.join(BACKUP_ROOT, old), { recursive: true, force: true });
    }
  } catch {}

  return { applied, failed, backupDir: path.relative(PROJECT_ROOT, backupDir).replace(/\\/g, "/") };
}
