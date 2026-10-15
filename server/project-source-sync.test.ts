// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ conversation: vi.fn(), versions: vi.fn(), files: vi.fn(), save: vi.fn() }));
vi.mock("./replit_integrations/chat/storage", () => ({ chatStorage: { getConversation: mocks.conversation } }));
vi.mock("./storage", () => ({ storage: { getAppVersions: mocks.versions } }));
vi.mock("./project-files", async () => ({ ...await import("./project-file-policy"), listProjectFiles: mocks.files, saveProjectFiles: mocks.save }));
import { syncGeneratedSource } from "./project-source-sync";
const html = "<!doctype html><html><body>Saved source</body></html>";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.conversation.mockResolvedValue({ id: 3, userId: "owner" });
  mocks.versions.mockResolvedValue([{ htmlContent: html }]);
  mocks.files.mockResolvedValue([{ path: "style.css", content: "body{}" }]);
});
it("restores the saved index without replacing sibling source files or calling AI", async () => {
  expect(await syncGeneratedSource("owner", 3)).toMatchObject({ saved: true });
  expect(mocks.save).toHaveBeenCalledWith("owner", 3, [{ name: "index.html", path: "index.html", language: "html", content: html }], "merge");
});
it("rejects cross-customer source recovery", async () => {
  await expect(syncGeneratedSource("other", 3)).rejects.toMatchObject({ status: 404 });
  expect(mocks.files).not.toHaveBeenCalled();
});
it("preserves manual index changes rather than silently overwriting them", async () => {
  mocks.files.mockResolvedValue([{ path: "index.html", content: "<html>Manually edited</html>" }]);
  await expect(syncGeneratedSource("owner", 3)).rejects.toMatchObject({ status: 409 });
  expect(mocks.save).not.toHaveBeenCalled();
});
it("reports missing snapshots instead of inventing source", async () => {
  mocks.versions.mockResolvedValue([]);
  await expect(syncGeneratedSource("owner", 3)).rejects.toMatchObject({ status: 409 });
});
