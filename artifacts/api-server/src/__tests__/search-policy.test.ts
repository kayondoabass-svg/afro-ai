import { beforeEach, expect, it, vi } from "vitest";
const { eligibility, search, configured } = vi.hoisted(() => ({
  eligibility: vi.fn(), search: vi.fn(), configured: vi.fn(),
}));
vi.mock("../fullstack-access", () => ({ fullstackAccess: eligibility }));
vi.mock("../web-search", () => ({ searchWeb: search, webSearchConfigured: configured }));
import { searchAccess, searchAccountWeb } from "../search-policy";
beforeEach(() => {
  vi.resetAllMocks();
  eligibility.mockResolvedValue({ allowed: false });
  configured.mockReturnValue(true);
  search.mockResolvedValue([]);
});
it("free users never call Tavily even when both keys are configured", async () => {
  await searchAccountWeb("free-user", "weather");
  expect(eligibility).toHaveBeenCalledWith("free-user");
  expect(search).toHaveBeenCalledExactlyOnceWith("weather", undefined, "jina");
});
it("paid users use both providers, interleaving and deduplicating sources", async () => {
  eligibility.mockResolvedValue({ allowed: true });
  search.mockImplementation(async (_q, _s, provider) => [{ url: `https://${provider}.com`, title: provider }, { url: "https://shared.org", title: "shared" }]);
  const sources = await searchAccountWeb("paid-user", "news");
  expect(search.mock.calls.map(c => c[2])).toEqual(["jina", "tavily"]);
  expect(sources.map(s => s.url)).toEqual(["https://jina.com", "https://tavily.com", "https://shared.org"]);
});
it("does not switch free users to Tavily when Jina is unconfigured", async () => {
  configured.mockImplementation(p => p === "tavily");
  await expect(searchAccountWeb("free-user", "news")).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
  expect(search).not.toHaveBeenCalled();
});
it("fails closed if billing cannot be verified", async () => {
  eligibility.mockRejectedValue(new Error("billing unavailable"));
  await expect(searchAccountWeb("user", "news")).rejects.toThrow();
  expect(search).not.toHaveBeenCalled();
});
it("does not grant search to a missing identity", async () => {
  await expect(searchAccess("")).rejects.toThrow("Authentication");
  expect(search).not.toHaveBeenCalled();
});
it("allows repeated and simultaneous searches without account slot limits", async () => {
  await Promise.all(Array.from({ length: 4 }, () => searchAccountWeb("same-user", "news")));
  expect(search).toHaveBeenCalledTimes(4);
  expect(search.mock.calls.every(c => c[2] === "jina")).toBe(true);
});
it("does not retry a failed paid search or pretend both providers succeeded", async () => {
  eligibility.mockResolvedValue({ allowed: true });
  search.mockImplementation(async (_q, _s, provider) => { if (provider === "tavily") throw new Error("down"); return []; });
  await expect(searchAccountWeb("paid-user", "news")).rejects.toThrow("down");
  expect(search).toHaveBeenCalledTimes(2);
});
it("does not spend a search request after disconnect", async () => {
  await expect(searchAccountWeb("user", "news", AbortSignal.abort())).rejects.toThrow();
  expect(search).not.toHaveBeenCalled();
});