import { describe, expect, it, vi } from "vitest";
import { preflightProjectFilesD1 } from "../../scripts/project-files-d1-preflight";

const config = { databaseId: "files-id", expectedName: "production-db" };
const info = vi.fn(async () => ({ uuid: "files-id", name: "production-db" }));
const schema = [
  { type: "table", name: "project_files" },
  { type: "index", name: "project_files_owner_path", sql: "CREATE UNIQUE INDEX project_files_owner_path ON project_files(user_id, conversation_id, path COLLATE NOCASE)" },
  { type: "table", name: "project_file_commands" },
  { type: "trigger", name: "project_file_command_apply_binary" },
];

describe("read-only project-files migration preflight", () => {
  it("refuses missing/mismatched target before any query", async () => {
    const query = vi.fn();
    await expect(preflightProjectFilesD1({ ...config, expectedName: undefined }, info, query)).rejects.toThrow("Configure");
    await expect(preflightProjectFilesD1(config, async () => ({ uuid: "auth-id", name: "afro-ai-auth" }), query)).rejects.toThrow("identity");
    expect(query).not.toHaveBeenCalled();
  });
  it("reports missing migration without mutating legacy rows", async () => {
    const query = vi.fn().mockResolvedValue({ results: [] });
    await expect(preflightProjectFilesD1(config, info, query)).resolves.toBe("migration-required");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/^SELECT /);
  });
  it("blocks duplicates without deleting any rows", async () => {
    const query = vi.fn().mockResolvedValueOnce({ results: schema }).mockResolvedValueOnce({ results: [{ n: 2 }] });
    await expect(preflightProjectFilesD1(config, info, query)).rejects.toThrow("2 duplicate");
    expect(query.mock.calls.every(([sql]) => sql.startsWith("SELECT "))).toBe(true);
  });
  it("requires trigger, command table and unique index for readiness", async () => {
    const query = vi.fn().mockResolvedValueOnce({ results: schema.slice(0, 2) }).mockResolvedValueOnce({ results: [{ n: 0 }] });
    await expect(preflightProjectFilesD1(config, info, query)).resolves.toBe("migration-required");
    const legacyQuery = vi.fn().mockResolvedValueOnce({ results: [...schema.slice(0, 3), { type: "trigger", name: "project_file_command_apply" }] })
      .mockResolvedValueOnce({ results: [{ n: 0 }] });
    await expect(preflightProjectFilesD1(config, info, legacyQuery)).resolves.toBe("migration-required");
    const readyQuery = vi.fn().mockResolvedValueOnce({ results: schema }).mockResolvedValueOnce({ results: [{ n: 0 }] })
      .mockResolvedValueOnce({ results: [{ name: "content" }, { name: "encoding" }] });
    await expect(preflightProjectFilesD1(config, info, readyQuery)).resolves.toBe("ready");
    expect(readyQuery.mock.calls.every(([sql]) => sql.startsWith("SELECT "))).toBe(true);
  });
});