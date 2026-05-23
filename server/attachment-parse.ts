// Extract readable text from PDF / CSV / plain-text attachments so the chat
// model can actually read what the user uploaded instead of getting a bare
// "[Attached file: contacts.pdf]" placeholder.
//
// Used by server/replit_integrations/chat/routes.ts when building the
// per-turn chatMessages array. Network-fetches the file from its stored URL
// (R2 https URL or local /uploads/... path), parses by mimetype, and returns
// a single string ready to splice into the user message.

import fs from "fs";
import path from "path";
import { parse as parseCsv } from "csv-parse/sync";

// pdf-parse is CommonJS-only with no proper ESM default export. We use a lazy
// dynamic import so this works in BOTH dev (tsx native ESM) and prod (esbuild
// CJS bundle). The previous createRequire(import.meta.url) approach broke in
// the CJS bundle where import.meta is empty — esbuild warned about it and
// PDF parsing would silently fail in production.
let _pdfParse: ((buf: Buffer) => Promise<{ text: string }>) | null = null;
async function loadPdfParse(): Promise<(buf: Buffer) => Promise<{ text: string }>> {
  if (_pdfParse) return _pdfParse;
  const mod: any = await import("pdf-parse");
  _pdfParse = (mod?.default ?? mod) as (buf: Buffer) => Promise<{ text: string }>;
  return _pdfParse;
}

const MAX_BYTES = 5 * 1024 * 1024;        // 5MB — anything bigger we refuse
const MAX_OUT_CHARS = 12_000;             // per-file cap on text sent to LLM
const MAX_CSV_ROWS = 200;                 // first N rows of any CSV
const PARSE_TIMEOUT_MS = 8_000;           // per-file CPU/parse budget
const MAX_TOTAL_OUT_CHARS = 40_000;       // aggregate context cap per request
const MAX_FILES_PARSED = 5;               // never parse more than N attachments per turn

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export const PARSEABLE_MIMETYPES = new Set<string>([
  "application/pdf",
  "text/csv",
  "application/csv",
  "text/plain",
  "text/markdown",
  "application/json",
]);

export function isParseableAttachment(mimetype?: string | null, filename?: string | null): boolean {
  if (mimetype && PARSEABLE_MIMETYPES.has(mimetype.toLowerCase())) return true;
  if (!filename) return false;
  return /\.(pdf|csv|txt|md|json)$/i.test(filename);
}

// Whitelist of storage origins we trust to serve attachment bytes. A user-
// supplied attachment.url that isn't a relative /uploads/ path AND isn't on
// one of these hosts is refused — without this, a malicious client could
// post `{ url: "http://169.254.169.254/..." }` and force the server to SSRF
// internal endpoints when parsing the "attachment".
function isAllowedAttachmentHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h.endsWith(".r2.cloudflarestorage.com")) return true; // R2 bucket
  if (h.endsWith(".r2.dev")) return true;                   // R2 public dev domain
  const customCdn = (process.env.R2_PUBLIC_HOST || process.env.UPLOAD_CDN_HOST || "").toLowerCase();
  if (customCdn && h === customCdn) return true;
  return false;
}

