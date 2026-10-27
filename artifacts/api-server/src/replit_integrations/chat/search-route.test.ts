import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const mocks = vi.hoisted(() => ({
  rows: [] as any[],
  getConversation: vi.fn(),
  search: vi.fn(),
  inference: vi.fn(),
  stream: vi.fn(),
  saveFiles: vi.fn(),
  listFiles: vi.fn(),
  getUser: vi.fn(),
  archiveActivity: vi.fn(),
}));
vi.mock("openai", () => ({ default: class {} }));
vi.mock("./storage", () => ({ chatStorage: {
  getConversation: mocks.getConversation,
  getMessagesByConversation: vi.fn(async () => [...mocks.rows]),
  createMessage: vi.fn(async (conversationId, role, content) => {
    const row = { id: mocks.rows.length + 1, conversationId, role, content };
    mocks.rows.push(row); return row;
  }),
  updateConversationTitle: vi.fn(),
} }));
vi.mock("../../db", () => ({ db: { select: () => ({ from: () => ({ where: async () => {
  const user = await mocks.getUser(); return user ? [user] : [];
} }) }) } }));
vi.mock("../../project-workbench/job-budget", async importOriginal => {
  const real = await importOriginal<typeof import("../../project-workbench/job-budget")>();
  const { isFounderEmail } = await import("../../founder-access");
  return {
  JOB_BUDGET: { maxTokens: 50000, maxRounds: 5, paygChargeCents: 2 },
  tokenBudget: () => 50000,
  reserveJob: vi.fn(async (owner, conversation, _max, _charge, email) => ({
    id: "job", owner, conversation,
    quotaExempt: isFounderEmail(email) && isFounderEmail((await mocks.getUser())?.email),
  })),
  dispatchJobCall: vi.fn(async (job, input, output, fit) => {
    const budget = { maxTokens: 50000, usedTokens: 0, calls: 0, quotaExempt: job.quotaExempt } as any;
    const granted = fit ? real.fitJobOutput(budget, input, output) : output;
    real.assertNextCall(budget, input, granted);
    return { ...budget, outputLimit: granted };
  }),
  recordJobUsage: vi.fn(async () => {}),
  recordJobRejection: vi.fn(async () => {}),
  finishJob: vi.fn(async () => ({ calls: 1, usedTokens: 250 })),
  jobHistory: vi.fn(async () => []),
  deleteConversationWithBudgetGuard: vi.fn(async () => {}),
}; });
vi.mock("../../storage", () => ({ storage: {
  getUser: mocks.getUser,
  createUsageLog: vi.fn(async () => ({})),
  getAppVersions: vi.fn(async () => []),
  saveAppVersion: vi.fn(async () => ({ id: 1, label: "Version 1" })),
} }));
vi.mock("../auth/replitAuth", () => ({ isAuthenticated: vi.fn(), FOUNDER_EMAIL: "founder@example.org" }));
vi.mock("../quota", () => ({ aiQuotaGuard: () => vi.fn() }));
vi.mock("../../ai-chat-provider", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../ai-chat-provider")>(),
  aiChatComplete: mocks.inference, aiChatCompleteStream: mocks.stream,
}));
vi.mock("../../web-search", () => ({ searchWeb: mocks.search, webSearchConfigured: () => Boolean(process.env.JINA_API_KEY) }));
vi.mock("../../search-policy", () => ({ searchAccountWeb: (_id: string, q: string, s: AbortSignal) => mocks.search(q, s) }));
vi.mock("../../url-scrape", () => ({ extractUrls: () => [], buildLiveWebContext: vi.fn() }));
vi.mock("../../attachment-parse", () => ({ isParseableAttachment: () => false, buildAttachmentContext: vi.fn() }));
vi.mock("../../project-files", () => ({ listProjectFiles: mocks.listFiles, saveProjectFiles: mocks.saveFiles }));
vi.mock("../../project-workbench/activity-history", async importOriginal => ({
  ...await importOriginal<typeof import("../../project-workbench/activity-history")>(),
  archiveActivities: mocks.archiveActivity,
}));
vi.mock("../../knowledge", () => ({ retrieveKnowledge: async () => [], formatKnowledgeContext: () => "" }));
import { registerChatRoutes } from "./routes";
import { dispatchJobCall, recordJobUsage, finishJob } from "../../project-workbench/job-budget";
import { FOUNDER_EMAILS } from "../../founder-access";
import * as metering from "../../project-workbench/model-metering";

