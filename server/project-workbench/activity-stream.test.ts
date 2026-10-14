// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
const mocks = vi.hoisted(() => ({ query: vi.fn(), owner: vi.fn(), page: vi.fn(), import: vi.fn(), cursor: vi.fn() }));
vi.mock("../db", () => ({ pool: { query: mocks.query } }));
vi.mock("../project-files", () => ({ assertProjectFileOwnership: mocks.owner }));
vi.mock("./activity-history", async importOriginal => ({
  ...await importOriginal<typeof import("./activity-history")>(),
  importLegacyActivity: mocks.import, readActivityPage: mocks.page, resolveActivityCursor: mocks.cursor,
}));
import { eventsAfter, publicActivitySnapshot, registerActivityStream } from "./activity-stream";
import { ProjectFileError } from "../project-file-policy";
let server: Server, url: string;
const event = { id: "event-1", jobId: "job", tool: "read_file", callId: "call", status: "completed", createdAt: new Date().toISOString(), paths: ["index.html"] };
beforeEach(async () => {
  mocks.query.mockResolvedValue({ rows: [{ role: "workbench-state", content: JSON.stringify({ events: [event], secret: "never-public" }) }] });
  mocks.import.mockResolvedValue(undefined);
  mocks.cursor.mockResolvedValue("101");
  mocks.page.mockImplementation(async (_workspace, options) => ({
    items: options.after ? [] : [{ ...event, sequence: "101" }], hasMore: false, nextBefore: null,
    retention: "project-lifetime",
  }));
  mocks.owner.mockImplementation(async owner => {
    if (owner !== "owner") throw new ProjectFileError(404, "Not found"); return "11";
  });
  const app = express();
  registerActivityStream(app, (req: any, res, next) => {
    if (!req.get("x-user")) return void res.status(401).end();
    req.user = { claims: { sub: req.get("x-user") } }; next();
  });
  server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as any).port}/api/conversations/11/workbench/events`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
describe("persistent owner-scoped activity stream", () => {
  it("replays events but excludes raw source, screenshot bytes and private job fields", () => {
    const snapshot = publicActivitySnapshot([{ role: "workbench-state", content: JSON.stringify({ events: [event], files: "private-source", model: "private-model" }) },
      { role: "workbench-capture", content: JSON.stringify({ id: "capture", status: "captured", updatedAt: new Date().toISOString(), base64: "private-image" }) }]);
    expect(snapshot).toHaveLength(2); expect(JSON.stringify(snapshot)).not.toContain("private");
    expect(snapshot[1].title).toContain("review required");
    expect(eventsAfter(snapshot, "event-1").events).toHaveLength(1);
    expect(eventsAfter(snapshot, "expired").reset).toBe(true);
  });
  it("requires authentication and ownership; path does not select another user", async () => {
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { "x-user": "other" } })).status).toBe(404);
  });
  it("streams saved events with IDs and no buffering/cache, then releases connection", async () => {
    const controller = new AbortController();
    const response = await fetch(url, { headers: { "x-user": "owner" }, signal: controller.signal });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-transform");
    const reader = response.body!.getReader();
    const text = new TextDecoder().decode((await reader.read()).value);
    expect(text).toContain("event: activity"); expect(text).toContain("id: 101"); expect(text).not.toContain("never-public");
    controller.abort(); await reader.cancel().catch(() => {});
  });
  it("honors Last-Event-ID without replaying a paid operation", async () => {
    const controller = new AbortController();
    const response = await fetch(url, { headers: { "x-user": "owner", "Last-Event-ID": "event-1" }, signal: controller.signal });
    const reader = response.body!.getReader();
    const text = new TextDecoder().decode((await reader.read()).value);
    expect(text).toContain("heartbeat"); expect(text).not.toContain("event: activity");
    controller.abort(); await reader.cancel().catch(() => {});
  });
  it("restores an authenticated history page and rejects invalid pagination", async () => {
    const history = url.replace("/events", "/activity");
    expect((await fetch(history)).status).toBe(401);
    expect((await fetch(history, { headers: { "x-user": "other" } })).status).toBe(404);
    const response = await fetch(`${history}?limit=50&before=102`, { headers: { "x-user": "owner" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).items[0].sequence).toBe("101");
    expect(mocks.page).toHaveBeenCalledWith("11", { before: "102", limit: 50 });
    expect((await fetch(`${history}?before=1%20OR%201=1`, { headers: { "x-user": "owner" } })).status).toBe(400);
    expect((await fetch(`${history}?limit=101`, { headers: { "x-user": "owner" } })).status).toBe(400);
  });
  it("does not expose a page if access is revoked while history is loading", async () => {
    mocks.owner.mockResolvedValueOnce("11").mockRejectedValueOnce(new ProjectFileError(404, "Not found"));
    const response = await fetch(url.replace("/events", "/activity"), { headers: { "x-user": "owner" } });
    expect(response.status).toBe(404); expect(await response.text()).not.toContain("event-1");
  });
  it("supports two tabs independently and resumes from numeric sequences", async () => {
    const controllers = [new AbortController(), new AbortController()];
    const responses = await Promise.all(controllers.map(controller => fetch(url, { headers: { "x-user": "owner" }, signal: controller.signal })));
    const readers = responses.map(response => response.body!.getReader());
    for (const reader of readers) expect(new TextDecoder().decode((await reader.read()).value)).toContain("id: 101");
    controllers[0].abort(); await readers[0].cancel().catch(() => {});
    const third = new AbortController();
    const resumed = await fetch(url, { headers: { "x-user": "owner", "Last-Event-ID": "101" }, signal: third.signal });
    const reader = resumed.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).not.toContain("event: activity");
    expect(mocks.cursor).toHaveBeenCalledWith("11", "101");
    third.abort(); controllers[1].abort();
    await Promise.all([reader.cancel().catch(() => {}), readers[1].cancel().catch(() => {})]);
  });
});
