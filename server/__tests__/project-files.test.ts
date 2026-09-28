import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { validateProjectFiles, PROJECT_FILE_LIMITS } from "../project-file-policy";

const mocks = vi.hoisted(() => ({ query: vi.fn(), conversation: vi.fn() }));
vi.mock("../d1", () => ({ d1Query: mocks.query, isD1Configured: () => true }));
vi.mock("../replit_integrations/chat/storage", () => ({ chatStorage: { getConversation: mocks.conversation } }));
import { saveProjectFiles, listProjectFiles, deleteProjectFile } from "../project-files";

const file = (path = "src/app.ts", content = "export const app = 1;") => ({
  path, name: path.split("/").at(-1)!, language: "typescript", content,
});

describe("project file policy", () => {
  it("returns only canonical fields", () => {
    expect(validateProjectFiles([{ ...file(), id: 2 }])).toEqual([file()]);
  });
  it.each(["../foo", "/etc/passwd", "a//b", "a/./b", "a\\b", "a\u0000b", "C:/a",
    ".env", ".env.production", ".git/config", ".aws/credentials", "private.key", ".npmrc",
    "service-account.json", "id_rsa"])("rejects unsafe or credential path %s", path => {
    expect(() => validateProjectFiles([file(path)])).toThrow("REDACTED");
  });
  it("rejects duplicates and excessive counts and UTF-8 bytes", () => {
    expect(() => validateProjectFiles([file("A.ts"), file("a.ts")])).toThrow("duplicate");
    expect(() => validateProjectFiles(Array(201).fill(file()))).toThrow("count");
    expect(() => validateProjectFiles([file("a.ts", "é".repeat(500001))])).toThrow("byte");
    expect(() => validateProjectFiles(Array.from({ length: 6 }, (_, i) =>
      file(`${i}.ts`, "x".repeat(PROJECT_FILE_LIMITS.fileBytes))))).toThrow("byte");
  });
  it("rejects high-confidence secrets without disclosing values", () => {
    for (const secret of ["ghp_" + "a".repeat(36), "-----BEGIN RSA PRIVATE KEY-----",
      'api_key = "sensitive-value-123"', "postgres://user:private@db/test"]) {
      try { validateProjectFiles([file("app.ts", secret)]); throw new Error("accepted"); }
      catch (error: any) {
        expect(error.message).toContain("REDACTED");
        expect(error.message).not.toContain(secret);
      }
    }
  });
  it("accepts env templates only with verified placeholders", () => {
    expect(validateProjectFiles([file(".env.example", "KEY=YOUR_API_KEY\nEMPTY=\nSECRET=${SECRET}")])).toHaveLength(1);
    expect(() => validateProjectFiles([file(".env.example", "PASSWORD=unknownvalue")])).toThrow("placeholders");
    expect(() => validateProjectFiles([file(".env.example", "# ghp_" + "b".repeat(36))])).toThrow("credential");
  });
});

describe("authorized D1 file contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conversation.mockResolvedValue({ id: 1, userId: "owner" });
    mocks.query.mockImplementation(async (sql: string) => ({
      results: sql.includes("sqlite_master") ? [{ name: "project_file_command_apply" }] : [], meta: {},
    }));
  });
  it("rejects cross-user reads and writes before D1", async () => {
    await expect(listProjectFiles("other", 1)).rejects.toThrow("not found");
    await expect(saveProjectFiles("other", 1, [file()], "merge")).rejects.toThrow("not found");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("does not write rejected imports", async () => {
    await expect(saveProjectFiles("owner", 1, [file(".env", "KEY=value")], "replace")).rejects.toThrow("credential");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("validates legacy content before export", async () => {
    mocks.query.mockResolvedValue({ results: [file("app.ts", "ghp_" + "x".repeat(36))] });
    await expect(listProjectFiles("owner", 1)).rejects.toThrow("credential");
  });
  it("sends each save as one parameterized atomic command", async () => {
    await expect(saveProjectFiles("owner", 1, [file()], "replace")).resolves.toEqual([file()]);
    const writes = mocks.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT"));
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toEqual(["owner", "1", "replace", JSON.stringify([file()])]);
    expect(mocks.query.mock.calls.some(([sql]) => /^(CREATE|ALTER|DROP)\b/i.test(sql))).toBe(false);
  });
  it("gates command writes when migration is absent without creating schema", async () => {
    mocks.query.mockResolvedValue({ results: [], meta: {} });
    await expect(saveProjectFiles("owner", 1, [file()], "replace")).rejects.toThrow("migration 002 required");
    expect(mocks.query.mock.calls.every(([sql]) => sql.startsWith("SELECT "))).toBe(true);
  });
  it("fails explicitly and redacts database errors", async () => {
    mocks.query.mockRejectedValue(new Error("private database credential"));
    await expect(listProjectFiles("owner", 1)).rejects.toThrow("REDACTED: [project]: project file storage operation failed");
  });
  it("checks conversation ownership even for file-id deletes", async () => {
    mocks.query.mockResolvedValue({ results: [{ ...file(), conversation_id: "1" }] });
    await expect(deleteProjectFile("other", "2")).rejects.toThrow("not found");
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("DELETE"))).toBe(false);
  });
});

describe("SQLite migration atomicity (local, no network)", () => {
  const migration = readFileSync("cloudflare/migrations/002_project_files.sql", "utf8");
  const command = (files: ReturnType<typeof file>[], mode = "merge") =>
    `INSERT INTO project_file_commands(user_id,conversation_id,mode,files) VALUES ('owner','1','${mode}','${JSON.stringify(files).replace(/'/g, "''")}');`;
  it("merges, replaces, preserves IDs, consumes commands, and is rerunnable", () => {
    const sql = migration + migration + command([file()]) + command([file("other.ts")]) +
      command([file("src/app.ts", "updated")], "replace") +
      "SELECT id,path,content FROM project_files; SELECT count(*) FROM project_file_commands;";
    const result = execFileSync("sqlite3", [":memory:"], { input: sql, encoding: "utf8" });
    expect(result.trim()).toBe("1|src/app.ts|updated\n0");
  });
  it("rolls back the entire replacement when count exceeds the limit", () => {
    const sql = migration + command([file()]) +
      command(Array.from({ length: 201 }, (_, i) => file(`${i}.ts`)), "replace") +
      "SELECT path FROM project_files; SELECT count(*) FROM project_file_commands;";
    try { execFileSync("sqlite3", [":memory:"], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); }
    catch (error: any) {
      expect(error.stderr).toContain("Project file limit exceeded");
      expect(error.stdout.trim()).toBe("src/app.ts\n0");
      return;
    }
    throw new Error("over-limit command accepted");
  });
});