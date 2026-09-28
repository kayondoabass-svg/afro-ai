import { isIP } from "node:net";

export type WebSource = {
  title: string;
  url: string;
  snippet: string;
  retrievedAt: string;
};

const ENDPOINT = "https://s.jina.ai/";
const MAX_RESPONSE_BYTES = 128 * 1024;
const TIMEOUT_MS = 12_000;

function publicHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      isIP(hostname.replace(/^\[|\]$/g, "")) ||
      !hostname.includes(".") ||
      hostname.endsWith(".") ||
      /\.(?:local|localhost|internal|test|invalid|example)$/i.test(hostname)
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}

// Reader search API: https://jina.ai/reader (Search mode, JSON Response).
// Only the fixed Jina endpoint is fetched; result URLs are citations, never fetched.
export async function searchWeb(query: string, signal?: AbortSignal): Promise<WebSource[]> {
  if (typeof query !== "string" || !query.trim() || query.length > 500) {
    throw new Error("Search query must be 1–500 characters.");
  }
  const key = process.env.JINA_API_KEY;
  if (!key?.trim()) throw new Error("Web search is unavailable: JINA_API_KEY is not configured.");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const endpoint = new URL(ENDPOINT);
    endpoint.searchParams.set("q", query.trim());
    const response = await fetch(endpoint, {
      method: "GET",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "X-Token-Budget": "4096",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Web search provider returned HTTP ${response.status}.`);
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      throw new Error("Web search provider returned a non-JSON response.");
    }
    const declaredSize = Number(response.headers.get("content-length"));
    if (declaredSize > MAX_RESPONSE_BYTES) throw new Error("Web search provider response is too large.");
    if (!response.body) throw new Error("Web search provider returned an empty response.");

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new Error("Web search provider response is too large.");
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
      if (bytes > MAX_RESPONSE_BYTES) await response.body.cancel().catch(() => {});
    }

    let parsed: unknown;
    try {
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
      }
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
    } catch {
      throw new Error("Web search provider returned invalid JSON.");
    }
    // Jina JSON search responses contain a data array; accept a bare array as well.
    const entries = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && "data" in parsed
        ? (parsed as { data: unknown }).data
        : null;
    if (!Array.isArray(entries)) throw new Error("Web search provider returned an unexpected response.");

    const retrievedAt = new Date().toISOString();
    const sources: WebSource[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const url = publicHttpsUrl(item.url);
      if (!url || typeof item.title !== "string" || !item.title.trim()) continue;
      sources.push({
        title: item.title.trim().slice(0, 300),
        url,
        snippet: (typeof item.description === "string"
          ? item.description
          : typeof item.content === "string" ? item.content : "").trim().slice(0, 500),
        retrievedAt,
      });
      if (sources.length === 5) break;
    }
    return sources;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(signal?.aborted ? "Web search was cancelled." : "Web search timed out.");
    }
    // Never surface provider response bodies or credentials.
    if (error instanceof Error && error.message.startsWith("Web search provider")) throw error;
    throw new Error("Web search provider request failed.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}