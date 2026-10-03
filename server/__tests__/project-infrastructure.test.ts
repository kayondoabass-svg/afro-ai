import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ sql: vi.fn(), access: vi.fn(), files: vi.fn(), apply: vi.fn(), find: vi.fn(), create: vi.fn(), verify: vi.fn(), query: vi.fn(), remove: vi.fn(), end: vi.fn() }));
vi.mock("../db", () => ({ pool: { query: m.sql } }));
vi.mock("pg", () => ({ Client: class { query = m.sql; connect = async () => {}; end = m.end; } }));
vi.mock("../fullstack-access", () => ({ fullstackAccess: async () => ({ allowed: true }), requireFullstackAccess: m.access }));
vi.mock("../project-files", () => ({ listProjectFiles: m.files, applyProjectFileChanges: m.apply }));
vi.mock("../project-infrastructure/provider", () => ({
  infrastructureConfigured: () => true, findDatabase: m.find, createDatabase: m.create,
  verifyDatabase: m.verify, queryDatabase: m.query, deleteDatabase: m.remove,
  validateDatabaseIdentity: (value: unknown) => value,
}));
import { fullstackStarterFiles } from "../fullstack-starter";
import { provisionInfrastructure, deleteInfrastructure, infrastructureView, deleteFullstackProject } from "../project-infrastructure/service";
import { checkInitialMigration, configuredWrangler, HOSTING } from "../project-infrastructure/policy";
let record: any;
const name = "afro-project-12-123456789012345678901234";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  record = { project_id: 12, user_id: "owner", database_name: name, database_id: null, state: "failed", create_attempted: false };
  m.end.mockResolvedValue(undefined);
  m.files.mockResolvedValue(fullstackStarterFiles());
  m.find.mockResolvedValue(null);
  m.create.mockResolvedValue({ uuid: id, name });
  m.verify.mockResolvedValue({ uuid: id, name });
  m.query.mockImplementation(async (_id, sql) => sql.startsWith("SELECT message") ? [{ message: "ok" }] : []);
  m.sql.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes("FROM projects")) return { rows: params[1] === "owner" ? [{ id: 12, user_id: "owner", name: "My app", status: "draft" }] : [] };
    if (sql.includes("pg_try")) return { rows: [{ locked: true }] };
    if (sql.includes("count(*)")) return { rows: [{ total: 0 }] };
    if (sql.includes("SELECT * FROM project_infrastructure")) return { rows: record ? [record] : [] };
    if (sql.includes("SELECT id FROM conversations")) return { rows: [{ id: 42 }] };
    return { rows: [] };
  });
});
describe("infrastructure ownership and lifecycle", () => {
  for (const [label, fn] of [
    ["read", () => infrastructureView("attacker", 12)],
    ["provision", () => provisionInfrastructure("attacker", 12)],
    ["delete", () => deleteInfrastructure("attacker", 12, "My app")],
    ["project deletion", () => deleteFullstackProject("attacker", 12)],
  ] as const) it(`denies foreign project ${label} before provider access`, async () => {
    await expect(fn()).rejects.toMatchObject({ status: 404 });
    expect(m.find).not.toHaveBeenCalled(); expect(m.remove).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
  it("blocks unpaid provisioning before Cloudflare requests", async () => {
    m.access.mockRejectedValue(new Error("unpaid"));
    await expect(provisionInfrastructure("owner", 12)).rejects.toThrow("unpaid");
    expect(m.create).not.toHaveBeenCalled();
  });
  it("provisions, migrates and patches owned files without executing user code", async () => {
    await provisionInfrastructure("owner", 12);
    expect(m.create).toHaveBeenCalledWith(name);
    expect(m.apply).toHaveBeenCalledWith("owner", "42", expect.any(Array));
    expect(m.query.mock.calls.every(([databaseId]) => databaseId === id)).toBe(true);
    expect(HOSTING.available).toBe(false);
  });
  it("recovers the same database after a lost create response", async () => {
    record.create_attempted = true;
    m.find.mockResolvedValue({ uuid: id, name });
    await provisionInfrastructure("owner", 12);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("does not blindly repeat ambiguous paid creates", async () => {
    record.create_attempted = true;
    await expect(provisionInfrastructure("owner", 12)).rejects.toMatchObject({ status: 409 });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("rejects custom migration SQL before provisioning", async () => {
    const files = fullstackStarterFiles();
    files.find(f => f.path.endsWith("0001_initial.sql"))!.content = "DROP TABLE users";
    m.files.mockResolvedValue(files);
    await expect(provisionInfrastructure("owner", 12)).rejects.toMatchObject({ status: 409 });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("requires exact confirmation and does not delete unrelated resources", async () => {
    await expect(deleteInfrastructure("owner", 12, "wrong")).rejects.toMatchObject({ status: 400 });
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("allows owners to delete after paid access expires", async () => {
    record.database_id = id;
    m.access.mockRejectedValue(new Error("unpaid"));
    await deleteInfrastructure("owner", 12, "My app");
    expect(m.access).not.toHaveBeenCalled();
    expect(m.remove).toHaveBeenCalledWith(id, name);
  });
  it("protects a retained database from project deletion", async () => {
    await expect(deleteFullstackProject("owner", 12)).rejects.toMatchObject({ status: 409 });
    expect(m.sql.mock.calls.some(([sql]) => sql.startsWith("DELETE"))).toBe(false);
  });
});
describe("source configuration policy", () => {
  it("preserves unrelated edits and replaces only managed placeholders", () => {
    const files = fullstackStarterFiles();
    files.find(f => f.path === "wrangler.toml")!.content += "\n# Keep this user note\n";
    const changed = configuredWrangler(files, name, id);
    expect(changed.file.content).toContain(id);
    expect(changed.file.content).toContain("# Keep this user note");
    expect(changed.before.content).toContain("YOUR_DATABASE_ID");
  });
  it("does not overwrite a different database binding", () => {
    const files = fullstackStarterFiles();
    files.find(f => f.path === "wrangler.toml")!.content = files.find(f => f.path === "wrangler.toml")!.content.replace("YOUR_DATABASE_ID", "another-id");
    expect(() => configuredWrangler(files, name, id)).toThrow("conflicts");
  });
  it("accepts only the fixed migration", () => {
    expect(() => checkInitialMigration(fullstackStarterFiles())).not.toThrow();
    expect(() => checkInitialMigration([])).toThrow();
  });
});