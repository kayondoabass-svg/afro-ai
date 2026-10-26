// @vitest-environment node
import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), widget: vi.fn(), reply: vi.fn() }));
vi.mock("../db", () => ({ pool: { query: mocks.query } }));
vi.mock("../storage", () => ({ storage: { getChatbotWidgetById: mocks.widget } }));
import {
  normalizeChatbotHostname, chatbotVerificationState, chatbotBrowserOrigin,
  checkChatbotDomain, addChatbotDomain, registerChatbotVerificationRoutes,
  saveChatbotInstallation,
} from "../chatbot-verification";

const domainId = "12345678-1234-4321-8123-123456789abc";
const domain = { id: domainId, widget_id: 7, hostname: "shop.example.com", token: "afro-chatbot-verification=unique-proof", created_at: "2026-10-01T00:00:00Z", verified_at: null, last_checked_at: null };
const widget = { id: 7, userId: "owner", websiteUrl: "https://shop.example.com", isActive: true };
beforeEach(() => { vi.resetAllMocks(); mocks.widget.mockResolvedValue(widget); });

describe("website hostname validation", () => {
  it.each([["https://SHOP.example.com/path", "shop.example.com"], ["www.example.com", "www.example.com"], ["https://bücher.de", "xn--bcher-kva.de"]])("normalizes %s", (value, expected) => {
    expect(normalizeChatbotHostname(value)).toBe(expected);
  });
  it.each(["localhost", "127.0.0.1", "http://2130706433", "https://[::1]", "*.example.com", "ftp://example.com", "https://user:pass@example.com", "https://example.com:8443", "app.internal", "bad_domain.com", "", null])("rejects %s", value => {
    expect(() => normalizeChatbotHostname(value)).toThrow();
  });
});

describe("persisted domain proof", () => {
  it("accepts only the exact token, joining DNS TXT chunks", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [domain] }).mockResolvedValueOnce({ rowCount: 1 });
    const lookup = vi.fn().mockResolvedValue([["unrelated"], ["afro-chatbot-", "verification=unique-proof"]]);
    expect((await checkChatbotDomain(7, domainId, lookup)).verified).toBe(true);
    expect(lookup).toHaveBeenCalledWith("_afro-chatbot.shop.example.com");
    expect(mocks.query.mock.calls[1][1]).toEqual([domainId, 7, true, domain.token]);
  });
  it("does not accept a token from another challenge or as a substring", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [domain] }).mockResolvedValueOnce({ rowCount: 1 });
    expect((await checkChatbotDomain(7, domainId, async () => [[`prefix${domain.token}`], ["afro-chatbot-verification=other"]])).verified).toBe(false);
  });
  it("records authoritative missing DNS as pending", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [domain] }).mockResolvedValueOnce({ rowCount: 1 });
    expect((await checkChatbotDomain(7, domainId, async () => { throw { code: "ENODATA" }; })).verified).toBe(false);
  });
  it("preserves previous proof on transient DNS failure", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ ...domain, verified_at: new Date() }] });
    await expect(checkChatbotDomain(7, domainId, async () => { throw { code: "ETIMEOUT" }; })).rejects.toMatchObject({ status: 503 });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it("rejects removal or challenge changes during DNS lookup", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [domain] }).mockResolvedValueOnce({ rowCount: 0 });
    await expect(checkChatbotDomain(7, domainId, async () => [[domain.token]])).rejects.toMatchObject({ status: 409 });
  });
  it("throttles repeated checks and scopes the record to its chatbot", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: domainId }] });
    await expect(checkChatbotDomain(7, domainId, vi.fn())).rejects.toMatchObject({ status: 429 });
    mocks.query.mockReset().mockResolvedValue({ rows: [] });
    await expect(checkChatbotDomain(8, domainId, vi.fn())).rejects.toMatchObject({ status: 404 });
    expect(mocks.query.mock.calls[0][1]).toEqual([domainId, 8]);
  });
  it("creates a unique public TXT proof without rotating an existing challenge on conflict", async () => {
    mocks.query.mockResolvedValue({ rows: [domain] });
    const result = await addChatbotDomain(7, "SHOP.example.com");
    expect(result.verification.name).toBe("_afro-chatbot.shop.example.com");
    expect(mocks.query.mock.calls[0][1][3]).toMatch(/^afro-chatbot-verification=[a-f0-9]{64}$/);
    expect(mocks.query.mock.calls[0][0]).toContain("SET hostname=EXCLUDED.hostname");
  });
  it("saves both successful and failed installation results", async () => {
    mocks.query.mockResolvedValue({ rowCount: 1 });
    const result = await saveChatbotInstallation(7, widget.websiteUrl, { verified: false, code: "NOT_FOUND", message: "No embed found." });
    expect(result).toMatchObject({ verified: false, url: widget.websiteUrl, code: "NOT_FOUND" });
    expect(result.checkedAt).toMatch(/^\d{4}-/);
    expect(mocks.query.mock.calls[0][1].slice(0, 5)).toEqual([7, false, "NOT_FOUND", "No embed found.", widget.websiteUrl]);
  });
});

