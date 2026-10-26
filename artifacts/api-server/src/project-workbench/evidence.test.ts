// @vitest-environment node
import { createServer, type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), ownership: vi.fn(), files: vi.fn(),
  complete: vi.fn(), state: vi.fn(), mutate: vi.fn(),
  usageLog: vi.fn(),
  reserve: vi.fn(), dispatch: vi.fn(), usage: vi.fn(), rejection: vi.fn(), finish: vi.fn(),
}));
vi.mock("../db", () => ({ pool: { query: m.query, connect: m.connect } }));
vi.mock("../project-files", () => ({ assertProjectFileOwnership: m.ownership, listProjectFiles: m.files }));
vi.mock("../ai-chat-provider", () => ({ aiChatComplete: m.complete }));
vi.mock("../storage", () => ({ storage: { createUsageLog: m.usageLog } }));
vi.mock("../replit_integrations/quota", () => ({ aiQuotaGuard: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("./service", () => ({ workbenchState: m.state, mutateWorkbench: m.mutate }));
vi.mock("./job-budget", () => ({ JOB_BUDGET: { maxTokens: 50000, maxRounds: 5, paygChargeCents: 2 },
  reserveJob: m.reserve, dispatchJobCall: m.dispatch, recordJobUsage: m.usage,
  recordJobRejection: m.rejection, finishJob: m.finish, jobHistory: async () => [] }));
import { registerEvidenceRoutes } from "./evidence";
import { ProjectFileError } from "../project-file-policy";
import { fingerprint } from "./model";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGyoAAAAASUVORK5CYII=";
const source = fingerprint([]);
let server: Server, url: string, evidence: any;
const path = "/api/conversations/11/workbench/evidence";
beforeEach(async () => {
  vi.clearAllMocks();
  evidence = { id: "capture", name: "Home", mimeType: "image/png", base64: png, fingerprint: source,
    phase: "after", pageLabel: "Home", capturedAt: new Date().toISOString(), createdAt: new Date().toISOString(), width: 1, height: 1 };
  m.ownership.mockImplementation(async (owner, id) => {
    if (owner !== "owner" || id !== "11") throw new ProjectFileError(404, "Workspace not found.");
    return "11";
  });
  m.files.mockResolvedValue([]);
  m.state.mockResolvedValue({ workspaceId: "11", fingerprint: source, events: [{ id: "event", status: "completed" }] });
  m.query.mockImplementation(async (sql, args) => {
    if (sql.includes("SELECT plan")) return { rows: [{ plan: "starter", email: "owner@example.invalid" }] };
    if (sql.includes("AS metadata")) { const { base64: _bytes, ...meta } = evidence; return { rows: [{ metadata: meta }] }; }
    if (sql.startsWith("UPDATE messages")) { evidence = JSON.parse(args[1]); return { rows: [], rowCount: 1 }; }
    return { rows: [{ id: 1, content: JSON.stringify(evidence) }] };
  });
  m.connect.mockResolvedValue({ query: vi.fn(async sql => ({ rows: sql.includes("try_advisory")
    ? [{ locked: true }] : sql.includes("count(*)") ? [{ workspace: 1, total: 1 }] : [] })), release: vi.fn() });
  m.reserve.mockResolvedValue({ id: "budget", owner: "owner", conversation: "11" });
  m.usageLog.mockResolvedValue({ id: 1 });
  m.complete.mockResolvedValue({ text: "The button is clipped. Widen it; functionality cannot be judged.", model: "private-model", promptTokens: 20, completionTokens: 30 });
  m.mutate.mockResolvedValue({ request: "Propose a reviewed repair; do not claim tests ran." });
  const app = express(); app.use(express.json());
  registerEvidenceRoutes(app, (req: any, res, next) => {
    if (!req.headers["x-user"]) return void res.status(401).json({ error: "Sign in" });
    req.user = { claims: { sub: req.headers["x-user"], email: "owner@example.invalid" } }; next();
  });
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
async function request(suffix = "", method = "GET", body?: any, user = "owner") {
  return fetch(url + path + suffix, { method, headers: { "Content-Type": "application/json", ...(user ? { "x-user": user } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
describe("authenticated screenshot workflow", () => {
  it("lists metadata and persistent events but never exposes raw bytes in JSON", async () => {
    const response = await request(); const data = await response.json();
    expect(data.items[0].stale).toBe(false); expect(data.items[0].base64).toBeUndefined();
    expect(data.events[0].status).toBe("completed"); expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("requires sign-in and rejects cross-customer image access", async () => {
    expect((await request("/capture/image", "GET", undefined, "")).status).toBe(401);
    expect((await request("/capture/image", "GET", undefined, "other")).status).toBe(404);
    const image = await request("/capture/image");
    expect(image.headers.get("content-type")).toContain("image/png");
    expect(Buffer.from(await image.arrayBuffer()).toString("base64")).toBe(png);
  });
  it("requires consent and actually passes image bytes to the model", async () => {
    expect((await request("/capture/review", "POST", {})).status).toBe(400);
    expect(m.complete).not.toHaveBeenCalled();
    expect((await request("/capture/review", "POST", { confirm: true, language: "fr" })).status).toBe(200);
    const call = m.complete.mock.calls[0][0];
    expect(call.messages[0].content).toContain("French");
    expect(call.messages[1].content[1].image_url.url).toBe(`data:image/png;base64,${png}`);
    expect(call.noAmbiguousRetry).toBe(true); expect(m.finish).toHaveBeenCalledTimes(1);
    expect(evidence.review.source).toBe("ai-visual");
    expect((await request("/capture/review", "POST", { confirm: true })).status).toBe(200);
    expect(m.complete).toHaveBeenCalledTimes(1); // Same evidence is idempotent.
  });
  it("rejects stale review and repair without spending", async () => {
    evidence.fingerprint = "old";
    expect((await request("/capture/review", "POST", { confirm: true })).status).toBe(409);
    expect((await request("/capture/repair", "POST", { confirm: true })).status).toBe(409);
    expect(m.reserve).not.toHaveBeenCalled();
  });
  it("prepares a repair without executing or saving source", async () => {
    evidence.review = { findings: "Clipped text", fingerprint: source };
    const response = await request("/capture/repair", "POST", { confirm: true });
    expect((await response.json()).request).toContain("reviewed repair");
    expect(m.mutate).toHaveBeenCalledWith("owner", "11", "visual-repair", expect.objectContaining({ findings: "Clipped text" }));
    expect(m.complete).not.toHaveBeenCalled();
  });
  it("fails explicitly without leaking provider errors or retrying", async () => {
    m.complete.mockRejectedValue(new Error("private-provider-details"));
    const response = await request("/capture/review", "POST", { confirm: true });
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("private-provider-details");
    expect(m.complete).toHaveBeenCalledTimes(1); expect(m.finish).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid upload and requires explicit screenshot removal", async () => {
    expect((await request("", "POST", { ...evidence, fingerprint: "old" })).status).toBe(409);
    expect((await request("/capture", "DELETE", {})).status).toBe(400);
    expect((await request("/capture", "DELETE", { confirm: true })).status).toBe(200);
  });
});
