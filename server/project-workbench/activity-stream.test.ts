// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
const mocks = vi.hoisted(() => ({ query: vi.fn(), owner: vi.fn() }));
vi.mock("../db", () => ({ pool: { query: mocks.query } }));
vi.mock("../project-files", () => ({ assertProjectFileOwnership: mocks.owner }));
import { eventsAfter, publicActivitySnapshot, registerActivityStream } from "./activity-stream";
import { ProjectFileError } from "../project-file-policy";
let server: Server, url: string;
const event = { id: "event-1", jobId: "job", tool: "read_file", callId: "call", status: "completed", createdAt: new Date().toISOString(), paths: ["index.html"] };
beforeEach(async () => {
  mocks.query.mockResolvedValue({ rows: [{ role: "workbench-state", content: JSON.stringify({ events: [event], secret: "never-public" }) }] });
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
    expect(text).toContain("event: activity"); expect(text).toContain("id: event-1"); expect(text).not.toContain("never-public");
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
});
