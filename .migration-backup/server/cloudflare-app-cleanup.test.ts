// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-credential");
  vi.stubEnv("CLOUDFLARE_PURGE_TOKEN", "test-purge-credential");
  vi.stubEnv("CLOUDFLARE_ZONE_ID", "test-zone");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const response = (result: unknown, success = true, status = 200) => ({ ok: status < 400, json: async () => ({ success, result, errors: success ? [] : [{ message: "Denied" }] }) });
it("removes only serving DNS records for the selected app and verifies absence", async () => {
  const { removePublishedAppDns } = await import("./cloudflare");
  fetchMock.mockResolvedValueOnce(response([{ id: "site-record", type: "CNAME" }, { id: "mail-proof", type: "TXT" }]))
    .mockResolvedValueOnce(response({ id: "site-record" })).mockResolvedValueOnce(response([{ id: "mail-proof", type: "TXT" }]));
  await removePublishedAppDns("sample-shop");
  expect(fetchMock.mock.calls[0][0]).toContain("name=sample-shop.afroaigroup.com");
  const deletes = fetchMock.mock.calls.filter(([, opts]) => opts.method === "DELETE");
  expect(deletes).toHaveLength(1);
  expect(deletes[0][0]).toContain("/dns_records/site-record");
});
it("allows idempotent retries when the DNS record was already removed", async () => {
  const { removePublishedAppDns } = await import("./cloudflare");
  fetchMock.mockResolvedValue(response([]));
  await removePublishedAppDns("sample-shop");
  expect(fetchMock.mock.calls.every(([, opts]) => opts.method !== "DELETE")).toBe(true);
});
it("does not claim cleanup if authoritative DNS still has serving records", async () => {
  const { removePublishedAppDns } = await import("./cloudflare");
  fetchMock.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([{ id: "remaining", type: "A" }]));
  await expect(removePublishedAppDns("sample-shop")).rejects.toThrow("could not be verified");
});
it("purges only the selected hostname and preview URLs, never the entire zone", async () => {
  const { purgePublishedAppCache } = await import("./cloudflare");
  fetchMock.mockResolvedValue(response({ id: "receipt" }));
  await purgePublishedAppCache("sample-shop");
  expect(fetchMock.mock.calls.map(([, opts]) => JSON.parse(opts.body))).toEqual([
    { hosts: ["sample-shop.afroaigroup.com"] },
    { files: ["https://afroaigroup.com/site/sample-shop", "https://afroaigroup.com/site/sample-shop/"] },
  ]);
});
it("fails explicitly when cache-purge permission is missing", async () => {
  const { purgePublishedAppCache } = await import("./cloudflare");
  fetchMock.mockResolvedValue(response(null, false, 403));
  await expect(purgePublishedAppCache("sample-shop")).rejects.toThrow("not confirmed");
});
