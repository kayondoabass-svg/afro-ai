// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(), lock: vi.fn(), release: vi.fn(), get: vi.fn(), update: vi.fn(), remove: vi.fn(),
  dns: vi.fn(), purge: vi.fn(), projects: vi.fn(), publications: vi.fn(),
}));
vi.mock("./db", () => ({ pool: { query: mocks.query, connect: async () => ({ query: mocks.lock, release: mocks.release }) } }));
vi.mock("pg", () => ({ Pool: class { async connect() { return { query: mocks.lock, release: mocks.release }; } } }));
vi.mock("./storage", () => ({ storage: {
  getPublishedAppById: mocks.get, updatePublishedApp: mocks.update, deletePublishedApp: mocks.remove,
  getProjectsByUser: mocks.projects, getPublishedAppsByUser: mocks.publications,
} }));
vi.mock("./cloudflare", () => ({ removePublishedAppDns: mocks.dns, purgePublishedAppCache: mocks.purge }));
vi.mock("./project-lifecycle", () => ({ ProjectLifecycleError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { getAppLibrary, linkedPublicationIds, removePublishedApp } from "./app-management";
const app = { id: 9, userId: "owner", subdomain: "sample-shop", title: "Same name" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(app);
  mocks.update.mockResolvedValue(app);
  mocks.lock.mockResolvedValue({ rows: [] });
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.projects.mockResolvedValue([]);
  mocks.publications.mockResolvedValue([]);
});
describe("app-specific removal", () => {
  it("blocks origin serving before DNS/cache cleanup and strict hosted-content deletion", async () => {
    expect(await removePublishedApp("owner", 9)).toMatchObject({ id: 9, offline: true });
    expect(mocks.update).toHaveBeenCalledWith(9, expect.objectContaining({ appStatus: "suspended", suspendReason: "deletion-pending" }));
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.dns.mock.invocationCallOrder[0]);
    expect(mocks.dns).toHaveBeenCalledWith("sample-shop");
    expect(mocks.purge).toHaveBeenCalledWith("sample-shop");
    expect(mocks.remove).toHaveBeenCalledWith(9, true);
    expect(mocks.release).toHaveBeenCalled();
  });
  it("keeps publication metadata and reports a pending state if Cloudflare rejects cleanup", async () => {
    mocks.purge.mockRejectedValue(new Error("permission denied"));
    await expect(removePublishedApp("owner", 9)).rejects.toMatchObject({ status: 503 });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalledWith(9, expect.objectContaining({ appStatus: "active" }));
  });
  it("retains metadata when hosted-object cleanup cannot be confirmed", async () => {
    mocks.remove.mockRejectedValue(new Error("storage unavailable"));
    await expect(removePublishedApp("owner", 9)).rejects.toMatchObject({ status: 503 });
  });
  it("unpublishes without deleting source or publication history", async () => {
    expect(await removePublishedApp("owner", 9, true)).toMatchObject({ sourcePreserved: true });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenLastCalledWith(9, expect.objectContaining({ suspendReason: "customer-unpublished" }));
  });
  it("allows retries after partial unpublish failure", async () => {
    mocks.get.mockResolvedValue({ ...app, appStatus: "suspended", suspendReason: "unpublish-pending" });
    expect(await removePublishedApp("owner", 9, true)).toMatchObject({ offline: true });
  });
  it("rejects cross-customer removal before any external action", async () => {
    await expect(removePublishedApp("other", 9)).rejects.toMatchObject({ status: 404 });
    expect(mocks.dns).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
describe("single app library", () => {
  it("groups by explicit association, not duplicate business names, and includes drafts and unmapped sites", async () => {
    mocks.projects.mockResolvedValue([{ id: 1, name: "Same name" }, { id: 2, name: "Same name" }]);
    mocks.publications.mockResolvedValue([app, { ...app, id: 10 }]);
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 11, project_id: 1 }, { id: 12, project_id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ project_id: 1, content: '{"projectId":1,"publishedAppId":9}' }] });
    const { apps } = await getAppLibrary("owner");
    expect(apps).toHaveLength(3);
    expect(apps[0].publishedApps.map(site => site.id)).toEqual([9]);
    expect(apps[1].publishedApps).toEqual([]);
    expect(apps[2].project).toBeNull();
  });
  it("ignores malformed/foreign links rather than guessing resources for deletion", async () => {
    mocks.query.mockResolvedValue({ rows: [{ content: "bad" }, { content: '{"projectId":8,"publishedAppId":99}' }, { content: '{"projectId":1,"publishedAppId":9}' }] });
    expect(await linkedPublicationIds("owner", 1)).toEqual([9]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("c.user_id = $1"), ["owner", 1]);
  });
});
