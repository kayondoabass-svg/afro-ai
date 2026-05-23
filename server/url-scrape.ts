// Lightweight live-web fetcher for chat attachments / inline URLs.
//
// When a user pastes a link (or uploads a file whose text contains links),
// we visit each URL, strip boilerplate, and hand the cleaned text to the LLM
// as fresh context. Without this, Gemini/OpenAI only see the placeholder
// text the user typed and hallucinate details about the target site.
//
// SSRF-hardened: rejects loopback, RFC1918, link-local, multicast, IPv6
// internal ranges. Hard caps on URL count, per-URL bytes, per-URL timeout,
// and total wall-clock so a slow target can't stall the chat stream.

import { lookup as dnsLookup } from "dns/promises";
import net from "net";

const UA = "Mozilla/5.0 (compatible; AfroAIBot/1.0; +https://afroaigroup.com)";
const MAX_REDIRECTS = 3;

const MAX_URLS_PER_MESSAGE = 3;
const PER_URL_TIMEOUT_MS = 10_000;
const PER_URL_MAX_BYTES = 800_000; // 800KB raw HTML before cleaning
const PER_URL_MAX_OUT_CHARS = 8_000; // cleaned text per URL handed to AI
const TOTAL_BUDGET_MS = 18_000;

function isPrivateIpv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [parseInt(m[1]), parseInt(m[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const h = ip.toLowerCase();
  if (h === "::1") return true;
  if (h.startsWith("fe80:")) return true;     // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA
  if (h.startsWith("::ffff:")) {
    // IPv4-mapped — extract and check
    const v4 = h.slice(7);
    return isPrivateIpv4(v4);
  }
  if (h === "::") return true;
  return false;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (net.isIPv4(h) && isPrivateIpv4(h)) return true;
  if (net.isIPv6(h) && isPrivateIpv6(h)) return true;
  return false;
}

/**
 * Resolve the hostname and verify NO resolved IP (v4 or v6) is private. This
 * closes the DNS-rebinding hole where a hostname like `evil.com` initially
 * resolves to a public IP but later (or for `all` records) returns
 * 127.0.0.1 / 10.x.x.x / 169.254.169.254.
 */
async function isDnsSafe(hostname: string): Promise<boolean> {
  if (net.isIP(hostname)) return !isPrivateOrLocalHost(hostname);
  try {
    const addrs = await dnsLookup(hostname, { all: true });
    if (!addrs || addrs.length === 0) return false;
    for (const a of addrs) {
      if (a.family === 4 && isPrivateIpv4(a.address)) return false;
      if (a.family === 6 && isPrivateIpv6(a.address)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isSafeUrl(u: URL): boolean {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (isPrivateOrLocalHost(u.hostname)) return false;
  // Reject our own infrastructure so users can't recursively fetch the site
  // through itself (cheap amplification + risk of internal endpoints).
  const blocked = ["afroaigroup.com", "api.cloudflare.com", "169.254.169.254"];
  if (blocked.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`))) return false;
  return true;
}

const URL_REGEX = /(https?:\/\/[^\s<>"'`)]+|(?<![\w@])(?:www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"'`)]*)/gi;

export function extractUrls(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const found = new Set<string>();
  for (const match of text.matchAll(URL_REGEX)) {
    let raw = match[0];
    // Trim common trailing punctuation
    raw = raw.replace(/[.,;:!?)\]'"]+$/, "");
    if (!raw.startsWith("http")) raw = `https://${raw}`;
    try {
      const u = new URL(raw);
      if (isSafeUrl(u)) found.add(u.toString());
    } catch {
      /* ignore malformed */
    }
    if (found.size >= MAX_URLS_PER_MESSAGE) break;
  }
  return Array.from(found);
}

function stripHtml(html: string): { title: string; text: string } {
  // Pull title before stripping
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

  let s = html;
  // Remove script/style/noscript/template/svg/iframe blocks wholesale
  s = s.replace(/<(script|style|noscript|template|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // Remove nav/footer/header/aside content (often menus + cookie banners)
  s = s.replace(/<(nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // HTML comments
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  // All remaining tags
  s = s.replace(/<[^>]+>/g, " ");
  // Common HTML entities
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return { title, text: s };
}

export type ScrapedUrl = {
  url: string;
  ok: boolean;
  title?: string;
  text?: string;
  error?: string;
};

async function readBodyCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= PER_URL_MAX_BYTES) {
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

/**
 * Try Jina AI Reader first (returns clean markdown, handles JS-rendered pages),
 * then fall back to a direct fetch if Jina is rate-limited / down / blocks the
 * URL. Both attempts respect SSRF guards on the original URL and a shared
 * per-URL byte / time budget.
 */
export async function scrapeUrl(url: string, signal?: AbortSignal): Promise<ScrapedUrl> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { url, ok: false, error: "invalid URL" };
  }
  if (!isSafeUrl(u)) return { url, ok: false, error: "blocked (private/internal host)" };

  const target = u.toString();

  // === Attempt 1: Jina AI Reader proxy ===
  // r.jina.ai/<url> returns the page as clean text/markdown after running it
  // through a headless browser, so JS-heavy SPAs work too. Free tier is rate
  // limited; on failure we fall through to direct fetch.
  try {
    const jinaController = new AbortController();
    const jinaTimer = setTimeout(() => jinaController.abort(), PER_URL_TIMEOUT_MS);
    const jinaSignal = signal
      ? AbortSignal.any([signal, jinaController.signal])
      : jinaController.signal;
    try {
      const jinaHeaders: Record<string, string> = {
        "User-Agent": UA,
        Accept: "text/plain, text/markdown, */*;q=0.5",
        "X-Return-Format": "markdown",
      };
      // Authenticated Jina requests get ~10x the rate limit + priority.
      // Key is optional — without it we fall back to the public quota.
      if (process.env.JINA_API_KEY) {
        jinaHeaders["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
      }
      const jinaRes = await fetch(`https://r.jina.ai/${target}`, {
        headers: jinaHeaders,
        redirect: "follow",
        signal: jinaSignal,
      });
      if (jinaRes.ok) {
        const md = await readBodyCapped(jinaRes);
        // Jina sometimes returns a 200 with a rate-limit / error body — sniff
        // for that and fall through if we see it.
        const looksLikeRateLimit =
          md.length < 200 &&
          /rate\s*limit|rate-limited|429|too many requests|quota/i.test(md);
        if (md.trim().length >= 50 && !looksLikeRateLimit) {
          // First line of Jina output is usually "Title: ..." — extract it
          const titleMatch = md.match(/^\s*Title:\s*(.+)$/m);
          const title = titleMatch ? titleMatch[1].trim() : "";
          const text = md.replace(/\s+/g, " ").trim().slice(0, PER_URL_MAX_OUT_CHARS);
          return { url: target, ok: true, title, text };
        }
        console.warn(`[scrapeUrl] Jina returned thin/rate-limited body for ${target}, falling back`);
      } else {
        console.warn(`[scrapeUrl] Jina HTTP ${jinaRes.status} for ${target}, falling back`);
      }
    } finally {
      clearTimeout(jinaTimer);
    }
  } catch (jinaErr: any) {
    const msg = jinaErr?.name === "AbortError" ? "timeout" : jinaErr?.message || String(jinaErr);
    console.warn(`[scrapeUrl] Jina failed for ${target} (${msg}), falling back to direct fetch`);
  }

  // === Attempt 2: Direct fetch fallback ===
  // Manual redirect handling: re-run isSafeUrl + DNS check on every hop so
  // an allowed URL can't 302 us into an internal target, and so DNS rebinding
  // (public IP at scrape time, private IP at fetch time) is caught.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PER_URL_TIMEOUT_MS);
  const composite = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  try {
    let currentUrl = target;
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const hopUrl = new URL(currentUrl);
      if (!isSafeUrl(hopUrl)) {
        return { url: target, ok: false, error: `unsafe redirect target: ${hopUrl.hostname}` };
      }
      if (!(await isDnsSafe(hopUrl.hostname))) {
        return { url: target, ok: false, error: `DNS resolves to private IP: ${hopUrl.hostname}` };
      }
      res = await fetch(currentUrl, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "Accept-Language": "en;q=0.9",
        },
        redirect: "manual",
        signal: composite,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { url: target, ok: false, error: `HTTP ${res.status} with no Location` };
        try {
          currentUrl = new URL(loc, currentUrl).toString();
        } catch {
          return { url: target, ok: false, error: "invalid redirect Location" };
        }
        continue;
      }
      break;
    }
    if (!res) return { url: target, ok: false, error: "too many redirects" };
    if (!res.ok) return { url: target, ok: false, error: `HTTP ${res.status}` };

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const isHtml = ct.includes("html") || ct.includes("xml") || ct === "";
    const isText = ct.includes("text/") || isHtml;
    if (!isText) return { url: target, ok: false, error: `unsupported content-type: ${ct}` };

    const raw = await readBodyCapped(res);
    if (!raw) return { url: target, ok: false, error: "empty response body" };

    if (!isHtml) {
      const text = raw.replace(/\s+/g, " ").trim().slice(0, PER_URL_MAX_OUT_CHARS);
      return { url: target, ok: true, title: "", text };
    }

    const { title, text } = stripHtml(raw);
    return { url: target, ok: true, title, text: text.slice(0, PER_URL_MAX_OUT_CHARS) };
  } catch (err: any) {
    const name = err?.name || "Error";
    const msg = name === "AbortError" ? "timeout" : err?.message || String(err);
    return { url: target, ok: false, error: `proxy+direct both failed: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Scrape every safe URL in `text`, then format the results as a single
 * context block ready to splice into the user's chat message. Returns an
 * empty string when nothing was found / nothing could be fetched.
 */
export async function buildLiveWebContext(text: string): Promise<string> {
  const urls = extractUrls(text);
  if (urls.length === 0) return "";

  const totalAbort = new AbortController();
  const totalTimer = setTimeout(() => totalAbort.abort(), TOTAL_BUDGET_MS);

  let results: ScrapedUrl[] = [];
  try {
    results = await Promise.all(urls.map((u) => scrapeUrl(u, totalAbort.signal)));
  } finally {
    clearTimeout(totalTimer);
  }

  const successful = results.filter((r) => r.ok && r.text && r.text.length > 50);
  if (successful.length === 0) {
    // Still surface failures so the model knows we tried and can mention
    // it rather than fabricating content about the linked site.
    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) return "";
    return `\n\n=== LIVE WEB FETCH ===\nTried to fetch ${failed.length} link(s) from the user's message but none could be retrieved:\n${failed.map((f) => `- ${f.url} (${f.error || "failed"})`).join("\n")}\nDo NOT invent details about these pages — tell the user the fetch failed and ask what specifically they want from the site.\n`;
  }

  const blocks = successful.map((r) => {
    const header = r.title ? `URL: ${r.url}\nPage title: ${r.title}` : `URL: ${r.url}`;
    return `${header}\n---\n${r.text}`;
  });

  return `\n\n=== LIVE WEB CONTENT (fetched just now from links in the user's message) ===\nUse the text below as the authoritative current content of the linked page(s). Do NOT rely on prior training data for these URLs and do NOT make up details that aren't in this text. If the user asks about something not present below, say so.\n\n${blocks.join("\n\n=========\n\n")}\n=== END LIVE WEB CONTENT ===\n`;
}