describe("separate verification state and browser origins", () => {
  it("keeps legacy installations working without claiming they are verified", async () => {
    mocks.query.mockResolvedValue({ rows: [{ enforcement: "legacy" }] });
    expect(await chatbotBrowserOrigin(7, undefined)).toEqual({ allowed: true, origin: "*" });
  });
  it("allows only the exact verified origin for required setups", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ enforcement: "required" }] }).mockResolvedValueOnce({ rows: [{ id: domainId }] });
    expect(await chatbotBrowserOrigin(7, "https://shop.example.com")).toEqual({ allowed: true, origin: "https://shop.example.com" });
    expect(mocks.query.mock.calls[1][1]).toEqual([7, "shop.example.com"]);
  });
  it.each([undefined, "null", "https://shop.example.com/evil", "https://user:pass@shop.example.com", "https://shop.example.com:8443", "ftp://shop.example.com"])("rejects malformed or absent origins: %s", async origin => {
    mocks.query.mockResolvedValue({ rows: [{ enforcement: "required" }] });
    expect((await chatbotBrowserOrigin(7, origin)).allowed).toBe(false);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it("does not grant www or unrelated subdomains from a root-domain proof", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ enforcement: "required" }] }).mockResolvedValueOnce({ rows: [] });
    expect((await chatbotBrowserOrigin(7, "https://www.shop.example.com")).allowed).toBe(false);
    expect(mocks.query.mock.calls[1][1]).toEqual([7, "www.shop.example.com"]);
  });
  it("does not carry old page installation or reply-test results across website changes", async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("site_settings") ? [{
      enforcement: "required", installation_verified: true, installation_checked_at: new Date(), installation_url: "https://old.example.com",
      test_succeeded: true, test_checked_at: new Date(), test_url: "https://old.example.com",
    }] : [{ ...domain, hostname: "old.example.com", verified_at: new Date() }] }));
    const state = await chatbotVerificationState(widget);
    expect(state.installation).toBeNull();
    expect(state.visitorTest).toBeNull();
    expect(state.statusLabel).toBe("Enabled — ownership pending");
  });
  it("does not silently treat missing policy/schema as legacy", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await expect(chatbotBrowserOrigin(7, "https://shop.example.com")).rejects.toMatchObject({ status: 503 });
  });
});

describe("owner-only verification API", () => {
  let server: Server, base: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerChatbotVerificationRoutes(app, (req: any, res, next) => {
      const owner = req.get("x-test-owner");
      if (!owner) return res.sendStatus(401);
      req.user = { claims: { sub: owner } };
      next();
    }, mocks.reply, (_req, _res, next) => next());
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
  const call = (path: string, method = "GET", body?: object, owner = "owner") => fetch(`${base}/api/chatbots/7${path}`, {
    method, headers: { "content-type": "application/json", ...(owner ? { "x-test-owner": owner } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  it("rejects anonymous and cross-account reads and writes before database operations", async () => {
    expect((await call("/verification", "GET", undefined, "")).status).toBe(401);
    for (const [path, method] of [["/verification", "GET"], ["/domains", "POST"], [`/domains/${domainId}`, "DELETE"], ["/verification/test", "POST"]]) {
      expect((await call(path, method, undefined, "intruder")).status).toBe(404);
    }
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.reply).not.toHaveBeenCalled();
  });
  it("requires explicit allowance consent before any AI test", async () => {
    expect((await call("/verification/test", "POST", { message: "hello" })).status).toBe(400);
    expect(mocks.reply).not.toHaveBeenCalled();
  });
  it("does not enable protection or run a test for an unverified current website", async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("site_settings") ? [{ enforcement: "legacy" }] : [] }));
    expect((await call("/verification/enforce", "POST", {})).status).toBe(409);
    expect((await call("/verification/test", "POST", { consent: true, message: "hello" })).status).toBe(409);
    expect(mocks.reply).not.toHaveBeenCalled();
  });
  it("runs exactly one explicit test through the existing reply callback", async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("SELECT * FROM chatbot_site_settings") ? [{ enforcement: "legacy" }] : sql.includes("SELECT * FROM chatbot_verified_domains") ? [{ ...domain, verified_at: new Date() }] : [], rowCount: 1 }));
    mocks.reply.mockImplementation(async (_widget, _message, _req, res) => res.json({ reply: "A real visitor-pipeline reply", testHistorySaved: true }));
    const response = await call("/verification/test", "POST", { consent: true, message: "hello" });
    expect(response.status).toBe(200);
    expect(mocks.reply).toHaveBeenCalledTimes(1);
    expect(mocks.reply.mock.calls[0].slice(0, 2)).toEqual([widget, "hello"]);
    expect(mocks.query.mock.calls.some(([sql, args]) => sql.includes("test_succeeded") && args[1] === false)).toBe(true);
  });
  it("returns a safe error without retrying failed database mutations", async () => {
    mocks.query.mockRejectedValue(new Error("private SQL credentials"));
    const response = await call("/domains", "POST", { hostname: "shop.example.com" });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("credentials");
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
