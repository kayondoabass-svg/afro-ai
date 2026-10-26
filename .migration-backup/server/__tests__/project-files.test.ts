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
const png = (path = "assets/icon.png") => ({
  path, name: path.split("/").at(-1)!, language: "binary", encoding: "base64" as const,
  content: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YkWEL8AAAAASUVORK5CYII=",
});
const binary = (path: string, data: Buffer) => ({
  path, name: path.split("/").at(-1)!, language: "binary", encoding: "base64" as const, content: data.toString("base64"),
});

function iconFixture() {
  const image = Buffer.from(png().content, "base64");
  const data = Buffer.alloc(6 + 2 * 16 + 2 * image.length);
  data.writeUInt16LE(1, 2);
  data.writeUInt16LE(2, 4);
  for (let i = 0; i < 2; i++) {
    const entry = 6 + i * 16;
    data[entry] = 1;
    data[entry + 1] = 1;
    data.writeUInt32LE(image.length, entry + 8);
    data.writeUInt32LE(38 + i * image.length, entry + 12);
    image.copy(data, 38 + i * image.length);
  }
  return data;
}

function fontFixture(ext: "ttf" | "otf" | "woff" | "woff2") {
  const data = Buffer.alloc(ext === "woff" ? 68 : ext === "woff2" ? 49 : 32);
  data.write(ext === "woff" ? "wOFF" : ext === "woff2" ? "wOF2" : ext === "otf" ? "OTTO" : "", 0, "ascii");
  if (ext === "ttf") data.writeUInt32BE(0x00010000, 0);
  if (ext === "woff" || ext === "woff2") {
    data.writeUInt32BE(0x00010000, 4);
    data.writeUInt32BE(data.length, 8);
    data.writeUInt16BE(1, 12);
    data.writeUInt32BE(32, 16);
    if (ext === "woff") {
      data.write("head", 44, "ascii");
      data.writeUInt32BE(64, 48);
      data.writeUInt32BE(4, 52);
      data.writeUInt32BE(4, 56);
    } else data.writeUInt32BE(1, 20);
  } else {
    data.writeUInt16BE(1, 4);
    data.write("head", 12, "ascii");
    data.writeUInt32BE(28, 20);
    data.writeUInt32BE(4, 24);
  }
  return data;
}

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
  it("validates canonical bytes, magic, decoded limits and forbidden LFS tracking", () => {
    expect(validateProjectFiles([png(), file()])).toEqual([png(), file()]);
    for (const invalid of [
      { ...png(), content: png().content.replace(/=$/, "") },
      { ...png(), content: Buffer.from("MZ executable").toString("base64") },
      { ...png(), content: Buffer.from("version https://git-lfs.github.com/spec/v1\noid sha256:abc").toString("base64") },
      { ...png(), path: "image.exe", name: "image.exe" },
      { ...png(), language: "plaintext" },
      { ...png(), encoding: "utf8" },
      { ...png(), encoding: null },
    ]) expect(() => validateProjectFiles([invalid])).toThrow();
    expect(() => validateProjectFiles([file("image.png", png().content)])).toThrow();
    expect(() => validateProjectFiles([file("archive.zip", "PK\u0003\u0004fake")])).toThrow();
    expect(() => validateProjectFiles([file("app.exe", "MZfake")])).toThrow();
    expect(() => validateProjectFiles([file(".gitattributes", "*.png filter=lfs diff=lfs merge=lfs -text")])).toThrow("LFS");
    expect(() => validateProjectFiles([file("image.png", "version https://git-lfs.github.com/spec/v1")])).toThrow();
    const large = Buffer.concat([Buffer.from(png().content, "base64"), Buffer.alloc(1_000_000)]).toString("base64");
    expect(() => validateProjectFiles([{ ...png(), content: large }])).toThrow("binary");
  });
  it("accepts real ICO directory ordering, checks every image entry, and bounds font tables", () => {
    const icon = iconFixture();
    expect(validateProjectFiles([binary("images/favicon.ico", icon)])).toHaveLength(1);
    for (const [ext, offset] of [["ttf", 20], ["otf", 20], ["woff", 48], ["woff2", 20]] as const) {
      const data = fontFixture(ext);
      expect(validateProjectFiles([binary(`fonts/app.${ext}`, data)])).toHaveLength(1);
      const invalid = Buffer.from(data);
      invalid.writeUInt32BE(data.length + 1, offset);
      expect(() => validateProjectFiles([binary(`fonts/app.${ext}`, invalid)])).toThrow("binary format");
    }
    const shortWoff2 = fontFixture("woff2").subarray(0, 47);
    shortWoff2.writeUInt32BE(shortWoff2.length, 8);
    expect(() => validateProjectFiles([binary("fonts/app.woff2", shortWoff2)])).toThrow();
    for (const entry of [6, 22]) {
      const badOffset = Buffer.from(icon);
      badOffset.writeUInt32LE(icon.length, entry + 12);
      expect(() => validateProjectFiles([binary("images/favicon.ico", badOffset)])).toThrow();
      const badSize = Buffer.from(icon);
      badSize.writeUInt32LE(icon.length, entry + 8);
      expect(() => validateProjectFiles([binary("images/favicon.ico", badSize)])).toThrow();
    }
  });
});

