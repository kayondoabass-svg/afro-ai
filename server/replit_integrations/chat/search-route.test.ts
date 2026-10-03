import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const mocks = vi.hoisted(() => ({
  rows: [] as any[],
  getConversation: vi.fn(),
  search: vi.fn(),
  inference: vi.fn(),
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
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../auth/replitAuth", () => ({ isAuthenticated: vi.fn(), FOUNDER_EMAIL: "founder@example.org" }));
vi.mock("../quota", () => ({ aiQuotaGuard: () => vi.fn() }));
vi.mock("../../ai-chat-provider", () => ({ aiChatComplete: mocks.inference, aiChatCompleteStream: vi.fn() }));
vi.mock("../../web-search", () => ({ searchWeb: mocks.search, webSearchConfigured: () => Boolean(process.env.JINA_API_KEY) }));
vi.mock("../../url-scrape", () => ({ extractUrls: () => [], buildLiveWebContext: vi.fn() }));
vi.mock("../../attachment-parse", () => ({ isParseableAttachment: () => false, buildAttachmentContext: vi.fn() }));
vi.mock("../../project-files", () => ({ listProjectFiles: vi.fn(), saveProjectFiles: vi.fn() }));
vi.mock("../../product-self-knowledge", () => ({ productSelfKnowledge: () => "Current capabilities" }));
vi.mock("../../knowledge", () => ({ retrieveKnowledge: async () => [], formatKnowledgeContext: () => "" }));
import { registerChatRoutes } from "./routes";

function handler() {
  let route: any;
  const app = {
    get: vi.fn(), delete: vi.fn(),
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
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
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
  it("lets the model clarify an unclear image instead of forcing search from an old UI flag", async () => {
    mocks.inference.mockResolvedValue({ text: "Please name the event in the image.", model: "test" });
    const request: any = req("Search this image", true);
    request.body.attachments = [{ mimetype: "image/png", dataUrl: "data:image/png;base64,eA==" }];
    await handler()(request, response());
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.rows.some(m => m.role === "web-search")).toBe(false);
    expect(mocks.inference.mock.calls[0][0].messages.at(-1).content).toContain("image's subject is unclear");
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
    expect(options.messages.at(-1).content).toContain("untrusted data");
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
    expect(options.messages.at(-1).content).toContain('"Can I preview it?"');
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