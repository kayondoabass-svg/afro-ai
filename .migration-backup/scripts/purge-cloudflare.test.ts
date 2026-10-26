import { describe, it, expect, vi } from "vitest";
import { purgeCloudflare } from "./purge-cloudflare.mjs";

const env = { CLOUDFLARE_ZONE_ID: "a".repeat(32), CLOUDFLARE_PURGE_TOKEN: "private-purge-token" };
describe("Cloudflare cache purge", () => {
  it("uses only the dedicated token and verified zone endpoint", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { id: "purge-id" } }) });
    expect(await purgeCloudflare(env, request, vi.fn())).toBe(true);
    expect(request).toHaveBeenCalledWith(`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`, expect.objectContaining({
      method: "POST", redirect: "error", body: '{"purge_everything":true}',
      headers: { Authorization: "Bearer private-purge-token", "Content-Type": "application/json" },
    }));
  });
  it("does not fall back to D1 credentials or skip missing configuration", async () => {
    const request = vi.fn();
    expect(await purgeCloudflare({ CLOUDFLARE_ZONE_ID: env.CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN: "d1-token" }, request, vi.fn())).toBe(false);
    expect(await purgeCloudflare({ ...env, CLOUDFLARE_ZONE_ID: "../wrong" }, request, vi.fn())).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    { ok: false, status: 401, json: async () => ({ success: false, errors: [{ code: 10000, message: env.CLOUDFLARE_PURGE_TOKEN }] }) },
    { ok: true, status: 200, json: async () => ({ success: false }) },
    { ok: true, status: 200, json: async () => ({ success: true }) },
    { ok: false, status: 500, json: async () => ({ success: true, result: { id: "bad" } }) },
    { ok: true, status: 200, json: async () => { throw new Error(env.CLOUDFLARE_PURGE_TOKEN); } },
  ])("fails closed and redacts provider output", async (response) => {
    const log = vi.fn();
    expect(await purgeCloudflare(env, vi.fn().mockResolvedValue(response), log)).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain(env.CLOUDFLARE_PURGE_TOKEN);
  });
  it("redacts network exceptions", async () => {
    const log = vi.fn();
    expect(await purgeCloudflare(env, vi.fn().mockRejectedValue(new Error(env.CLOUDFLARE_PURGE_TOKEN)), log)).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain(env.CLOUDFLARE_PURGE_TOKEN);
  });
});