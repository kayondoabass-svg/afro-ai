import crypto from "crypto";
import type { InsertChatbotQa } from "@shared/schema";

const UA = "Mozilla/5.0 (compatible; AfroAIBot/1.0; +https://afroaigroup.com)";

// SSRF protection: reject loopback / private / link-local / metadata IPs
function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv6 loopback / link-local / unique-local
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  // IPv4 dotted-quad checks
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1]), parseInt(m[2])];
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 127) return true;                         // loopback
    if (a === 0) return true;                           // 0.0.0.0/8
    if (a === 169 && b === 254) return true;            // link-local + AWS metadata
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a >= 224) return true;                          // multicast / reserved
  }
  return false;
}

function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (isPrivateOrLocalHost(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export type ScannedPage = {
  url: string;
  title: string;
  text: string;
  hash: string;
};

async function fetchHtml(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function htmlToText(html: string): { title: string; text: string; links: string[] } {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  const linkMatches = Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi));
  const links: string[] = linkMatches.map((m) => m[1]).filter((s): s is string => !!s);

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return { title, text: cleaned, links };
}

function normalizeUrl(href: string, base: URL): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.hostname !== base.hostname) return null; // same-host only
    if (isPrivateOrLocalHost(u.hostname)) return null;
    u.hash = "";
    // Skip non-content extensions
    if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|ico|css|js|zip|mp4|mp3|woff2?|ttf)(\?|$)/i.test(u.pathname)) return null;
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function crawlSite(startUrl: string, maxPages = 12): Promise<ScannedPage[]> {
  const start = startUrl.startsWith("http") ? startUrl : `https://${startUrl}`;
  if (!isSafeUrl(start)) return [];
  let base: URL;
  try { base = new URL(start); } catch { return []; }

  const queue: string[] = [start.replace(/\/+$/, "")];
  const seen = new Set<string>();
  const pages: ScannedPage[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    const html = await fetchHtml(url);
    if (!html) continue;
    const { title, text, links } = htmlToText(html);
    if (text.length < 80) continue;

    pages.push({ url, title, text: text.slice(0, 12000), hash: sha256(text) });

    // Enqueue same-host links
    for (const href of links) {
      const norm = normalizeUrl(href, base);
      if (norm && !seen.has(norm) && queue.length + pages.length < maxPages * 3) {
        queue.push(norm);
      }
    }
  }

  return pages;
}

// ============ SENSITIVE DETECTION (regex first, deterministic) ============
type SensitiveHit = { reason: string };

const SENSITIVE_PATTERNS: { name: string; rx: RegExp }[] = [
  { name: "Email address", rx: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/ },
  { name: "Phone number", rx: /(?:\+?\d[\d\s().-]{8,}\d)/ },
  { name: "Credit card", rx: /\b(?:\d[ -]*?){13,16}\b/ },
  { name: "SSN-like ID", rx: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "API key / token", rx: /\b(sk|pk|api|token|key)[-_][A-Za-z0-9]{16,}\b/i },
  { name: "Password mention", rx: /\bpassword\s*[:=]\s*\S+/i },
  { name: "Salary / pay info", rx: /\b(salary|wage|compensation|paycheck)\b/i },
  { name: "Internal SOP / confidential", rx: /\b(internal|confidential|do not share|do not distribute|nda)\b/i },
  { name: "Bank account", rx: /\b(iban|swift|routing|account\s*number)\b/i },
];

export function detectSensitive(text: string): SensitiveHit | null {
  for (const p of SENSITIVE_PATTERNS) {
    if (p.rx.test(text)) return { reason: p.name };
  }
  return null;
}

// ============ Q&A EXTRACTION (LLM, two-pass: facts -> Q&As) ============
async function callLLM(systemPrompt: string, userPrompt: string, model = "gpt-4.1-mini"): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2000,
    temperature: 0.2,
  });
  return completion.choices[0]?.message?.content || "{}";
}

type ExtractedQa = {
  question: string;
  answer: string;
  topic: string;
};