function handler() {
  let route: any;
  const app = {
    get: vi.fn(), delete: vi.fn(), use: vi.fn(),
    post: (path: string, ...handlers: any[]) => {
      if (path === "/api/conversations/:id/messages") route = handlers.at(-1);
    },
  };
  registerChatRoutes(app as any);
  return route;
}
function response() {
  return Object.assign(new EventEmitter(), {
    destroyed: false, writableEnded: false, headersSent: false,
    setHeader: vi.fn(), write: vi.fn(), end: vi.fn(),
    status: vi.fn().mockReturnThis(), json: vi.fn(),
  });
}
const req = (content = "Search Kampala AI conference", webSearch = true) => ({
  params: { id: "12" }, user: { claims: { id: "owner" } }, body: { content, webSearch },
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.mocked(dispatchJobCall).mockClear(); vi.mocked(recordJobUsage).mockClear(); vi.mocked(finishJob).mockClear();
  mocks.stream.mockReset();
  mocks.getUser.mockReset().mockResolvedValue(null);
  mocks.listFiles.mockReset().mockResolvedValue([]);
  mocks.saveFiles.mockReset().mockResolvedValue([]);
  mocks.rows = [];
  mocks.getConversation.mockResolvedValue({ id: 12, userId: "owner" });
  mocks.search.mockReset().mockResolvedValue([{ title: "Kampala AI Conference admission", url: "https://conference.ug/register", snippet: "Free; register first.", retrievedAt: "2026-05-01" }]);
  mocks.inference.mockReset().mockImplementation(async (options) => {
    if (options.messages.some((m: any) => m.role === "tool")) {
      return { text: "Check the linked event registration page.", model: "test", completionTokens: 10 };
    }
    return { text: "", model: "test", toolCalls: [{ id: "search-1", type: "function", function: { name: "search_web", arguments: '{"query":"Kampala AI Conference registration"}' } }] };
  });
  vi.stubEnv("JINA_API_KEY", "test-only");
});
describe("main chat search route wiring", () => {
  it("allows a verified founder's long builder conversation without the customer token cap or PAYG balance", async () => {
    mocks.getUser.mockResolvedValue({ id: "owner", email: FOUNDER_EMAILS[0], plan: "payg", paygBalance: 0, paygLimit: 0, paygSpent: 0 });
    mocks.rows = [{ role: "user", content: "Earlier website discussion. ".repeat(20000) }];
    mocks.inference.mockResolvedValue({ text: "Here are three logo ideas.", model: "test", promptTokens: 110000, completionTokens: 20 });
    const request = req("Suggest a logo for this website", false);
    request.user.claims = { sub: "owner", email: FOUNDER_EMAILS[0] } as any;
    const reply = response();
    await handler()(request, reply);
    expect(vi.mocked(dispatchJobCall).mock.calls[0][1]).toBeGreaterThan(50000);
    expect(mocks.inference).toHaveBeenCalledTimes(1);
    expect(reply.write).toHaveBeenCalledWith(expect.stringContaining("three logo ideas"));
    expect(recordJobUsage).toHaveBeenCalledWith(expect.anything(), 110020, false);
  });
  it("ignores founder flags in a customer's request body and preserves the customer token cap", async () => {
    mocks.getUser.mockResolvedValue({ id: "owner", email: "customer@example.org", plan: "business" });
    mocks.rows = [{ role: "user", content: "Earlier website discussion. ".repeat(20000) }];
    const request = req("Suggest a logo", false);
    request.user.claims = { sub: "owner", email: "customer@example.org" } as any;
    request.body = { ...request.body, mode: "founder", quotaExempt: true, founder: true } as any;
    const reply = response();
    await handler()(request, reply);
    expect(mocks.inference).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(402);
    expect(reply.json).toHaveBeenCalledWith({ error: expect.stringContaining("too small") });
  });
  it.each(["starter", "pro", "business", "payg"])("allows an actual %s builder greeting within the real budget", async plan => {
    mocks.getUser.mockResolvedValue({ id: "owner", plan, firstName: "Test", paygBalance: 1000, paygLimit: 1000, paygSpent: 0 });
    mocks.inference.mockResolvedValue({ text: "Hello! I can help with your project.", model: "test", promptTokens: 18000, completionTokens: 10 });
    const reply = response();
    await handler()(req("hello. what can you do?", false), reply);
    expect(mocks.inference).toHaveBeenCalledTimes(1);
    const options = mocks.inference.mock.calls[0][0];
    const input = vi.mocked(dispatchJobCall).mock.calls[0][1];
    expect(input).toBeLessThan(50000);
    expect(input + options.maxTokens).toBeLessThanOrEqual(50000);
    expect(reply.write).toHaveBeenCalledWith(expect.stringContaining("Hello! I can help"));
    expect(finishJob).toHaveBeenCalledWith(expect.anything(), true);
  });
  it.each(["invalid response", "save failure"])("does not charge a selected-file %s and counts its prompt", async (failure) => {
    const content = "<html><body>Existing page</body></html>";
    mocks.listFiles.mockResolvedValue([{ path: "index.html", name: "index.html", language: "html", content }]);
    mocks.stream.mockResolvedValue({
      fullText: failure === "invalid response" ? "Not an edit" : JSON.stringify({
        protocol: "project-file-edit/v1", path: "index.html", content: "<html><body>Changed page</body></html>", summary: "Updated page",
      }),
      model: "test", promptTokens: 200, completionTokens: 50,
    });
    if (failure === "save failure") mocks.saveFiles.mockRejectedValue(new Error("Storage unavailable"));
    const request = req("Edit my page", false);
    request.body = { ...request.body, selectedFilePath: "index.html" } as any;
    const reply = response();
    await handler()(request, reply);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchJobCall).mock.calls[0][1]).toBeGreaterThan(Buffer.byteLength(content) + 4096);
    expect(recordJobUsage).toHaveBeenCalledWith(expect.anything(), 250, false);
    expect(finishJob).toHaveBeenCalledWith(expect.anything(), false);
    expect(reply.write).toHaveBeenCalledWith(expect.stringContaining("No AI edit was saved"));
    if (failure === "save failure") expect(mocks.saveFiles).toHaveBeenCalledTimes(1);
    else expect(mocks.saveFiles).not.toHaveBeenCalled();
  });
  it("includes hosting trial limits and upgrade requirements in pricing guidance", async () => {
    mocks.inference.mockResolvedValue({ text: "Starter includes one published app for 30 days. Upgrade for continued hosting.", model: "test" });
    await handler()(req("Do I need to pay for hosting?", false), response());
    const system = mocks.inference.mock.calls[0][0].messages[0].content;
    expect(system).toContain("Starter allows one published app and a 30-day hosting trial");
    expect(system).toContain("continued hosting requires an upgrade");
    expect(system).toContain("State these limits whenever discussing free hosting");
    expect(system).toContain("use current Plans/Billing");
    expect(system).toContain("pitch an upgrade during failures/recovery");
    expect(system).toContain("payment fixes a technical/provider problem");
  });
  it("does not let a stale Plan toggle block generating and saving a website", async () => {
    mocks.inference.mockResolvedValue({ text: "<html><body><h1>A complete generated website</h1></body></html>", model: "test" });
    await handler()(req("[PLAN MODE] build now", false), response());
    expect(mocks.inference.mock.calls[0][0].messages[0].content).toContain("AUTOMATIC PLAN AND BUILD");
    expect(mocks.saveFiles).toHaveBeenCalled();
  });
  it("honors an explicit plan-only request without saving generated files", async () => {
    mocks.inference.mockResolvedValue({ text: "The plan is a homepage, services section and contact form. No implementation yet.", model: "test" });
    await handler()(req("Only discuss the approach.", false), response());
    expect(mocks.inference.mock.calls[0][0].messages[0].content).toContain("EXPLICIT PLAN-ONLY REQUEST");
    expect(mocks.saveFiles).not.toHaveBeenCalled();
  });
  it("recommends Publish then live preview only after an actual version is saved", async () => {
    mocks.inference.mockResolvedValue({ text: "<!doctype html><html><body><h1>A complete working website</h1></body></html>", model: "test" });
    const res = response();
    await handler()(req("Hello", false), res);
    expect(res.write.mock.calls.join("")).toContain('"saved":true');
    expect(mocks.rows.at(-1).content).toContain("Select **Publish**");
    expect(mocks.rows.at(-1).content).toContain("then open the published link");
    expect(mocks.rows.at(-1).content).not.toContain("[Link to your website]");
    expect(mocks.saveFiles).toHaveBeenCalledWith("owner", 12, [
      expect.objectContaining({ path: "index.html", language: "html" }),
    ], "merge");
    const { validateProjectFiles } = await import("../../project-file-policy");
    expect(() => validateProjectFiles(mocks.saveFiles.mock.calls.at(-1)![2])).not.toThrow();
    expect(res.write.mock.calls.join("")).toContain('"type":"files-saved","saved":true');
    const actionPayloads = res.write.mock.calls.flatMap(([line]) => {
      try { return [JSON.parse(String(line).replace(/^data: /, "").trim())]; } catch { return []; }
    }).filter(event => event.type === "project-tool");
    expect(actionPayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({ tool: "generate_website", status: "succeeded", persisted: true }),
      expect.objectContaining({ tool: "save_website_version", status: "succeeded", persisted: true }),
      expect.objectContaining({ tool: "save_project_files", status: "started" }),
      expect.objectContaining({ tool: "save_project_files", status: "succeeded", paths: ["index.html"], persisted: true }),
    ]));
    expect(mocks.archiveActivity).toHaveBeenCalledWith("12", [expect.objectContaining({ tool: "save_project_files", status: "succeeded" })]);
  });
  it("reports a workspace-file save failure without pretending Files was updated", async () => {
    mocks.saveFiles.mockRejectedValue(new Error("storage unavailable"));
    mocks.inference.mockResolvedValue({ text: "<html><body><h1>A complete generated website</h1></body></html>", model: "test" });
    const res = response();
    await handler()(req("Hello", false), res);
    expect(res.write.mock.calls.join("")).toContain('"type":"files-saved","saved":false');
    expect(mocks.rows.at(-1).content).toContain("updating index.html in Files failed");
    expect(mocks.rows.at(-1).content).toContain("Select **Publish**");
  });
  it("lets the model clarify an unclear image instead of forcing search from an old UI flag", async () => {
    // This test exercises search routing, not the size of the evolving system
    // catalogue. Real metering has its own tests; rejection is tested below.
    vi.spyOn(metering, "modelInputBound").mockReturnValue(1000);
    mocks.inference.mockResolvedValue({ text: "Please name the event in the image.", model: "test" });
    const request: any = req("Search this image", true);
    request.body.attachments = [{ mimetype: "image/png", dataUrl: "data:image/png;base64,eA==" }];
    const res = response();
    await handler()(request, res);
    expect(res.json.mock.calls).toEqual([]);
    expect(mocks.inference).toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.rows.some(m => m.role === "web-search")).toBe(false);
    expect(mocks.inference.mock.calls[0][0].messages.some((m: any) => m.content.includes("image's subject is unclear"))).toBe(true);
  });
  it("rejects an over-budget image request before search or a paid model call", async () => {
    vi.spyOn(metering, "modelInputBound").mockReturnValue(50_001);
    const request: any = req("Search this image", true);
    request.body.attachments = [{ mimetype: "image/png", dataUrl: "data:image/png;base64,eA==" }];
    const res = response();
    await handler()(request, res);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("No additional AI call was started") }));
    expect(mocks.inference).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it.each(["empty", "unavailable", "failed"] as const)("persists truthful %s state and gives inference no invented sources", async status => {
    if (status === "empty") mocks.search.mockResolvedValue([]);
    if (status === "unavailable") vi.stubEnv("JINA_API_KEY", "");
    if (status === "failed") mocks.search.mockRejectedValue(new Error("private provider error"));
    const res = response();
    await handler()(req("Look up Kampala AI Conference", false), res);
    const stored = JSON.parse(mocks.rows.find(m => m.role === "web-search").content);
    expect(stored.status).toBe(status);
    expect(stored.sources).toEqual([]);
    expect(mocks.inference.mock.calls[1][0].messages.find((m: any) => m.role === "tool").content).toContain(`"status":"${status}"`);
    expect(res.write.mock.calls.join("")).not.toContain("private provider error");
    if (status === "unavailable") expect(mocks.search).not.toHaveBeenCalled();
  });
  it("streams actual activities, persists sources and grounds inference", async () => {
    const res = response();
    await handler()(req(), res);
    expect(mocks.search).toHaveBeenCalledTimes(1);
    const events = res.write.mock.calls.map(([line]) => JSON.parse(line.slice(6)));
    expect(events.filter(e => e.type === "web-search").map(e => e.status)).toEqual(["searching", "success"]);
    expect(mocks.rows.find(m => m.role === "web-search").content).toContain("https://conference.ug/register");
    const options = mocks.inference.mock.calls[0][0];
    expect(options.tools[0].function.name).toBe("search_web");
    expect(options.toolChoice).toBe("auto");
    expect(mocks.inference.mock.calls[1][0].messages.find((m: any) => m.role === "tool")).toMatchObject({ tool_call_id: "search-1" });
    expect(options.messages.some((m: any) => m.content.includes("untrusted data"))).toBe(true);
    expect(options.messages.filter((m: any) => m.role === "web-search")).toHaveLength(0);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    await handler()(req("Is it free? Or need to register", false), response());
    expect(mocks.search.mock.calls[1][0]).toContain("Kampala AI Conference");
    expect(mocks.inference.mock.calls[2][0].messages[0].content).toContain("conference.ug/register");
  });
  it("rejects other tenants before search or persistence", async () => {
    mocks.getConversation.mockResolvedValue({ id: 12, userId: "someone-else" });
    const res = response();
    await handler()(req(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.rows).toEqual([]);
  });
  it("does not search preview follow-ups even when a stale client sends webSearch true", async () => {
    mocks.rows = [{ id: 1, role: "assistant", content: "```html\\n<html><body>Easy Mails</body></html>\\n```" }];
    mocks.inference.mockResolvedValue({ text: "Open the in-app Preview control.", model: "test" });
    await handler()(req("can i preview it", true), response());
    expect(mocks.search).not.toHaveBeenCalled();
    const options = mocks.inference.mock.calls[0][0];
    expect(options.messages.some((m: any) => m.content.includes("Easy Mails"))).toBe(true);
    expect(options.messages.some((m: any) => m.content.includes('"Can I preview it?"'))).toBe(true);
    expect(mocks.rows.at(-1).content).toBe("Open the in-app Preview control.");
  });
  it("aborts on disconnect and persists cancellation without final inference", async () => {
    const res = response();
    mocks.search.mockImplementation(async (_query, signal) => {
      res.emit("close");
      expect(signal.aborted).toBe(true);
      throw new Error("cancelled");
    });
    await handler()(req(), res);
    expect(mocks.inference).toHaveBeenCalledTimes(1);
    expect(mocks.rows.find(m => m.role === "web-search").content).toContain('"status":"cancelled"');
  });
});