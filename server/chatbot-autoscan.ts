import crypto from "crypto";
import type { InsertChatbotQa } from "@shared/schema";
import { scrapeUrl } from "./url-scrape";

const UA = "AfroAIBot";
const FULL_UA = "Mozilla/5.0 (compatible; AfroAIBot/1.0; +https://afroaigroup.com)";

// SSRF protection: reject loopback / private / link-local / metadata IPs
function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1]), parseInt(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
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

async function fetchText(url: string, signal?: AbortSignal): Promise<string | null> {
  if (!isSafeUrl(url)) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": FULL_UA, Accept: "text/html,application/xhtml+xml,application/xml,text/plain,*/*" },
      redirect: "follow",
      signal: signal ?? AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchHtml(url: string, signal?: AbortSignal): Promise<string | null> {
  if (!isSafeUrl(url)) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": FULL_UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: signal ?? AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ============ ROBOTS.TXT ============
type RobotsRules = { allow: string[]; disallow: string[]; sitemaps: string[] };

export async function fetchRobots(origin: string, signal?: AbortSignal): Promise<RobotsRules> {
  const empty: RobotsRules = { allow: [], disallow: [], sitemaps: [] };
  const txt = await fetchText(`${origin}/robots.txt`, signal);
  if (!txt) return empty;
  return parseRobots(txt);
}

export function parseRobots(txt: string): RobotsRules {
  const out: RobotsRules = { allow: [], disallow: [], sitemaps: [] };
  // Sitemaps are global, not per-UA
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (m) out.sitemaps.push(m[1].trim());
  }
  // Pick the most specific UA group: AfroAIBot first, then *.
  const groups: Record<string, { allow: string[]; disallow: string[] }> = {};
  let current: string | null = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const ua = line.match(/^user-agent\s*:\s*(.+)$/i);
    if (ua) {
      const name = ua[1].trim().toLowerCase();
      current = name;
      if (!groups[current]) groups[current] = { allow: [], disallow: [] };
      continue;
    }
    if (!current) continue;
    const dis = line.match(/^disallow\s*:\s*(.*)$/i);
    if (dis) { groups[current].disallow.push(dis[1].trim()); continue; }
    const alw = line.match(/^allow\s*:\s*(.*)$/i);
    if (alw) { groups[current].allow.push(alw[1].trim()); continue; }
  }
  const pick = groups[UA.toLowerCase()] || groups["afroaibot"] || groups["*"];
  if (pick) { out.allow = pick.allow; out.disallow = pick.disallow; }
  return out;
}

export function isAllowedByRobots(pathname: string, rules: RobotsRules): boolean {
  // Longest-match rule wins. Empty Disallow = allow all.
  let bestLen = -1;
  let allowed = true;
  for (const rule of rules.disallow) {
    if (!rule) continue;
    if (pathname.startsWith(rule) && rule.length > bestLen) {
      bestLen = rule.length;
      allowed = false;
    }
  }
  for (const rule of rules.allow) {
    if (!rule) continue;
    if (pathname.startsWith(rule) && rule.length >= bestLen) {
      bestLen = rule.length;
      allowed = true;
    }
  }
  return allowed;
}

// ============ SITEMAP.XML ============
export async function fetchSitemapUrls(sitemapUrl: string, signal?: AbortSignal, depth = 0): Promise<string[]> {
  if (depth > 2) return []; // sitemap-index can nest, cap recursion
  // SSRF guard: validate every sitemap URL (including nested <loc> targets) before fetch.
  if (!isSafeUrl(sitemapUrl)) return [];
  const xml = await fetchText(sitemapUrl, signal);
  if (!xml) return [];
  const urls: string[] = [];

  // <sitemapindex> → recurse (each child URL re-validated by isSafeUrl above).
  const indexMatches = Array.from(xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi));
  if (indexMatches.length > 0) {
    for (const m of indexMatches.slice(0, 20)) {
      const child = m[1].trim();
      if (!isSafeUrl(child)) continue;
      const sub = await fetchSitemapUrls(child, signal, depth + 1);
      urls.push(...sub);
    }
    return urls;
  }

  // <urlset><url><loc>. Page URLs are validated again by normalizeUrl/isSafeUrl
  // when they enter the crawl queue, so only collect well-formed safe URLs here.
  const urlMatches = Array.from(xml.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi));
  for (const m of urlMatches) {
    const u = m[1].trim();
    if (isSafeUrl(u)) urls.push(u);
  }
  return urls;
}

// Extract `[text](url)` markdown links from Jina's output so the crawler can
// keep discovering new pages even when sitemap.xml is missing/empty. Returns
// raw hrefs; same-host + SSRF filtering happens in normalizeUrl downstream.
function extractMarkdownLinks(md: string): string[] {
  const out: string[] = [];
  const rx = /\[[^\]]*\]\(([^)\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(md)) !== null) {
    const href = m[1].trim();
    if (href && !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
      out.push(href);
    }
  }
  return out;
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
    if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|ico|css|js|zip|mp4|mp3|woff2?|ttf)(\?|$)/i.test(u.pathname)) return null;
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export type CrawlOpts = {
  maxPages?: number;
  signal?: AbortSignal;
  onPage?: (info: { scanned: number; total: number; url: string }) => void;
};

export async function crawlSite(startUrl: string, opts: CrawlOpts = {}): Promise<ScannedPage[]> {
  const maxPages = opts.maxPages ?? 12;
  const signal = opts.signal;
  const start = startUrl.startsWith("http") ? startUrl : `https://${startUrl}`;
  if (!isSafeUrl(start)) return [];
  let base: URL;
  try { base = new URL(start); } catch { return []; }
  const origin = `${base.protocol}//${base.host}`;

  // 1. robots.txt
  const robots = await fetchRobots(origin, signal);

  // 2. Seed from sitemap (if any)
  const sitemapSources = robots.sitemaps.length > 0 ? robots.sitemaps : [`${origin}/sitemap.xml`];
  const seeded: string[] = [];
  for (const sm of sitemapSources.slice(0, 3)) {
    const urls = await fetchSitemapUrls(sm, signal);
    seeded.push(...urls);
  }

  const queue: string[] = [start.replace(/\/+$/, "")];
  for (const u of seeded) {
    const norm = normalizeUrl(u, base);
    if (norm && !queue.includes(norm)) queue.push(norm);
  }

  const seen = new Set<string>();
  const pages: ScannedPage[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    if (signal?.aborted) break;
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    let pathname = "/";
    try { pathname = new URL(url).pathname || "/"; } catch {}
    if (!isAllowedByRobots(pathname, robots)) continue;

    // Jina-first content fetch — clean markdown, handles JS-heavy SPAs,
    // and respects the same SSRF guards. Falls back to a direct fetch
    // internally if Jina is rate-limited / down. We still keep fetchHtml
    // as a final backup so a single bad Jina call doesn't kill the crawl.
    const scraped = await scrapeUrl(url, signal);
    let title = "";
    let text = "";
    let links: string[] = [];
    if (scraped.ok && scraped.text && scraped.text.length >= 80) {
      title = scraped.title || "";
      text = scraped.text;
      links = extractMarkdownLinks(text);
    } else {
      const html = await fetchHtml(url, signal);
      if (!html) continue;
      const parsed = htmlToText(html);
      title = parsed.title;
      text = parsed.text;
      links = parsed.links;
      if (text.length < 80) continue;
    }

    pages.push({ url, title, text: text.slice(0, 12000), hash: sha256(text) });
    opts.onPage?.({ scanned: pages.length, total: Math.min(maxPages, pages.length + queue.length), url });

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

// ============ Q&A EXTRACTION (LLM via shared provider — Gemini primary) ============
// Uses aiChatComplete which prefers Gemini (OpenAI-compatible endpoint) and
// falls back to OpenAI only if a key happens to be configured. Signal aborts
// between LLM calls — Gemini's HTTP client does not expose mid-request cancel,
// so an in-flight extraction will run to completion before the next abort
// check.
async function callLLM(systemPrompt: string, userPrompt: string, _model?: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) return "{}";
  const { aiChatComplete } = await import("./ai-chat-provider");
  const { text } = await aiChatComplete({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 2000,
    temperature: 0.2,
    responseFormat: { type: "json_object" },
  });
  return text || "{}";
}

type ExtractedQa = {
  question: string;
  answer: string;
  topic: string;
};

export async function extractQasFromPage(page: ScannedPage, signal?: AbortSignal): Promise<ExtractedQa[]> {
  const sys = `You are a knowledge-base curator. From the provided web page text, extract a list of self-contained question/answer pairs that a customer might realistically ask.

Rules:
- Each Q must be a natural customer question, not a section heading.
- Each A must be answerable from the text alone — never invent facts.
- Group by topic: pick from {About, Products, Pricing, Shipping, Returns, Support, Contact, Policies, Careers, FAQ, Other}.
- Output JSON: {"qas": [{"question": "...", "answer": "...", "topic": "..."}]}
- 0 to 8 Q&As per page. Skip if the page has no useful customer info.
- Keep answers under 80 words.
- Use the SAME LANGUAGE as the page text. If the page is in French, write the Q&As in French.`;

  const userMsg = `Page URL: ${page.url}
Page title: ${page.title}

Page text:
${page.text.slice(0, 6000)}`;

  try {
    const json = await callLLM(sys, userMsg, "gpt-4.1-mini", signal);
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

export type RunOpts = {
  maxPages?: number;
  signal?: AbortSignal;
  onProgress?: (info: { phase: "crawl" | "extract" | "done"; scanned: number; total: number; url?: string }) => void;
};

export async function runAutoScan(widgetId: number, startUrl: string, opts: RunOpts = {}): Promise<ScanResult> {
  const maxPages = opts.maxPages ?? 12;
  const signal = opts.signal;

  const pages = await crawlSite(startUrl, {
    maxPages,
    signal,
    onPage: ({ scanned, total, url }) => opts.onProgress?.({ phase: "crawl", scanned, total, url }),
  });

  if (signal?.aborted) {
    return { pagesScanned: pages.length, qasExtracted: 0, qasSensitive: 0, qasDeduped: 0, topics: [], rows: [], pageHashes: pages.map((p) => ({ url: p.url, hash: p.hash })) };
  }

  const allQas: (InsertChatbotQa & { __rawAnswer: string })[] = [];
  const concurrency = 3;
  let extracted = 0;
  for (let i = 0; i < pages.length; i += concurrency) {
    if (signal?.aborted) break;
    const batch = pages.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((p) => extractQasFromPage(p, signal).then((qas) => ({ page: p, qas }))));
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
          included: !sensitive,
          __rawAnswer: q.answer,
        } as any);
      }
      extracted += 1;
      opts.onProgress?.({ phase: "extract", scanned: extracted, total: pages.length, url: page.url });
    }
  }

  const beforeDedupe = allQas.length;
  const deduped = dedupeQas(allQas);
  const sensitiveCount = deduped.filter((q) => q.sensitive).length;
  const topics: string[] = Array.from(new Set(deduped.map((q) => q.topic).filter((t): t is string => !!t)));
  const rows: InsertChatbotQa[] = deduped.map(({ __rawAnswer, ...rest }: any) => rest);

  opts.onProgress?.({ phase: "done", scanned: pages.length, total: pages.length });

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
