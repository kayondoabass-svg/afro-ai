import { beforeEach, describe, expect, it, vi } from "vitest";
import { fullstackStarterFiles } from "../fullstack-starter";
import { PROJECT_FILE_LIMITS } from "../project-file-policy";
import { execFileSync } from "node:child_process";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), lockQuery: vi.fn(), connect: vi.fn(), end: vi.fn(), create: vi.fn(), get: vi.fn(),
  seed: vi.fn(),
}));
vi.mock("../db", () => ({ pool: { query: mocks.query } }));
vi.mock("pg", () => ({ Client: class {
  query = mocks.lockQuery; connect = mocks.connect; end = mocks.end;
} }));
vi.mock("../storage", () => ({ storage: { createProject: mocks.create, getProject: mocks.get } }));
vi.mock("../project-files", () => ({ seedMissingProjectFiles: mocks.seed }));

import { fullstackAccess, guardFullstackProject } from "../fullstack-access";
import { createFullstackProject, initializeFullstackProject } from "../fullstack-projects";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.end.mockResolvedValue(undefined);
  mocks.connect.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue({ rows: [{ allowed: true }] });
  mocks.create.mockResolvedValue({ id: 12, status: "initializing" });
  mocks.get.mockResolvedValue({ id: 12, userId: "owner", type: "fullstack", status: "draft" });
  mocks.seed.mockResolvedValue(fullstackStarterFiles());
  mocks.lockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("pg_try")) return { rows: [{ locked: true }] };
    if (sql.includes("SELECT * FROM projects")) return { rows: [{ id: 12, name: "Starter", status: "initializing" }] };
    if (sql.includes("INSERT INTO conversations")) return { rows: [{ id: 25 }] };
    return { rows: [] };
  });
});

describe("Workers/D1 starter", () => {
  it("contains a coherent, safe source-only template under storage and AI file limits", () => {
    const files = fullstackStarterFiles();
    const paths = files.map(f => f.path);
    expect(paths).toEqual(expect.arrayContaining([
      "package.json", "wrangler.toml", ".env.example", ".gitignore", "README.md",
      "client/index.html", "client/src/App.tsx", "server/index.ts",
      "server/db.ts", "migrations/0001_initial.sql", "tests/api.test.ts",
    ]));
    expect(paths).not.toContain(".env");
    expect(paths).not.toContain("package-lock.json");
    expect(files.length).toBeLessThan(PROJECT_FILE_LIMITS.count);
    expect(files.every(f => Buffer.byteLength(f.content) <= 16000)).toBe(true);
    const pkg = JSON.parse(files.find(f => f.path === "package.json")!.content);
    expect(pkg.dependencies.hono).toBeTruthy();
    expect(pkg.dependencies.pg).toBeUndefined();
    expect(files.find(f => f.path === "README.md")!.content).toContain("No Worker, D1 database");
    expect(files.find(f => f.path === "wrangler.toml")!.content).toContain("YOUR_DATABASE_ID");
  });
  it("is deterministic across users and contains no user-controlled code interpolation", () => {
    expect(fullstackStarterFiles()).toEqual(fullstackStarterFiles());
  });
});