export async function extractQasFromPage(page: ScannedPage): Promise<ExtractedQa[]> {
  const sys = `You are a knowledge-base curator. From the provided web page text, extract a list of self-contained question/answer pairs that a customer might realistically ask.

Rules:
- Each Q must be a natural customer question, not a section heading.
- Each A must be answerable from the text alone — never invent facts.
- Group by topic: pick from {About, Products, Pricing, Shipping, Returns, Support, Contact, Policies, Careers, FAQ, Other}.
- Output JSON: {"qas": [{"question": "...", "answer": "...", "topic": "..."}]}
- 0 to 8 Q&As per page. Skip if the page has no useful customer info.
- Keep answers under 80 words.`;

  const userMsg = `Page URL: ${page.url}
Page title: ${page.title}

Page text:
${page.text.slice(0, 6000)}`;

  try {
    const json = await callLLM(sys, userMsg);
    const parsed = JSON.parse(json);
    const qas: ExtractedQa[] = Array.isArray(parsed.qas) ? parsed.qas : [];
    return qas
      .filter((q) => q && typeof q.question === "string" && typeof q.answer === "string" && q.question.length > 5 && q.answer.length > 5)
      .map((q) => ({
        question: q.question.slice(0, 500),
        answer: q.answer.slice(0, 1500),
        topic: (typeof q.topic === "string" ? q.topic : "Other").slice(0, 80),
      }));
  } catch (e) {
    console.error("[autoscan] extract failed for", page.url, (e as Error).message);
    return [];
  }
}

// ============ DEDUPLICATION (cheap: normalized question similarity) ============
function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function jaccard(a: string, b: string): number {
  const sa = new Set(a.split(" ").filter((w) => w.length > 2));
  const sb = new Set(b.split(" ").filter((w) => w.length > 2));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  sa.forEach((w) => { if (sb.has(w)) inter++; });
  return inter / (sa.size + sb.size - inter);
}

export function dedupeQas<T extends { question: string }>(rows: T[], threshold = 0.75): T[] {
  const kept: { row: T; norm: string }[] = [];
  for (const row of rows) {
    const norm = normalizeQuestion(row.question);
    const dup = kept.some((k) => jaccard(k.norm, norm) >= threshold);
    if (!dup) kept.push({ row, norm });
  }
  return kept.map((k) => k.row);
}

// ============ FULL SCAN PIPELINE ============
export type ScanResult = {
  pagesScanned: number;
  qasExtracted: number;
  qasSensitive: number;
  qasDeduped: number;
  topics: string[];
  rows: InsertChatbotQa[];
  pageHashes: { url: string; hash: string }[];
};

export async function runAutoScan(widgetId: number, startUrl: string, maxPages = 12): Promise<ScanResult> {
  const pages = await crawlSite(startUrl, maxPages);

  // Extract Q&As in parallel (capped concurrency = 3)
  const allQas: (InsertChatbotQa & { __rawAnswer: string })[] = [];
  const concurrency = 3;
  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((p) => extractQasFromPage(p).then((qas) => ({ page: p, qas }))));
    for (const { page, qas } of results) {
      for (const q of qas) {
        const sensitive = detectSensitive(`${q.question}\n${q.answer}`);
        allQas.push({
          widgetId,
          question: q.question,
          answer: q.answer,
          topic: q.topic || "Other",
          sourceUrl: page.url,
          sourceHash: page.hash,
          sensitive: !!sensitive,
          sensitiveReason: sensitive?.reason || null,
          included: !sensitive, // default OFF for sensitive (inverts the risk)
          __rawAnswer: q.answer,
        } as any);
      }
    }
  }

  const beforeDedupe = allQas.length;
  const deduped = dedupeQas(allQas);
  const sensitiveCount = deduped.filter((q) => q.sensitive).length;
  const topics: string[] = Array.from(new Set(deduped.map((q) => q.topic).filter((t): t is string => !!t)));

  // Strip the temporary field
  const rows: InsertChatbotQa[] = deduped.map(({ __rawAnswer, ...rest }: any) => rest);

  return {
    pagesScanned: pages.length,
    qasExtracted: beforeDedupe,
    qasDeduped: beforeDedupe - deduped.length,
    qasSensitive: sensitiveCount,
    topics,
    rows,
    pageHashes: pages.map((p) => ({ url: p.url, hash: p.hash })),
  };
}
