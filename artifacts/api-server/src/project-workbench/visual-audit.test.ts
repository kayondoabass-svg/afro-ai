// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
const m = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), ownership: vi.fn(), files: vi.fn(), capture: vi.fn(),
  complete: vi.fn(), reserve: vi.fn(), dispatch: vi.fn(), usage: vi.fn(), finish: vi.fn(), log: vi.fn(), mutate: vi.fn(),
}));
vi.mock("../db", () => ({ pool: { query: m.query, connect: m.connect } }));
vi.mock("./activity-history", () => ({ appendActivities: vi.fn(async () => {}) }));
vi.mock("../project-files", () => ({ assertProjectFileOwnership: m.ownership, listProjectFiles: m.files }));
vi.mock("./browser-capture", async importOriginal => ({
  ...await importOriginal<typeof import("./browser-capture")>(),
  browserCaptureCapability: () => ({ enabled: true, configured: true, permissionVerified: false }),
  remoteScreenshot: m.capture, VISUAL_PROFILES: { desktop: { label: "Desktop" }, mobile: { label: "Mobile" } },
}));
vi.mock("../ai-chat-provider", () => ({ aiChatComplete: m.complete }));
vi.mock("../storage", () => ({ storage: { createUsageLog: m.log } }));
vi.mock("./service", () => ({ mutateWorkbench: m.mutate }));
vi.mock("../replit_integrations/quota", () => ({ aiQuotaGuard: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("./job-budget", () => ({
  JOB_BUDGET: { maxTokens: 50000, paygChargeCents: 2 }, reserveJob: m.reserve, dispatchJobCall: m.dispatch,
  recordJobUsage: m.usage, recordJobRejection: vi.fn(), finishJob: m.finish,
}));
import { capturePair, registerVisualAuditRoutes } from "./visual-audit";
import { fingerprint } from "./model";
import { ProjectFileError } from "../project-file-policy";

const requestId = "00000000-0000-4000-8000-000000000001";
const files = [{ path: "index.html", name: "index.html", language: "html", content: "<button>Neon</button>" }];
const source = fingerprint(files);
type Row = { id: number; role: string; conversation: string; content: string };
let rows: Row[], server: Server, url: string, lock: boolean, logError: boolean;
const body = () => ({ requestId, fingerprint: source, phase: "after", confirm: true });
beforeEach(async () => {
  vi.clearAllMocks(); rows = []; lock = true; logError = false;
  m.ownership.mockImplementation(async (owner, id) => {
    if (owner !== "owner" || id !== "11") throw new ProjectFileError(404, "Not found"); return "11";
  });
  m.files.mockResolvedValue(files);
  m.capture.mockImplementation(async (_html, profile, fp, phase) => ({
    profile, fingerprint: fp, phase, base64: `test-image-${profile}`, mimeType: "image/jpeg",
    name: profile, width: profile === "desktop" ? 1280 : 375, height: profile === "desktop" ? 800 : 812,
  }));
  m.query.mockImplementation(async (sql: string, args: any[] = []) => {
    if (sql.includes("try_advisory")) return { rows: [{ locked: lock }] };
    if (sql.includes("SELECT plan")) return { rows: [{ plan: "payg", email: "owner@example.invalid" }] };
    if (sql.includes("count(*)")) return { rows: [{ total: rows.filter(r => r.role === "workbench-evidence").length,
      workspace: rows.filter(r => r.role === "workbench-evidence").length, daily: rows.filter(r => r.role === "workbench-capture").length }] };
    if (sql.startsWith("INSERT INTO messages")) {
      const role = sql.includes("'workbench-capture'") ? "workbench-capture" : "workbench-evidence";
      const row = { id: rows.length + 1, conversation: String(args[0]), role, content: args[1] }; rows.push(row);
      return { rows: [{ id: row.id }], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE messages")) {
      const row = rows.find(r => r.id === args[0] && r.conversation === String(args[2]));
      if (row) row.content = args[1]; return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (sql.startsWith("SELECT")) {
      let selected = rows.filter(r => r.conversation === String(args[0]));
      if (sql.includes("'workbench-capture'")) selected = selected.filter(r => r.role === "workbench-capture");
      else if (sql.includes("'workbench-evidence'")) selected = selected.filter(r => r.role === "workbench-evidence");
      if (sql.includes("->>'id'")) selected = selected.filter(r => JSON.parse(r.content).id === args[1]);
      if (sql.includes("->>'captureId'")) selected = selected.filter(r => JSON.parse(r.content).captureId === args[1]);
      if (sql.includes("->>'parentRunId'")) selected = selected.filter(r => JSON.parse(r.content).parentRunId === args[1]);
      return { rows: selected };
    }
    return { rows: [] };
  });
  m.connect.mockImplementation(async () => ({ query: m.query, release: vi.fn() }));
  m.reserve.mockResolvedValue({ owner: "owner", conversation: "11", id: "budget" });
  m.dispatch.mockResolvedValue({ outputLimit: 2000 });
  m.complete.mockResolvedValue({ text: "Desktop: clear. Mobile: button text clips; use flex-wrap. Functionality is not verified.", model: "private-model", promptTokens: 1000, completionTokens: 100 });
  m.log.mockImplementation(async () => { if (logError) throw new Error("logging failed"); return {}; });
  m.mutate.mockResolvedValue({ request: "Prepare responsive fix for explicit approval.", saved: false });
  const app = express(); app.use(express.json());
  registerVisualAuditRoutes(app, (req: any, res, next) => {
    if (!req.get("x-user")) return void res.status(401).end();
    req.user = { claims: { sub: req.get("x-user"), email: "owner@example.invalid" } }; next();
  });
  server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as any).port}/api/conversations/11/workbench/visual-audit`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
const capture = () => capturePair("owner", "11", body(), new AbortController().signal);
async function request(suffix: string, data: unknown, owner = "owner", origin?: string) {
  return fetch(url + suffix, { method: "POST", headers: { "Content-Type": "application/json", ...(owner ? { "x-user": owner } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(data) });
}
describe("paired visual-audit backend", () => {
  it("requires consent, ownership and current source before paid capture", async () => {
    await expect(capturePair("other", "11", body(), new AbortController().signal)).rejects.toThrow("Not found");
    await expect(capturePair("owner", "11", { ...body(), confirm: false }, new AbortController().signal)).rejects.toThrow("Confirm");
    await expect(capturePair("owner", "11", { ...body(), fingerprint: "old" }, new AbortController().signal)).rejects.toThrow("changed");
    expect(m.capture).not.toHaveBeenCalled();
  });
  it("saves both profiles privately and reuses a successful request without recapture", async () => {
    const run = await capture();
    expect(run.status).toBe("captured"); expect(run.evidenceIds).toHaveLength(2);
    expect(rows.filter(r => r.role === "workbench-evidence")).toHaveLength(2);
    expect(await capture()).toEqual(run); expect(m.capture).toHaveBeenCalledTimes(2);
    const response = await fetch(url, { headers: { "x-user": "owner" } });
    expect(JSON.stringify(await response.json())).not.toContain("test-image");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(run.target).toMatchObject({ workspace: "11", source, profileVersion: 1 });
  });
  it("exports private report metadata without images or fabricated verification", async () => {
    await capture();
    const response = await fetch(`${url}/${requestId}/report`, { headers: { "x-user": "owner" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(".json");
    const report = await response.json();
    expect(report.functionalVerified).toBe(false);
    expect(report.deploymentVerified).toBe(false);
    expect(JSON.stringify(report)).not.toContain("test-image");
    expect((await fetch(`${url}/${requestId}/report`, { headers: { "x-user": "other" } })).status).toBe(404);
  });
  it("prepares one durable repair request and returns the saved request on retry", async () => {
    await capture();
    const row = rows.find(r => r.role === "workbench-capture")!;
    const run = JSON.parse(row.content);
    row.content = JSON.stringify({ ...run, review: { id: "review", fingerprint: source, findings: "Mobile clips" } });
    expect((await request(`/${requestId}/repair`, { confirm: true })).status).toBe(200);
    expect((await request(`/${requestId}/repair`, { confirm: true })).status).toBe(200);
    expect(m.mutate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(row.content).repair.status).toBe("awaiting-reviewed-save");
  });
  it("blocks recapture until a repair is reviewed and saved and bounds the lineage", async () => {
    await capture();
    const next = { ...body(), requestId: "00000000-0000-4000-8000-000000000002", parentRunId: requestId };
    await expect(capturePair("owner", "11", next, new AbortController().signal)).rejects.toThrow("Save an approved repair");
    const row = rows.find(r => r.role === "workbench-capture")!;
    row.content = JSON.stringify({ ...JSON.parse(row.content), repairDepth: 3 });
    await expect(capturePair("owner", "11", next, new AbortController().signal)).rejects.toThrow("Three");
    expect(m.capture).toHaveBeenCalledTimes(2);
  });
  it("continues saved repair source once and persists depth rather than resetting on reload", async () => {
    await capture();
    const row = rows.find(r => r.role === "workbench-capture")!;
    row.content = JSON.stringify({ ...JSON.parse(row.content), review: { fingerprint: source }, repair: { request: "Fix CSS" } });
    const changed = [{ ...files[0], content: "<button style='max-width:100%'>Neon</button>" }];
    m.files.mockResolvedValue(changed);
    const next = { ...body(), fingerprint: fingerprint(changed), requestId: "00000000-0000-4000-8000-000000000002", parentRunId: requestId };
    const run = await capturePair("owner", "11", next, new AbortController().signal);
    expect(run.repairDepth).toBe(1);
    expect(run.parentRunId).toBe(requestId);
    expect(run.target?.source).toBe(fingerprint(changed));
    expect(await capturePair("owner", "11", next, new AbortController().signal)).toEqual(run);
    await expect(capturePair("owner", "11", { ...next, requestId: "00000000-0000-4000-8000-000000000003" }, new AbortController().signal)).rejects.toThrow("already has a capture");
    expect(m.capture).toHaveBeenCalledTimes(4);
  });
  it("accepts only the complete bounded two-view checklist as structured observations", async () => {
    await capture();
    const checks = ["text-clipping", "overflow", "wrapping", "alignment", "readability", "obscured-controls"];
    const view = checks.map(check => ({ check, status: "uncertain", detail: "Only initial viewport observed" }));
    m.complete.mockResolvedValue({ text: JSON.stringify({ desktop: view, mobile: view, summary: "No functional tests performed" }), promptTokens: 1000, completionTokens: 300 });
    const response = await request(`/${requestId}/review`, { confirm: true });
    expect(response.status).toBe(200);
    const review = await response.json();
    expect(review.inspection.mobile).toHaveLength(6);
    expect(review.inspection.functionalVerified).toBe(false);
    expect(review.findings).toContain("Only initial viewport observed");
  });
  it("does not reuse an idempotency key for another source", async () => {
    await capture();
    await expect(capturePair("owner", "11", { ...body(), fingerprint: "old" }, new AbortController().signal)).rejects.toThrow("different snapshot");
    expect(m.capture).toHaveBeenCalledTimes(2);
  });
  it("never saves a partial pair or retries an uncertain browser call", async () => {
    m.capture.mockResolvedValueOnce({ profile: "desktop", base64: "first" }).mockRejectedValueOnce(new Error("private-provider-error"));
    await expect(capture()).rejects.toThrow();
    expect(rows.filter(r => r.role === "workbench-evidence")).toHaveLength(0);
    expect(JSON.parse(rows[0].content).status).toBe("uncertain");
    expect(rows[0].content).not.toContain("private-provider-error");
    await expect(capture()).rejects.toThrow("already attempted"); expect(m.capture).toHaveBeenCalledTimes(2);
  });
  it("rejects simultaneous owner captures before dispatch", async () => {
    lock = false; await expect(capture()).rejects.toThrow("Another capture"); expect(m.capture).not.toHaveBeenCalled();
  });
  it("rejects source changes during capture instead of claiming current evidence", async () => {
    m.files.mockResolvedValueOnce(files).mockResolvedValueOnce([]);
    await expect(capture()).rejects.toThrow("Source changed");
    expect(rows.filter(r => r.role === "workbench-evidence")).toHaveLength(0);
  });
  it("protects mutation endpoints against cross-origin requests and anonymous clients", async () => {
    expect((await request("/capture", body(), "owner", "https://evil.example")).status).toBe(403);
    expect((await request("/capture", body(), "")).status).toBe(401);
    expect(m.capture).not.toHaveBeenCalled();
  });
  it("sends BOTH image blocks to one bounded AI review and caches saved findings", async () => {
    await capture();
    const response = await request(`/${requestId}/review`, { confirm: true, language: "fr" });
    expect(response.status).toBe(200);
    const call = m.complete.mock.calls[0][0];
    expect(call.messages[0].content).toContain("French");
    const imageBlocks = call.messages[1].content.filter((c: any) => c.type === "image_url");
    expect(imageBlocks.map((b: any) => b.image_url.url)).toEqual(["data:image/jpeg;base64,test-image-desktop", "data:image/jpeg;base64,test-image-mobile"]);
    expect(call.noAmbiguousRetry).toBe(true);
    expect(m.dispatch.mock.calls[0][1]).toBeGreaterThan(40000);
    expect(m.dispatch.mock.calls[0][1] + 2000).toBeLessThan(50000);
    expect(m.finish).toHaveBeenLastCalledWith(expect.anything(), true);
    expect((await request(`/${requestId}/review`, { confirm: true })).status).toBe(200);
    expect(m.complete).toHaveBeenCalledTimes(1);
  });
  it("requires both images and rejects stale source without charging for review", async () => {
    await capture(); rows = rows.filter(r => r.role !== "workbench-evidence" || JSON.parse(r.content).profile !== "mobile");
    expect((await request(`/${requestId}/review`, { confirm: true })).status).toBe(409);
    expect(m.reserve).not.toHaveBeenCalled();
  });
  it("prepares reviewed repairs, never mutates files or publishes", async () => {
    await capture(); await request(`/${requestId}/review`, { confirm: true });
    const response = await request(`/${requestId}/repair`, { confirm: true });
    expect(response.status).toBe(200);
    expect(m.mutate).toHaveBeenCalledWith("owner", "11", "visual-repair", expect.objectContaining({ fingerprint: source }));
    expect(m.complete).toHaveBeenCalledTimes(1);
  });
  it("blocks another paid review after a timeout with unknown provider outcome", async () => {
    await capture(); m.complete.mockRejectedValue(new Error("unknown paid outcome"));
    expect((await request(`/${requestId}/review`, { confirm: true })).status).toBe(503);
    expect(JSON.parse(rows.find(r => r.role === "workbench-capture")!.content).reviewAttempt.status).toBe("uncertain");
    expect((await request(`/${requestId}/review`, { confirm: true })).status).toBe(409);
    expect(m.complete).toHaveBeenCalledTimes(1);
    expect(m.finish).toHaveBeenCalledTimes(1);
  });
  it("does not provoke a duplicate paid call when secondary usage logging fails after saved findings", async () => {
    await capture(); logError = true;
    const response = await request(`/${requestId}/review`, { confirm: true });
    expect(response.status).toBe(200); expect((await response.json()).usageLogPending).toBe(true);
    expect(m.finish).toHaveBeenLastCalledWith(expect.anything(), true);
    expect((await request(`/${requestId}/review`, { confirm: true })).status).toBe(200);
    expect(m.complete).toHaveBeenCalledTimes(1);
  });
});
