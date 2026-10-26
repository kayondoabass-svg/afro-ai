import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { applyOperations, fingerprint, normalizeReport, structuralChecks } from "../project-workbench/model";
import { LOCAL_RUNNER } from "../project-workbench/runner-source";

const mocks = vi.hoisted(() => ({
  conversation: vi.fn(), siblings: vi.fn(), pg: vi.fn(), d1: vi.fn(), release: vi.fn(),
}));
vi.mock("../db", () => ({ pool: { query: mocks.pg, connect: async () => ({ query: mocks.pg, release: mocks.release }) } }));
vi.mock("../d1", () => ({ d1Query: mocks.d1, isD1Configured: () => true }));
vi.mock("../fullstack-access", () => ({ guardFullstackProject: vi.fn() }));
vi.mock("../replit_integrations/chat/storage", () => ({ chatStorage: { getConversation: mocks.conversation, getConversationsByProject: mocks.siblings } }));
import { assertProjectFileOwnership, replaceProjectFilesIfUnchanged } from "../project-files";
import { mutateWorkbench, workbenchState } from "../project-workbench/service";
const file = (content = "original", path = "index.html") => ({ path, name: path.split("/").at(-1)!, content, language: "html" });
let state: any, checkpointItems: any[], current: any[];
beforeEach(() => {
  vi.clearAllMocks(); state = undefined; checkpointItems = []; current = [file()];
  mocks.conversation.mockResolvedValue({ id: 1, userId: "owner", projectId: null });
  mocks.siblings.mockResolvedValue([]);
  mocks.pg.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes("pg_advisory")) return { rows: [] };
    if (sql.includes("INSERT INTO messages")) {
      if (sql.includes("'workbench-state'")) state = JSON.parse(params[1]);
      if (sql.includes("'workbench-checkpoint'")) checkpointItems.unshift(JSON.parse(params[1]));
      return { rows: [] };
    }
    if (sql.includes("role = 'workbench-state'") && sql.startsWith("SELECT")) return { rows: state ? [{ content: JSON.stringify(state) }] : [] };
    if (sql.includes("role = 'workbench-checkpoint'") && sql.startsWith("SELECT")) return { rows: checkpointItems.map(c => ({ content: JSON.stringify(c) })) };
    return { rows: [] };
  });
  mocks.d1.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes("sqlite_master")) return { results: [{ name: "project_file_command_apply_binary" }] };
    if (sql.includes("SELECT * FROM project_files")) return { results: current };
    if (sql.includes("INSERT INTO project_file_commands")) { current = JSON.parse(params[2]); return { results: [{ id: 1 }] }; }
    return { results: [] };
  });
});

