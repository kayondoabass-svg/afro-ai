import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchWeb } from "../web-search";

const originalKey = process.env.JINA_API_KEY;

beforeEach(() => {
  process.env.JINA_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.JINA_API_KEY;
  else process.env.JINA_API_KEY = originalKey;
});

describe("searchWeb", () => {
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
    expect(url.origin).toBe("https://s.jina.ai");
    expect(url.searchParams.get("q")).toBe("test & query");
    expect(options.redirect).toBe("error");
    expect(options.headers.Authorization).toBe("Bearer test-key");
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
    await expect(searchWeb("hello")).rejects.toThrow("JINA_API_KEY");
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
});