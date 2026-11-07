// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
describe("separate DNS authorization", () => {
  it("uses the dedicated DNS token without changing the shared D1 token", async () => {
    vi.stubEnv("CLOUDFLARE_ZONE_ID", "zone");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "shared-storage-credential");
    vi.stubEnv("CLOUDFLARE_DNS_TOKEN", "dedicated-dns-credential");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, result: [] })));
    vi.stubGlobal("fetch", request);
    const { inspectDnsAccess } = await import("./cloudflare");
    expect((await inspectDnsAccess()).status).toBe("ok");
    expect(request.mock.calls[0][1].headers.Authorization).toBe("Bearer dedicated-dns-credential");
    expect(process.env.CLOUDFLARE_API_TOKEN).toBe("shared-storage-credential");
  });
  it("keeps authorization failures safe and never attempts a mutation", async () => {
    vi.stubEnv("CLOUDFLARE_ZONE_ID", "zone"); vi.stubEnv("CLOUDFLARE_API_TOKEN", "credential");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false, errors: [{ code: 10000, message: "sensitive provider payload" }],
    }), { status: 403 }));
    vi.stubGlobal("fetch", request);
    const { inspectDnsAccess } = await import("./cloudflare");
    const result = await inspectDnsAccess();
    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("not authorized");
    expect(result.message).not.toContain("sensitive provider payload");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].method).toBeUndefined();
  });
});
