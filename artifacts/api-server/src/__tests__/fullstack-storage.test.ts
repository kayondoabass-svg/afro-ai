import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({ query: vi.fn(), conversation: vi.fn() }));
vi.mock("../d1", () => ({ d1Query: mocks.query, isD1Configured: () => true }));
vi.mock("../replit_integrations/chat/storage", () => ({ chatStorage: { getConversation: mocks.conversation } }));
import { seedMissingProjectFiles } from "../project-files";
import { fullstackStarterFiles } from "../fullstack-starter";

let dir: string;
function sql(query: string) {
  const out = execFileSync("sqlite3", ["-bail", "-json", join(dir, "files.db")], { encoding: "utf8", input: query });
  return out.trim() ? JSON.parse(out) : [];
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fullstack-files-"));
  sql(readFileSync("cloudflare/migrations/002_project_files.sql", "utf8"));
  sql(readFileSync("cloudflare/migrations/003_project_file_binary.sql", "utf8"));
  mocks.conversation.mockResolvedValue({ userId: "owner" });
  mocks.query.mockImplementation(async (query: string, params: unknown[] = []) => {
    let index = 0;
    const escaped = query.replace(/\?/g, () => "'" + String(params[index++]).replace(/'/g, "''") + "'");
    return { results: sql(escaped), meta: {} };
  });
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); vi.clearAllMocks(); });

it("atomically stores a full starter and preserves edited paths on retries", async () => {
  const starter = fullstackStarterFiles();
  expect(await seedMissingProjectFiles("owner", 1, starter)).toHaveLength(starter.length);
  sql("UPDATE project_files SET content = 'User edits' WHERE path = 'README.md'");
  sql("DELETE FROM project_files WHERE path = 'server/db.ts'");
  const retried = await seedMissingProjectFiles("owner", 1, starter);
  expect(retried).toHaveLength(starter.length);
  expect(retried.find(f => f.path === "README.md")?.content).toBe("User edits");
  expect(retried.find(f => f.path === "server/db.ts")?.content).toContain("SELECT message");
  await seedMissingProjectFiles("owner", 1, starter);
  expect(sql("SELECT count(*) AS count FROM project_files")[0].count).toBe(starter.length);
});

it("isolates conversations and rejects other users before storage calls", async () => {
  await seedMissingProjectFiles("owner", 1, fullstackStarterFiles());
  await seedMissingProjectFiles("owner", 2, fullstackStarterFiles());
  expect(sql("SELECT count(DISTINCT conversation_id) AS count FROM project_files")[0].count).toBe(2);
  const before = mocks.query.mock.calls.length;
  await expect(seedMissingProjectFiles("other", 1, fullstackStarterFiles())).rejects.toMatchObject({ status: 404 });
  expect(mocks.query.mock.calls.length).toBe(before);
});

it("never replaces case-insensitive existing paths", async () => {
  await seedMissingProjectFiles("owner", 1, fullstackStarterFiles());
  sql("UPDATE project_files SET path = 'readme.md', name = 'readme.md', content = 'Keep me' WHERE path = 'README.md'");
  const files = await seedMissingProjectFiles("owner", 1, fullstackStarterFiles());
  expect(files.find(f => f.path === "readme.md")?.content).toBe("Keep me");
  expect(files.some(f => f.path === "README.md")).toBe(false);
});