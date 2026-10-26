// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(), files: vi.fn(), findMedia: vi.fn(), readMedia: vi.fn(),
  query: vi.fn(), connect: vi.fn(), connQuery: vi.fn(), append: vi.fn(),
}));
vi.mock("../db", () => ({ pool: { query: mocks.query, connect: mocks.connect } }));
vi.mock("../project-files", () => ({ assertProjectFileOwnership: mocks.owner, listProjectFiles: mocks.files }));
vi.mock("../media-jobs", () => ({ findMedia: mocks.findMedia }));
vi.mock("../media-assets", () => ({
  readMedia: mocks.readMedia,
  mediaExtension: (kind: string, mime: string) => {
    if (kind !== "image" || !["image/png", "image/jpeg", "image/webp"].includes(mime)) throw new Error("bad media type");
    return "png";
  },
}));
vi.mock("./activity-history", () => ({ appendActivities: mocks.append }));
import { registerProposalRoutes } from "./proposals";
import { ProjectFileError } from "../project-file-policy";

const id = "5ed6b8b2-36fb-4955-99c1-61e363cab274";
const mediaId = "fc876058-d69e-4640-b358-4ba79409b086";
let server: Server, base: string, existing: { id: string; title: string; mediaJobId: string; createdAt: string; sourceFingerprint?: string } | null;
const headers = { "x-user": "owner", "Content-Type": "application/json" };
beforeEach(async () => {
  vi.clearAllMocks();
  existing = null;
  mocks.owner.mockImplementation(async (user, workspace) => {
    if (user !== "owner" || workspace !== "11") throw new ProjectFileError(404, "Project not found.");
    return "11";
  });
  mocks.findMedia.mockResolvedValue({ id: mediaId, kind: "image", status: "succeeded", mime_type: "image/png", asset_key: "private" });
  mocks.files.mockResolvedValue([]);
  mocks.readMedia.mockResolvedValue(Buffer.from("image bytes"));
  mocks.query.mockImplementation(async (_sql, params) => ({
    rows: existing && params?.[2] === id ? [{ content: JSON.stringify(existing) }] : [],
  }));
  mocks.connQuery.mockImplementation(async (sql, params) => {
    if (sql.includes("SELECT content FROM messages")) return { rows: existing ? [{ content: JSON.stringify(existing) }] : [] };
    if (sql.startsWith("INSERT INTO messages (conversation_id,role,content)")) existing = JSON.parse(params[2]);
    return { rows: [] };
  });
  mocks.connect.mockResolvedValue({ query: mocks.connQuery, release: vi.fn() });
  mocks.append.mockResolvedValue(undefined);
  const app = express(); app.use(express.json());
  registerProposalRoutes(app, (req: any, res, next) => {
    if (!req.get("x-user")) return void res.status(401).end();
    req.user = { claims: { sub: req.get("x-user") } }; next();
  });
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}/api/conversations/11/workbench/proposals`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

const create = (body: unknown, customHeaders = headers) => fetch(base, {
  method: "POST", headers: customHeaders, body: JSON.stringify(body),
});
describe("owned proposal artifacts", () => {
  it("requires authentication and rejects a different account or origin", async () => {
    expect((await create({ requestId: id, mediaJobId: mediaId, title: "Design" }, { "Content-Type": "application/json" })).status).toBe(401);
    expect((await create({ requestId: id, mediaJobId: mediaId, title: "Design" },
      { "Content-Type": "application/json", "x-user": "other" })).status).toBe(404);
    expect((await create({ requestId: id, mediaJobId: mediaId, title: "Design" },
      { ...headers, Origin: "https://other.example" })).status).toBe(403);
  });
  it("saves a real completed image once and appends an artifact event in its transaction", async () => {
    const response = await create({ requestId: id, mediaJobId: mediaId, title: "Homepage design" });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id, title: "Homepage design", mediaJobId: mediaId, sourceFingerprint: expect.any(String) });
    expect(mocks.append).toHaveBeenCalledWith(expect.anything(), "11", [expect.objectContaining({
      artifactId: id, tool: "design_proposal", status: "proposed",
    })]);
    expect(mocks.connQuery.mock.calls.map(([sql]) => sql)).toContain("COMMIT");
    const again = await create({ requestId: id, mediaJobId: mediaId, title: "Homepage design" });
    expect(again.status).toBe(200);
    expect(mocks.append).toHaveBeenCalledTimes(1);
    expect((await create({ requestId: id, mediaJobId: mediaId, title: "Changed title" })).status).toBe(409);
  });
  it("rejects unfinished or missing assets without saving a placeholder card", async () => {
    mocks.findMedia.mockResolvedValueOnce({ id: mediaId, kind: "image", status: "running" });
    expect((await create({ requestId: id, mediaJobId: mediaId, title: "Proposal" })).status).toBe(409);
    mocks.readMedia.mockRejectedValueOnce(new Error("object unavailable"));
    expect((await create({ requestId: id, mediaJobId: mediaId, title: "Proposal" })).status).toBe(503);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("rolls back metadata if recording the corresponding activity fails", async () => {
    mocks.append.mockRejectedValueOnce(new Error("database error"));
    expect((await create({ requestId: id, mediaJobId: mediaId, title: "Proposal" })).status).toBe(503);
    expect(mocks.connQuery.mock.calls.map(([sql]) => sql)).toContain("ROLLBACK");
  });
  it("serves only an existing owned image privately and rechecks ownership", async () => {
    expect((await fetch(`${base}/${id}/image`, { headers })).status).toBe(404);
    existing = { id, mediaJobId: mediaId, title: "Proposal", createdAt: new Date().toISOString() };
    const response = await fetch(`${base}/${id}/image`, { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(await response.text()).toBe("image bytes");
    mocks.owner.mockResolvedValueOnce("11").mockRejectedValueOnce(new ProjectFileError(404, "Project not found."));
    expect((await fetch(`${base}/${id}/image`, { headers })).status).toBe(404);
  });
});