async function loadBuffer(att: { url?: string; dataUrl?: string }): Promise<Buffer | null> {
  if (att.dataUrl && att.dataUrl.startsWith("data:")) {
    const comma = att.dataUrl.indexOf(",");
    if (comma > 0) {
      const b64 = att.dataUrl.slice(comma + 1);
      const buf = Buffer.from(b64, "base64");
      if (buf.length > MAX_BYTES) return null;
      return buf;
    }
  }
  if (!att.url) return null;

  // Absolute https URL — must be on a whitelisted storage host (R2 / CDN).
  // Rejecting arbitrary http(s) URLs here closes an SSRF hole where a forged
  // attachment.url could point to internal services.
  if (/^https?:\/\//i.test(att.url)) {
    let parsed: URL;
    try { parsed = new URL(att.url); } catch { return null; }
    if (parsed.protocol !== "https:") return null;
    if (!isAllowedAttachmentHost(parsed.hostname)) {
      console.warn(`[attachment-parse] refused non-whitelisted host: ${parsed.hostname}`);
      return null;
    }
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(parsed.toString(), { signal: controller.signal, redirect: "error" });
        if (!res.ok) return null;
        const len = Number(res.headers.get("content-length") || 0);
        if (len && len > MAX_BYTES) return null;
        const ab = await res.arrayBuffer();
        if (ab.byteLength > MAX_BYTES) return null;
        return Buffer.from(ab);
      } finally {
        clearTimeout(t);
      }
    } catch {
      return null;
    }
  }

  // Local /uploads/<filename> — only files inside the configured upload dir
  // are readable. Strip leading slash, join with project root.
  try {
    const rel = att.url.startsWith("/") ? att.url.slice(1) : att.url;
    // sandbox: resolve and ensure it stays under the project / /tmp/uploads
    const candidates = [
      path.join(process.cwd(), rel),
      path.join("/tmp", rel.replace(/^uploads\//, "uploads/")),
    ];
    for (const p of candidates) {
      try {
        const resolved = path.resolve(p);
        const allowedRoots = [
          path.resolve(process.cwd(), "public", "uploads"),
          path.resolve(process.cwd(), "uploads"),
          path.resolve("/tmp", "uploads"),
        ];
        if (!allowedRoots.some((root) => resolved.startsWith(root + path.sep) || resolved === root)) {
          continue;
        }
        if (!fs.existsSync(resolved)) continue;
        const stat = fs.statSync(resolved);
        if (stat.size > MAX_BYTES) return null;
        return fs.readFileSync(resolved);
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function clip(text: string, limit = MAX_OUT_CHARS): string {
  const cleaned = text.replace(/\u0000/g, "").replace(/\s+\n/g, "\n");
  if (cleaned.length <= limit) return cleaned;
  return cleaned.slice(0, limit) + `\n\n[... truncated, file is longer than ${limit} chars ...]`;
}

export type ParsedAttachment = {
  ok: boolean;
  name: string;
  kind: "pdf" | "csv" | "text" | "json" | "unknown";
  text?: string;
  error?: string;
};

export async function parseAttachment(att: {
  url?: string;
  dataUrl?: string;
  mimetype?: string;
  originalName?: string;
}): Promise<ParsedAttachment> {
  const name = att.originalName || "file";
  const mt = (att.mimetype || "").toLowerCase();

  if (!isParseableAttachment(mt, name)) {
    return { ok: false, name, kind: "unknown", error: "unsupported file type" };
  }

  const buf = await loadBuffer(att);
  if (!buf) return { ok: false, name, kind: "unknown", error: "file unavailable or too large" };

  // --- PDF ---
  if (mt === "application/pdf" || /\.pdf$/i.test(name)) {
    try {
      // Hard timeout: pdf-parse is sync-CPU on the event loop and a crafted
      // PDF can spike for many seconds. After PARSE_TIMEOUT_MS we abandon.
      const pdfParse = await loadPdfParse();
      const data = await withTimeout(pdfParse(buf), PARSE_TIMEOUT_MS, "PDF parse");
      const text = clip((data?.text || "").trim());
      if (!text) return { ok: false, name, kind: "pdf", error: "no extractable text (image-only PDF?)" };
      return { ok: true, name, kind: "pdf", text };
    } catch (e: any) {
      return { ok: false, name, kind: "pdf", error: e?.message || "PDF parse failed" };
    }
  }

  // --- CSV ---
  if (mt === "text/csv" || mt === "application/csv" || /\.csv$/i.test(name)) {
    try {
      const records: any[] = await withTimeout(
        Promise.resolve().then(() =>
          parseCsv(buf, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_quotes: true,
            relax_column_count: true,
            to: MAX_CSV_ROWS + 1, // tell parser to stop early
          }),
        ),
        PARSE_TIMEOUT_MS,
        "CSV parse",
      );
      const total = records.length;
      const slice = records.slice(0, MAX_CSV_ROWS);
      const header = total > MAX_CSV_ROWS
        ? `CSV with ${total}+ rows (showing first ${MAX_CSV_ROWS}):\n`
        : `CSV with ${total} row${total === 1 ? "" : "s"}:\n`;
      return { ok: true, name, kind: "csv", text: clip(header + JSON.stringify(slice, null, 2)) };
    } catch (e: any) {
      // Fall back to raw text if csv-parse can't make sense of it
      const raw = buf.toString("utf8");
      return { ok: true, name, kind: "csv", text: clip(raw) };
    }
  }

  // --- JSON ---
  if (mt === "application/json" || /\.json$/i.test(name)) {
    try {
      const parsed = JSON.parse(buf.toString("utf8"));
      return { ok: true, name, kind: "json", text: clip(JSON.stringify(parsed, null, 2)) };
    } catch {
      return { ok: true, name, kind: "json", text: clip(buf.toString("utf8")) };
    }
  }

  // --- Plain text / markdown ---
  return { ok: true, name, kind: "text", text: clip(buf.toString("utf8")) };
}

/**
 * Parse every attachment that looks readable and format as a single context
 * block ready to splice into the user message. Returns "" if nothing parsed.
 */
export async function buildAttachmentContext(
  attachments: Array<{ url?: string; dataUrl?: string; mimetype?: string; originalName?: string }>,
): Promise<string> {
  if (!attachments || attachments.length === 0) return "";
  const parseable = attachments
    .filter((a) => isParseableAttachment(a.mimetype, a.originalName))
    .slice(0, MAX_FILES_PARSED);
  if (parseable.length === 0) return "";

  // Sequential — not Promise.all — so one slow PDF can't stack CPU spikes
  // alongside other parses. Aggregate-byte cap also stops here.
  const results: ParsedAttachment[] = [];
  let totalChars = 0;
  for (const a of parseable) {
    if (totalChars >= MAX_TOTAL_OUT_CHARS) {
      results.push({ ok: false, name: a.originalName || "file", kind: "unknown", error: "context budget exhausted" });
      continue;
    }
    const r = await parseAttachment(a);
    if (r.ok && r.text) {
      const remaining = MAX_TOTAL_OUT_CHARS - totalChars;
      if (r.text.length > remaining) {
        r.text = r.text.slice(0, remaining) + "\n[... truncated to fit request budget ...]";
      }
      totalChars += r.text.length;
    }
    results.push(r);
  }
  const ok = results.filter((r) => r.ok && r.text);
  const failed = results.filter((r) => !r.ok);

  if (ok.length === 0 && failed.length === 0) return "";

  const blocks = ok.map(
    (r) => `FILE: ${r.name} (${r.kind})\n---\n${r.text}`,
  );

  let footer = "";
  if (failed.length > 0) {
    footer = `\n\nNote: could not parse ${failed.length} file(s): ${failed
      .map((f) => `${f.name} (${f.error || "failed"})`)
      .join(", ")}`;
  }

  if (blocks.length === 0) {
    return `\n\n=== ATTACHED FILES ===\n${footer.trim()}\n=== END ATTACHED FILES ===\n`;
  }

  return `\n\n=== ATTACHED FILES (parsed just now from the user's uploads) ===\nUse the text below as the authoritative content of the user's uploaded files. Do NOT invent names, numbers, or rows that aren't present.\n\n${blocks.join(
    "\n\n=========\n\n",
  )}${footer}\n=== END ATTACHED FILES ===\n`;
}
