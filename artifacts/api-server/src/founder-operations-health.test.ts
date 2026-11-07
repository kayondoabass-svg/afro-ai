// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ dns: vi.fn(), query: vi.fn(), configured: vi.fn(), read: vi.fn() }));
vi.mock("./cloudflare", () => ({ inspectDnsAccess: mocks.dns }));
vi.mock("./d1", () => ({ d1Query: mocks.query, isD1Configured: mocks.configured }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.read }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("AFRO_BACKUP_STATUS_FILE", "");
  mocks.read.mockRejectedValue(new Error("not available"));
  mocks.dns.mockResolvedValue({ status: "unavailable", message: "DNS access denied." });
  mocks.configured.mockReturnValue(true);
  mocks.query.mockResolvedValue({ results: [{ name: "project_files" }] });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
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
  const verified = () => ({ kind: "afro-ai-recovery", version: 1, status: "verified",
    retentionDays: 7, completedAt: new Date(Date.now() - 60_000).toISOString(),
    archiveReadBackVerified: true, assetsVerified: true, restoredPostgresTables: 91,
    restoredD1Databases: 3, scopes: ["postgres", "d1", "uploads"] });
  it("shows verified off-host restore evidence without exposing manifest keys or source", async () => {
    vi.stubEnv("AFRO_BACKUP_STATUS_FILE", "/private/status.json");
    mocks.read.mockResolvedValue(JSON.stringify({ ...verified(), privateField: "never expose" }));
    const { founderOperationsHealth } = await import("./founder-operations-health");
    const result = await founderOperationsHealth();
    expect(result.checks.backups.status).toBe("ok");
    expect(result.checks.backups.message).toContain("seven-day");
    expect(JSON.stringify(result)).not.toContain("never expose");
  });
  it.each([
    { archiveReadBackVerified: false }, { restoredD1Databases: 0 },
    { assetsVerified: false }, { scopes: ["postgres", "d1"] },
    { scopes: "postgres d1 uploads" }, { completedAt: "invalid" },
    { completedAt: new Date(Date.now() + 86400000).toISOString() },
    { retentionDays: 30 }, { restoredPostgresTables: "91" },
  ])("does not claim recovery is verified with incomplete evidence: %j", async patch => {
    vi.stubEnv("AFRO_BACKUP_STATUS_FILE", "/private/status.json");
    mocks.read.mockResolvedValue(JSON.stringify({ ...verified(), ...patch }));
    const { founderOperationsHealth } = await import("./founder-operations-health");
    expect((await founderOperationsHealth()).checks.backups.status).toBe("unverified");
  });
  it("reports failed or stale backups as requiring attention", async () => {
    vi.stubEnv("AFRO_BACKUP_STATUS_FILE", "/private/status.json");
    mocks.read.mockResolvedValue(JSON.stringify({ ...verified(), completedAt: "2020-01-01T00:00:00Z" }));
    let module = await import("./founder-operations-health");
    expect((await module.founderOperationsHealth()).checks.backups.status).toBe("unavailable");
    vi.resetModules();
    mocks.read.mockResolvedValue(JSON.stringify({ version: 1, status: "failed", error: "sensitive provider payload" }));
    module = await import("./founder-operations-health");
    const result = await module.founderOperationsHealth();
    expect(result.checks.backups.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("sensitive provider payload");
  });
});
