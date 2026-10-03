import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchWeb } from "../web-search";

const originalKey = process.env.JINA_API_KEY;

beforeEach(() => {
  vi.stubEnv("TAVILY_API_KEY", "");
  process.env.JINA_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.JINA_API_KEY;
  else process.env.JINA_API_KEY = originalKey;
});

describe("searchWeb", () => {
  it("uses Tavily when configured and normalizes results", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ title: "News", url: "https://example.org/news", content: "Current report" }],
    }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchWeb("latest news", undefined, "tavily")).toMatchObject([{ title: "News", snippet: "Current report" }]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.tavily.com/search");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ query: "latest news", max_results: 5 });
  });
  it("calls only Jina's search endpoint and limits results to safe HTTPS citations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { title: "First", url: "https://example.org/article", description: "A summary" },
        { title: "Unsafe", url: "http://example.org/", content: "No" },
        { title: "Private", url: "https://127.0.0.1/", content: "No" },
        { title: "Embedded credentials", url: "https://a:b@example.org/", content: "No" },
        ...Array.from({ length: 8 }, (_, i) => ({ title: `Result ${i}`, url: `https://example.org/${i}`, content: "Result text" })),
      ],
    }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const sources = await searchWeb("test & query");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://s.jina.ai/");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ q: "test & query" });
    expect(options.redirect).toBe("error");
    expect(options.headers.Authorization).toBe("Bearer test-key");
    expect(options.headers.Accept).toBe("application/json");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["X-Engine"]).toBe("direct");
    expect(options.headers["X-Respond-With"]).toBe("no-content");
    expect(sources).toHaveLength(5);
    expect(sources[0]).toMatchObject({ title: "First", url: "https://example.org/article", snippet: "A summary" });
    expect(Number.isNaN(Date.parse(sources[0].retrievedAt))).toBe(false);
  });

  it("rejects missing configuration and invalid queries without contacting the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchWeb(" ")).rejects.toThrow("Search query");
    await expect(searchWeb("x".repeat(501))).rejects.toThrow("Search query");
    delete process.env.JINA_API_KEY;
    await expect(searchWeb("hello")).rejects.toThrow("no search provider");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports provider errors, malformed responses, oversized bodies and cancellation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    await expect(searchWeb("hello")).rejects.toThrow("HTTP 403");
    fetchMock.mockResolvedValueOnce(new Response("oops", { headers: { "Content-Type": "application/json" } }));
    await expect(searchWeb("hello")).rejects.toThrow("invalid JSON");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), {
      headers: { "Content-Type": "application/json", "Content-Length": "200000" },
    }));
    await expect(searchWeb("hello")).rejects.toThrow("too large");
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await expect(searchWeb("hello", controller.signal)).rejects.toThrow("cancelled");
  });

  it("allows a slow live-style response beyond twelve seconds but bounds the provider wait", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_url, options) => new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response(JSON.stringify({
          data: [{ title: "Result", url: "https://example.org/result", description: "Summary" }],
        }), { headers: { "Content-Type": "application/json" } })), 15_000);
        options.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
      }));
      vi.stubGlobal("fetch", fetchMock);
      const successful = searchWeb("Pesapal Zambia payment methods");
      await vi.advanceTimersByTimeAsync(15_000);
      expect(await successful).toHaveLength(1);

      fetchMock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }));
      const timedOut = searchWeb("Pesapal Zambia payment methods");
      const rejection = expect(timedOut).rejects.toThrow("Web search timed out.");
      await vi.advanceTimersByTimeAsync(35_001);
      await rejection;
    } finally { vi.useRealTimers(); }
  });
});