describe("authorized D1 file contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conversation.mockResolvedValue({ id: 1, userId: "owner" });
    mocks.query.mockImplementation(async (sql: string) => ({
      results: sql.includes("sqlite_master") ? [{ name: "project_file_command_apply_binary" }] : [], meta: {},
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
  it("keeps migrated NULL-encoding text rows compatible", async () => {
    mocks.query.mockResolvedValue({ results: [{ ...file(), encoding: null }] });
    await expect(listProjectFiles("owner", 1)).resolves.toEqual([file()]);
  });
  it("sends each save as one parameterized atomic command", async () => {
    await expect(saveProjectFiles("owner", 1, [file()], "replace")).resolves.toEqual([file()]);
    const writes = mocks.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT"));
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toEqual(["owner", "1", "replace", JSON.stringify([file()])]);
    expect(mocks.query.mock.calls.some(([sql]) => /^(CREATE|ALTER|DROP)\b/i.test(sql))).toBe(false);
  });
  it("roundtrips binary owner-scoped records and refuses binary writes on 002-only", async () => {
    mocks.query.mockImplementation(async (sql: string) => ({
      results: sql.includes("sqlite_master") ? [{ name: "project_file_command_apply" }] : [], meta: {},
    }));
    await expect(saveProjectFiles("owner", 1, [file()], "replace")).resolves.toEqual([file()]);
    await expect(saveProjectFiles("owner", 1, [png()], "replace")).rejects.toThrow("migration 003 required");
    expect(mocks.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT"))).toHaveLength(1);
    mocks.query.mockImplementation(async (sql: string) => ({
      results: sql.includes("sqlite_master") ? [{ name: "project_file_command_apply_binary" }] :
        sql.startsWith("SELECT *") ? [{ ...png(), encoding: "base64", conversation_id: "1" }] : [], meta: {},
    }));
    await expect(listProjectFiles("owner", 1)).resolves.toEqual([png()]);
    await expect(listProjectFiles("other", 1)).rejects.toThrow("not found");
    await expect(saveProjectFiles("owner", 1, [png()], "replace")).resolves.toEqual([png()]);
    const params = mocks.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT")).at(-1)?.[1];
    expect(params.slice(0, 3)).toEqual(["owner", "1", "replace"]);
    expect(JSON.parse(params[3])).toEqual([png()]);
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
  it("surfaces a failed binary command without claiming a partial save", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("INSERT")) throw new Error("private D1 payload");
      return { results: sql.includes("sqlite_master") ? [{ name: "project_file_command_apply_binary" }] : [], meta: {} };
    });
    await expect(saveProjectFiles("owner", 1, [png()], "replace"))
      .rejects.toThrow("REDACTED: [project]: project file storage operation failed");
    expect(mocks.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT"))).toHaveLength(1);
  });
  it("checks conversation ownership even for file-id deletes", async () => {
    mocks.query.mockResolvedValue({ results: [{ ...file(), conversation_id: "1" }] });
    await expect(deleteProjectFile("other", "2")).rejects.toThrow("not found");
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("DELETE"))).toBe(false);
  });
});

describe("SQLite migration atomicity (local, no network)", () => {
  const migration = readFileSync("cloudflare/migrations/002_project_files.sql", "utf8");
  const binaryMigration = readFileSync("cloudflare/migrations/003_project_file_binary.sql", "utf8");
  const command = (files: Array<ReturnType<typeof file> | ReturnType<typeof png>>, mode = "merge") =>
    `\nINSERT INTO project_file_commands(user_id,conversation_id,mode,files) VALUES ('owner','1','${mode}','${JSON.stringify(files).replace(/'/g, "''")}');\n`;
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
  it("migrates old text rows, stores binary, and counts decoded bytes atomically", () => {
    const sql = migration + command([file()]) + binaryMigration +
      command([png()]) +
      "SELECT path,coalesce(encoding,'text') FROM project_files ORDER BY path; SELECT count(*) FROM project_file_commands;";
    const result = execFileSync("sqlite3", [":memory:"], { input: sql, encoding: "utf8" });
    expect(result.trim()).toBe("assets/icon.png|base64\nsrc/app.ts|text\n0");
    const large = { ...png(), content: Buffer.alloc(1_000_001).toString("base64") };
    const failed = migration + binaryMigration + command([file()]) + command([large], "replace") +
      "SELECT path FROM project_files; SELECT count(*) FROM project_file_commands;";
    try { execFileSync("sqlite3", [":memory:"], { input: failed, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); }
    catch (error: any) {
      expect(error.stderr).toContain("Project file limit exceeded");
      expect(error.stdout.trim()).toBe("src/app.ts\n0");
      return;
    }
    throw new Error("over-limit decoded binary accepted");
  });
});
