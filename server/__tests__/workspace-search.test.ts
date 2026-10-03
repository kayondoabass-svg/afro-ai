import { it, expect, vi, beforeEach } from "vitest";
import { searchWorkspaceFiles } from "../workspace-search";
const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../project-files", () => ({ listProjectFiles: list }));
beforeEach(() => list.mockReset());
it("searches only the authorized conversation and returns file references", async () => {
  list.mockResolvedValue([{ path: "src/auth.ts", language: "typescript", content: "export function authMiddleware() {}\n// login" }]);
  const result = await searchWorkspaceFiles("owner", 42, "where is auth middleware");
  expect(list).toHaveBeenCalledWith("owner", 42);
  expect(result.results[0]).toMatchObject({ path: "src/auth.ts", startLine: 1, endLine: 2 });
});
it("rechecks ownership even with a warm cache", async () => {
  list.mockResolvedValueOnce([{ path: "auth.ts", content: "auth", language: "typescript" }]).mockRejectedValueOnce(new Error("not found"));
  await searchWorkspaceFiles("owner", 42, "auth");
  await expect(searchWorkspaceFiles("other", 42, "auth")).rejects.toThrow("not found");
});
it("refreshes saved edits and deletes instead of returning stale snippets", async () => {
  list.mockResolvedValueOnce([{ path: "auth.ts", content: "old auth", language: "typescript" }])
    .mockResolvedValueOnce([{ path: "auth.ts", content: "new auth", language: "typescript" }]).mockResolvedValueOnce([]);
  expect((await searchWorkspaceFiles("owner", 42, "auth")).results[0].content).toBe("old auth");
  expect((await searchWorkspaceFiles("owner", 42, "auth")).results[0].content).toBe("new auth");
  expect((await searchWorkspaceFiles("owner", 42, "auth")).results).toEqual([]);
});
it("excludes binary and secret files", async () => {
  list.mockResolvedValue([{ path: ".env", content: "secret", language: "text" }, { path: "asset.png", content: "secret", language: "binary", encoding: "base64" }]);
  expect((await searchWorkspaceFiles("owner", 42, "secret")).results).toEqual([]);
});