// @vitest-environment node
import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  query: vi.fn(), info: vi.fn(), configured: vi.fn(() => true),
  widget: vi.fn(), update: vi.fn(),
}));
vi.mock("../d1", () => ({ d1Query: fake.query, d1GetDatabaseInfo: fake.info, isD1Configured: fake.configured }));
vi.mock("../storage", () => ({ storage: { getChatbotWidgetById: fake.widget, updateChatbotWidget: fake.update } }));
import { registerChatbotKnowledgeRoutes, validateKnowledgeFile } from "../chatbot-knowledge-files";

let server: Server;
let base: string;
beforeAll(async () => {
  vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "test-database");
  vi.stubEnv("PROJECT_FILES_D1_DATABASE_NAME", "private-project-files");
  const app = express();
  app.use(express.json());
  registerChatbotKnowledgeRoutes(app, (req: any, res, next) => {
    const user = req.get("x-test-owner");
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    req.user = { claims: { sub: user } };
    next();
  });
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  base = `http://127.0.0.1:${address.port}/api/chatbots/5/knowledge-files`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  vi.unstubAllEnvs();
});
beforeEach(() => {
  fake.query.mockReset().mockResolvedValue({ results: [] });
  fake.info.mockResolvedValue({ uuid: "test-database", name: "private-project-files" });
  fake.widget.mockResolvedValue({ id: 5, userId: "owner-a" });
  fake.update.mockReset().mockResolvedValue({});
});
const request = (path = "", method = "GET", owner?: string, body?: unknown) => fetch(`${base}${path}`, {
  method, headers: { ...(owner ? { "x-test-owner": owner } : {}), "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

describe("private knowledge files", () => {
  it.each(["GET", "PUT", "DELETE"])("blocks unauthenticated %s before storage access", async method => {
    expect((await request("/knowledge.md", method, undefined, method === "PUT" ? { content: "facts", version: null } : undefined)).status).toBe(401);
    expect(fake.query).not.toHaveBeenCalled();
  });
  it.each([
    ["", "GET"], ["/knowledge.md", "GET"], ["/knowledge.md?download=1", "GET"],
    ["/knowledge.md", "PUT"], ["/scan-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md?version=1", "DELETE"],
  ])("blocks another owner for %s %s", async (path, method) => {
    expect((await request(path, method, "owner-b", method === "PUT" ? { content: "attack", version: 1 } : undefined)).status).toBe(404);
    expect(fake.query).not.toHaveBeenCalled();
    expect(fake.update).not.toHaveBeenCalled();
  });
  it("lists only owner/widget-scoped metadata and sets private no-store headers", async () => {
    fake.query.mockResolvedValue({ results: [{ path: "knowledge.md", version: 3, bytes: 20 }] });
    const res = await request("", "GET", "owner-a");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await res.json()).backend).toBe("D1");
    expect(fake.query).toHaveBeenCalledWith(expect.stringContaining("WHERE user_id = ? AND widget_id = ?"), ["owner-a", 5]);
    expect(fake.query.mock.calls[0][0]).not.toMatch(/\*/);
  });
  it("requires the expected file revision and saves privately without publishing by default", async () => {
    fake.query.mockResolvedValue({ results: [{ path: "knowledge.md", content: "new facts", version: 4 }] });
    const res = await request("/knowledge.md", "PUT", "owner-a", { content: "new facts", version: 3 });
    expect(res.status).toBe(200);
    expect(fake.query).toHaveBeenCalledWith(expect.stringContaining("AND version = ?"), ["new facts", "owner-a", 5, "knowledge.md", 3]);
    expect(fake.update).not.toHaveBeenCalled();
  });
  it("publishes only after the private file is saved", async () => {
    fake.query.mockResolvedValue({ results: [{ path: "knowledge.md", content: "approved", version: 1 }] });
    const res = await request("/knowledge.md", "PUT", "owner-a", { content: "approved", version: null, publish: true });
    expect(res.status).toBe(200);
    expect(fake.update).toHaveBeenCalledWith(5, { knowledgeBase: "approved" });
    expect(fake.query.mock.invocationCallOrder[0]).toBeLessThan(fake.update.mock.invocationCallOrder[0]);
  });
  it("rejects stale writes instead of overwriting", async () => {
    const res = await request("/knowledge.md", "PUT", "owner-a", { content: "old draft", version: 1, publish: true });
    expect(res.status).toBe(409);
    expect(fake.update).not.toHaveBeenCalled();
  });
  it("reports partial cross-store publication honestly", async () => {
    fake.query.mockResolvedValue({ results: [{ path: "knowledge.md", version: 2 }] });
    fake.update.mockRejectedValue(new Error("DB offline"));
    const res = await request("/knowledge.md", "PUT", "owner-a", { content: "approved", version: 1, publish: true });
    expect(res.status).toBe(502);
    expect((await res.json()).saved).toBe(true);
  });
  it("downloads through the authenticated endpoint, not a public bucket URL", async () => {
    fake.query.mockResolvedValue({ results: [{ path: "knowledge.md", content: "owner notes", version: 1 }] });
    const res = await request("/knowledge.md?download=1", "GET", "owner-a");
    expect(res.headers.get("content-disposition")).toContain('filename="knowledge.md"');
    expect(await res.text()).toBe("owner notes");
  });
  it("fails explicitly when private D1 is unavailable, never leaking provider details", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.query.mockRejectedValue(new Error("SQL secret contents"));
    const res = await request("", "GET", "owner-a");
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("SQL secret contents");
    logger.mockRestore();
  });
  it("rejects invalid filenames, path traversal and oversized content", () => {
    for (const path of ["../knowledge.md", "a/b.md", "knowledge.md/evil", ".env", "secret.json"]) {
      expect(() => validateKnowledgeFile(path, "facts")).toThrow();
    }
    expect(() => validateKnowledgeFile("knowledge.md", "x".repeat(65537))).toThrow();
    expect(() => validateKnowledgeFile("knowledge.md", 123)).toThrow();
  });
});
