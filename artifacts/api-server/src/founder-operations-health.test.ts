// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ dns: vi.fn(), query: vi.fn(), configured: vi.fn() }));
vi.mock("./cloudflare", () => ({ inspectDnsAccess: mocks.dns }));
vi.mock("./d1", () => ({ d1Query: mocks.query, isD1Configured: mocks.configured }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.dns.mockResolvedValue({ status: "unavailable", message: "DNS access denied." });
  mocks.configured.mockReturnValue(true);
  mocks.query.mockResolvedValue({ results: [{ name: "project_files" }] });
});
afterEach(() => vi.restoreAllMocks());
describe("read-only founder operational checks", () => {
  it("shows blocked DNS separately from working source storage and unverified backups", async () => {
    const { founderOperationsHealth } = await import("./founder-operations-health");
    const health = await founderOperationsHealth();
    expect(health.checks.dns.status).toBe("unavailable");
    expect(health.checks.sourceStorage.status).toBe("ok");
    expect(health.checks.backups.status).toBe("unverified");
    expect(health.release).toBeNull();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("sqlite_master"), [], undefined, expect.any(AbortSignal));
    expect(JSON.stringify(health)).not.toMatch(/Bearer|html_content|DATABASE_URL/);
  });
  it("coalesces concurrent checks and caches results without fabricating new check times", async () => {
    const { founderOperationsHealth } = await import("./founder-operations-health");
    const [a, b] = await Promise.all([founderOperationsHealth(), founderOperationsHealth()]);
    expect(a).toEqual(b);
    expect(await founderOperationsHealth()).toEqual(a);
    expect(mocks.dns).toHaveBeenCalledTimes(1);
  });
  it("never calls unavailable storage or creates missing tables", async () => {
    mocks.configured.mockReturnValue(false);
    const { founderOperationsHealth } = await import("./founder-operations-health");
    expect((await founderOperationsHealth()).checks.sourceStorage.status).toBe("not_configured");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("reports schema/query failures safely rather than healthy empty results", async () => {
    mocks.query.mockRejectedValue(new Error("secret raw response"));
    const { founderOperationsHealth } = await import("./founder-operations-health");
    const result = await founderOperationsHealth();
    expect(result.checks.sourceStorage.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("secret raw response");
  });
});