describe("reviewed workspace operations", () => {
  it("patches large text once, preserves unrelated files and rejects ambiguous matches", () => {
    const input = [file("a".repeat(20000) + "\nunique"), file("other", "other.html")];
    const result = applyOperations(input, [{ kind: "patch", path: "index.html", find: "unique", replace: "fixed" }]);
    expect(result.files[0].content.endsWith("fixed")).toBe(true);
    expect(result.files[1]).toEqual(input[1]); expect(input[0].content.endsWith("unique")).toBe(true);
    expect(() => applyOperations([file("x x")], [{ kind: "patch", path: "index.html", find: "x", replace: "y" }])).toThrow("exactly once");
  });
  it("validates rename destinations and duplicate operations before mutation", () => {
    for (const to of ["../escape.html", ".env", "index.html"]) expect(() => applyOperations([file()], [{ kind: "rename", path: "index.html", to }])).toThrow();
    expect(() => applyOperations([file(), file("b", "other.html")], [{ kind: "rename", path: "index.html", to: "other.html" }])).toThrow();
    expect(applyOperations([file()], [{ kind: "delete", path: "index.html" }]).files).toEqual([]);
    expect(() => applyOperations([file()], [{ kind: "patch", path: "index.html", find: "original", replace: "new" }, { kind: "delete", path: "index.html" }])).toThrow();
  });
  it("shares only the oldest owned project conversation and rejects foreign owners", async () => {
    mocks.conversation.mockResolvedValue({ id: 9, userId: "owner", projectId: 5 });
    mocks.siblings.mockResolvedValue([{ id: 9, userId: "owner" }, { id: 2, userId: "owner" }, { id: 1, userId: "other" }]);
    expect(await assertProjectFileOwnership("owner", "9")).toBe("2");
    await expect(assertProjectFileOwnership("other", "9")).rejects.toThrow("not found");
  });
  it("uses atomic conditional replacement and fails a stale snapshot", async () => {
    mocks.d1.mockImplementation(async (sql: string) => ({ results: sql.includes("sqlite_master") ? [{ name: "project_file_command_apply_binary" }] : [] }));
    await expect(replaceProjectFilesIfUnchanged("owner", "1", [file()], [])).rejects.toThrow("changed");
    const insert = mocks.d1.mock.calls.find(([sql]) => sql.includes("INSERT INTO project_file_commands"));
    expect(insert?.[0]).toContain("count(*)"); expect(insert?.[0]).toContain("COLLATE BINARY"); expect(insert?.[0]).toContain("coalesce(encoding");
  });
  it("executes CAS with real SQLite triggers, preserving isolation and rejecting a changed row", async () => {
    const root = mkdtempSync(join(tmpdir(), "afro-cas-"));
    const database = join(root, "files.sqlite");
    const quote = (x: any) => typeof x === "number" ? String(x) : "'" + String(x).replace(/'/g, "''") + "'";
    try {
      execFileSync("sqlite3", [database], { input: readFileSync("cloudflare/migrations/002_project_files.sql", "utf8") + "\n" + readFileSync("cloudflare/migrations/003_project_file_binary.sql", "utf8") });
      execFileSync("sqlite3", [database], { input: `INSERT INTO project_file_commands(user_id,conversation_id,mode,files) VALUES ('owner','1','replace',${quote(JSON.stringify([file()]))});\nINSERT INTO project_file_commands(user_id,conversation_id,mode,files) VALUES ('other','1','replace',${quote(JSON.stringify([file("private")]))});` });
      mocks.d1.mockImplementation(async (sql: string, params: any[] = []) => {
        let i = 0;
        const bound = sql.replace(/\?/g, () => quote(params[i++]));
        const out = execFileSync("sqlite3", ["-json", database, bound], { encoding: "utf8" }).trim();
        return { results: out ? JSON.parse(out) : [] };
      });
      const renamed = file("original", "home.html");
      await replaceProjectFilesIfUnchanged("owner", "1", [file()], [renamed]);
      expect(execFileSync("sqlite3", [database, "SELECT path FROM project_files WHERE user_id='owner'"], {encoding:"utf8"}).trim()).toBe("home.html");
      await expect(replaceProjectFilesIfUnchanged("owner", "1", [file()], [])).rejects.toThrow("changed");
      expect(execFileSync("sqlite3", [database, "SELECT content FROM project_files WHERE user_id='other'"], {encoding:"utf8"}).trim()).toBe("private");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("requires explicit review and records recovery before applying", async () => {
    await mutateWorkbench("owner", "1", "operations", { operations: [{ kind: "rename", path: "index.html", to: "home.html" }] });
    expect(current[0].path).toBe("index.html");
    const id = state.pending.id;
    await mutateWorkbench("owner", "1", "review", { id, cancel: false });
    expect(current[0].path).toBe("home.html"); expect(checkpointItems[0].files[0].path).toBe("index.html");
    await expect(mutateWorkbench("owner", "1", "review", { id, cancel: false })).rejects.toThrow("missing");
    await mutateWorkbench("owner", "1", "restore", { id: checkpointItems[0].id });
    expect(current[0].path).toBe("home.html"); expect(state.pending.after[0].path).toBe("index.html");
  });
  it("rejects stale review and allows cancellation without file writes", async () => {
    await mutateWorkbench("owner", "1", "operations", { operations: [{ kind: "delete", path: "index.html" }] });
    const id = state.pending.id; current = [file("changed")];
    await expect(mutateWorkbench("owner", "1", "review", { id, cancel: false })).rejects.toThrow("changed");
    await mutateWorkbench("owner", "1", "review", { id, cancel: true });
    expect(current[0].content).toBe("changed"); expect(state.pending).toBeNull();
  });
  it("does not replay an ambiguous D1 attempt", async () => {
    await mutateWorkbench("owner", "1", "operations", { operations: [{ kind: "delete", path: "index.html" }] });
    const id = state.pending.id;
    mocks.d1.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT")) throw new Error("network failed");
      return { results: sql.includes("sqlite_master") ? [{ name: "project_file_command_apply_binary" }] : current };
    });
    await expect(mutateWorkbench("owner", "1", "review", { id, cancel: false })).rejects.toThrow();
    expect(state.pending.attempted).toBe(true);
    await expect(mutateWorkbench("owner", "1", "review", { id, cancel: false })).rejects.toThrow("attempted");
  });
});
describe("honest validation, plans and repairs", () => {
  it("does not turn missing entry pages or unchecked runtime into success", () => {
    const checks = structuralChecks([], "", ["Checkout works"]);
    expect(checks.some(c => c.status === "failed")).toBe(true);
    expect(checks.some(c => c.status === "blocked")).toBe(true);
    expect(normalizeReport({ fingerprint: "x", checks }, "x").status).toBe("failed");
    expect(() => normalizeReport({ fingerprint: "old", checks }, "new")).toThrow("match");
    expect(() => normalizeReport({ fingerprint: "x", checks: [] }, "x")).toThrow();
  });
  it("checks plan revisions, isolates inputs and caps repairs", async () => {
    await mutateWorkbench("owner", "1", "plan", { requirements: "Working shop", checks: ["Checkout works"], revision: 0 });
    await expect(mutateWorkbench("owner", "1", "plan", { requirements: "stale", checks: [], revision: 0 })).rejects.toThrow("changed");
    await mutateWorkbench("owner", "1", "input", { name: "spec.txt", text: "Show prices" });
    expect(current).toEqual([file()]);
    const report = await mutateWorkbench("owner", "1", "validate", {});
    for (let i = 0; i < 3; i++) expect((await mutateWorkbench("owner", "1", "repair", { reportId: report.id })).request).toContain(`${i+1}/3`);
    await expect(mutateWorkbench("owner", "1", "repair", { reportId: report.id })).rejects.toThrow("three");
    expect((await workbenchState("owner", "1")).execution).toBe("customer-local");
  });
  it("marks imported results as customer-reported and refuses private credentials", async () => {
    const report = await mutateWorkbench("owner", "1", "report", { report: { fingerprint: fingerprint(current), checks: [{ name: "Build", status: "passed", detail: "OK" }] } });
    expect(report.source).toBe("customer-reported");
    await expect(mutateWorkbench("owner", "1", "input", { name: "secret", text: "ghp_" + "a".repeat(36) })).rejects.toThrow("credentials");
  });
});
describe("downloaded runner", () => {
  it("is valid Node code and refuses to execute project scripts without consent", () => {
    const root = mkdtempSync(join(tmpdir(), "afro-runner-"));
    try {
      const files = [file('{"scripts":{"build":"node -e \\"require(\\u0027fs\\u0027).writeFileSync(\\u0027EXECUTED\\u0027,\\u0027x\\u0027)\\""}}', "package.json")];
      mkdirSync(join(root, ".afro-checks"));
      for (const f of files) writeFileSync(join(root, f.path), f.content);
      writeFileSync(join(root, ".afro-checks/run.mjs"), LOCAL_RUNNER);
      writeFileSync(join(root, ".afro-checks/config.json"), JSON.stringify({
        manifest: files.map(f => ({path:f.path,language:f.language})), fingerprint: fingerprint(files), acceptanceChecks: [],
      }));
      const result = spawnSync(process.execPath, [join(root, ".afro-checks/run.mjs")], { timeout: 10000 });
      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(join(root, ".afro-checks/results/report.json"), "utf8"));
      expect(report.checks.find((c: any) => c.name === "build").status).toBe("blocked");
      expect(report.checks.find((c: any) => c.name === "Browser preview").status).toBe("blocked");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
