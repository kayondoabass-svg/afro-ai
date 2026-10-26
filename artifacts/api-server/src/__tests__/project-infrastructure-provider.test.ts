import { afterEach, expect, it, vi } from "vitest";
import { validateDatabaseIdentity, queryDatabase, findDatabase, createDatabase } from "../project-infrastructure/provider";
const name = "afro-project-1-123456789012345678901234";
const id = "11111111-1111-4111-8111-111111111111";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("rejects a valid ID belonging to a differently named database", () => {
  expect(() => validateDatabaseIdentity({ uuid: id, name: "afro-auth" }, name)).toThrow();
});
it("never accepts the platform's source-file database", () => {
  vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", id);
  expect(() => validateDatabaseIdentity({ uuid: id, name }, name)).toThrow();
});
it("pins an already known resource ID", () => {
  expect(() => validateDatabaseIdentity({ uuid: id, name }, name, "22222222-2222-4222-8222-222222222222")).toThrow();
});
it("rejects malformed IDs and names before network access", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(queryDatabase("../other", "SELECT 1")).rejects.toThrow();
  await expect(findDatabase("afro-auth")).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not expose provider errors or automatically repeat failed create calls", async () => {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
  vi.stubEnv("CLOUDFLARE_PROJECTS_API_TOKEN", "test-placeholder");
  const fetcher = vi.fn().mockResolvedValue({ status: 403, ok: false, json: async () => ({ success: false, errors: [{ message: "private provider details" }] }) });
  vi.stubGlobal("fetch", fetcher);
  await expect(createDatabase(name)).rejects.toThrow("administrator");
  expect(fetcher).toHaveBeenCalledTimes(1);
});