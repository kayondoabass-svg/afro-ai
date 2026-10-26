// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), direct: vi.fn(), release: vi.fn() }));
vi.mock("./db", () => ({ pool: { query: mocks.direct, connect: async () => ({ query: mocks.query, release: mocks.release }) } }));
import { ensureConversationProject, ensurePublishedProject, validatePublishConversation } from "./project-lifecycle";
const row = { id: 8, user_id: "owner", name: "My site", type: "website", status: "draft" };
function results(...rows: any[][]) { rows.forEach(items => mocks.query.mockResolvedValueOnce({ rows: items })); }
beforeEach(() => { vi.resetAllMocks(); mocks.query.mockResolvedValue({ rows: [] }); });

describe("automatic project lifecycle", () => {
  it("locks the owned conversation and creates exactly one project link", async () => {
    results([], [{ id: 3, user_id: "owner", title: "My site" }], [row], [], []);
    const linked = await ensureConversationProject("owner", 3);
    expect(linked.project.id).toBe(8);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE"), [3, "owner"]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE conversations"), [8, 3, "owner"]);
    expect(mocks.query).toHaveBeenLastCalledWith("COMMIT");
  });
  it("reuses an existing owned project instead of creating another on edits", async () => {
    results([], [{ id: 3, user_id: "owner", project_id: 8 }], [row], []);
    expect((await ensureConversationProject("owner", 3)).project.id).toBe(8);
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
  });
  it("rejects another customer's conversation and rolls back", async () => {
    results([], []);
    await expect(ensureConversationProject("other", 3)).rejects.toMatchObject({ status: 404 });
    expect(mocks.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.release).toHaveBeenCalled();
  });
  it("recovers a legacy published site with source, history and a durable project mapping", async () => {
    const html = "<!doctype html><html><body>Saved website</body></html>";
    results([], [{ id: 9, title: "Live site", html_content: html }], [], [], [{ id: 3 }], [], [],
      [{ id: 3, user_id: "owner", title: "Live site" }], [row], [], [], [], []);
    const result = await ensurePublishedProject("owner", 9);
    expect(result).toMatchObject({ conversationId: 3, project: { id: 8, status: "published" } });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO app_versions"), [3, html]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("'workbench-publication'"), [3, JSON.stringify({ publishedAppId: 9, projectId: 8 })]);
  });
  it("reuses a publication mapping and never duplicates the source on repeated recovery", async () => {
    results([], [{ id: 9 }], [{ id: 3, project_id: 8, content: '{"publishedAppId":9}' }],
      [{ id: 3, user_id: "owner", project_id: 8 }], [row], []);
    expect((await ensurePublishedProject("owner", 9)).conversationId).toBe(3);
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
  });
  it("rejects mixing a live site with a different project before changing any source", async () => {
    results([], [{ id: 9 }], [{ id: 3, project_id: 8, content: '{"publishedAppId":9}' }], [{ project_id: 12 }]);
    await expect(ensurePublishedProject("owner", 9, 7)).rejects.toMatchObject({ status: 409 });
    expect(mocks.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
  });
  it("validates the source owner before publication and rejects invalid IDs", async () => {
    mocks.direct.mockResolvedValue({ rows: [] });
    await expect(validatePublishConversation("owner", 99)).rejects.toMatchObject({ status: 404 });
    await expect(validatePublishConversation("owner", "NaN")).rejects.toMatchObject({ status: 400 });
    expect(await validatePublishConversation("owner", undefined)).toBeUndefined();
  });
});