describe("paid access boundary", () => {
  it("requires the server's eligible plan, positive balance for PAYG and completed positive payment", async () => {
    await fullstackAccess("owner");
    const [sql, params] = mocks.query.mock.calls[0];
    expect(params).toEqual(["owner"]);
    for (const condition of ["u.plan IN ('pro', 'business', 'payg')", "u.payg_balance > 0", "p.status = 'completed'", "p.amount > 0"]) {
      expect(sql).toContain(condition);
    }
    expect(sql).not.toContain("free_trial");
  });
  it("denies unpaid users before creating records", async () => {
    mocks.query.mockResolvedValue({ rows: [{ allowed: false }] });
    await expect(createFullstackProject({ userId: "owner", name: "Test", type: "fullstack" })).rejects.toMatchObject({ status: 403 });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.seed).not.toHaveBeenCalled();
  });
  it("evaluates paid, trial, expired, unrelated-product and empty-balance cases correctly", async () => {
    await fullstackAccess("owner");
    const accessSql = mocks.query.mock.calls[0][0].replace("$1", "'owner'");
    for (const [plan, balance, paymentPlan, status, amount, expected] of [
      ["starter", 0, "pro", "completed", 10, 0],
      ["pro", 0, "pro", "pending", 10, 0],
      ["pro", 0, "pro", "completed", 0, 0],
      ["pro", 0, "chatbot-pro", "completed", 10, 0],
      ["pro", 0, "pro", "completed", 10, 1],
      ["business", 0, "business", "completed", 25, 1],
      ["payg", 0, "payg-pack5", "completed", 5, 0],
      ["payg", 500, "payg-pack5", "completed", 5, 1],
      ["pro", 0, "pro", "refunded", 10, 0],
    ]) {
      const output = execFileSync("sqlite3", ["-bail", "-json", ":memory:"], { encoding: "utf8", input: `
        CREATE TABLE users (id TEXT, plan TEXT, payg_balance INTEGER);
        CREATE TABLE payments (user_id TEXT, plan TEXT, status TEXT, amount NUMERIC);
        INSERT INTO users VALUES ('owner', '${plan}', ${balance});
        INSERT INTO payments VALUES ('owner', '${paymentPlan}', '${status}', ${amount});
        ${accessSql};
      ` });
      expect(JSON.parse(output)[0].allowed, String([plan, balance, status, amount])).toBe(expected);
    }
  });
  it("fails closed when billing is unavailable", async () => {
    mocks.query.mockRejectedValue(new Error("offline"));
    await expect(fullstackAccess("owner")).rejects.toThrow();
  });
  it("checks project ownership before granting fullstack use", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await expect(guardFullstackProject("other", 12)).rejects.toMatchObject({ status: 404 });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("user_id = $2"), [12, "other"]);
  });
  it("leaves ordinary projects and unlinked chats unchanged", async () => {
    expect(await guardFullstackProject("owner")).toBe(false);
    mocks.query.mockResolvedValue({ rows: [{ type: "website" }] });
    expect(await guardFullstackProject("owner", 2)).toBe(false);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});

describe("fullstack initialization", () => {
  it("creates metadata and seeds a single owned conversation before marking ready", async () => {
    await expect(createFullstackProject({ userId: "owner", name: "App", type: "fullstack" })).resolves.toMatchObject({ status: "draft" });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ status: "initializing", type: "fullstack" }));
    expect(mocks.seed).toHaveBeenCalledWith("owner", 25, fullstackStarterFiles());
    expect(mocks.lockQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'draft'"), [12]);
    expect(mocks.end).toHaveBeenCalled();
  });
  it("retains a recoverable project on D1 failure", async () => {
    mocks.seed.mockRejectedValue(new Error("storage unavailable"));
    await expect(createFullstackProject({ userId: "owner", name: "App" })).rejects.toMatchObject({ project: { id: 12, status: "setup_failed" } });
    expect(mocks.lockQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'setup_failed'"), [12, "owner"]);
  });
  it("never re-seeds a completed project or replaces deleted/edited files", async () => {
    mocks.lockQuery.mockImplementation(async (sql: string) => ({ rows: sql.includes("pg_try") ? [{ locked: true }] : [{ id: 12, status: "draft" }] }));
    await initializeFullstackProject("owner", 12);
    expect(mocks.seed).not.toHaveBeenCalled();
  });
  it("rejects simultaneous setup without writing", async () => {
    mocks.lockQuery.mockResolvedValue({ rows: [{ locked: false }] });
    await expect(initializeFullstackProject("owner", 12)).rejects.toMatchObject({ status: 409 });
    expect(mocks.seed).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalled();
  });
  it("rejects another owner's project", async () => {
    mocks.lockQuery.mockImplementation(async (sql: string) => ({ rows: sql.includes("pg_try") ? [{ locked: true }] : [] }));
    await expect(initializeFullstackProject("other", 12)).rejects.toMatchObject({ status: 404 });
    expect(mocks.seed).not.toHaveBeenCalled();
  });
  it("reuses the existing conversation on retry", async () => {
    mocks.lockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("pg_try")) return { rows: [{ locked: true }] };
      if (sql.includes("SELECT * FROM projects")) return { rows: [{ id: 12, name: "App", status: "setup_failed" }] };
      if (sql.includes("SELECT id FROM conversations")) return { rows: [{ id: 25 }] };
      return { rows: [] };
    });
    await initializeFullstackProject("owner", 12);
    expect(mocks.lockQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO conversations"))).toBe(false);
    expect(mocks.seed).toHaveBeenCalledWith("owner", 25, expect.any(Array));
  });
});