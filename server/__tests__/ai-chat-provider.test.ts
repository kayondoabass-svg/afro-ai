import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
const clients = vi.hoisted(() => [] as any[]);
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
    constructor(options: any) { clients.push(options); }
  },
}));

import { aiChatComplete, hasAfroAiProvider } from "../ai-chat-provider";

const original = {
  HF_TOKEN: process.env.HF_TOKEN,
  AFRO_AI_BASE_URL: process.env.AFRO_AI_BASE_URL,
  AFRO_AI_MODEL: process.env.AFRO_AI_MODEL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GEMINI_API: process.env.GEMINI_API,
  AI_PRIMARY_PROVIDER: process.env.AI_PRIMARY_PROVIDER,
};
const messages = [{ role: "user" as const, content: "hello" }];

describe("knowledge AI provider opt-in", () => {
  beforeEach(() => {
    clients.length = 0;
    create.mockReset().mockResolvedValue({
      choices: [{ message: { content: "reply" }, finish_reason: "stop" }],
    });
    process.env.HF_TOKEN = "private-test-token";
    process.env.AFRO_AI_BASE_URL = "https://example.test/v1";
    process.env.AFRO_AI_MODEL = "test-model";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.AI_PRIMARY_PROVIDER = "gemini";
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("leaves the default provider order unchanged even when Afro is configured", async () => {
    const result = await aiChatComplete({ messages });
    expect(result.provider).toBe("gemini");
    expect(clients[0].baseURL).toContain("generativelanguage.googleapis.com");
    expect(clients[0].apiKey).toBe("test-gemini-key");
  });

  it("rejects unauthorized Afro selection before constructing a client", async () => {
    await expect(aiChatComplete({ messages, provider: "afro-test" })).rejects.toMatchObject({ status: 403 });
    expect(clients).toHaveLength(0);
  });

  it("uses the configured Afro endpoint only with server authorization and forwards abort", async () => {
    const controller = new AbortController();
    const result = await aiChatComplete({
      messages, provider: "afro-test", afroAuthorized: true, signal: controller.signal,
      tools: [{ type: "function", function: { name: "calculate" } }],
    });
    expect(result).toMatchObject({ text: "reply", provider: "afro-test", model: "test-model" });
    expect(clients[0]).toMatchObject({ apiKey: "private-test-token", baseURL: "https://example.test/v1", maxRetries: 0 });
    expect(create.mock.calls[0][0]).toMatchObject({ model: "test-model", tool_choice: "auto" });
    expect(create.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });

  it("reports missing configuration instead of falling back", async () => {
    delete process.env.HF_TOKEN;
    expect(hasAfroAiProvider()).toBe(false);
    await expect(aiChatComplete({ messages, provider: "afro-test", afroAuthorized: true }))
      .rejects.toMatchObject({ status: 503 });
    expect(clients).toHaveLength(0);
  });

  it("surfaces Afro upstream errors without trying default providers", async () => {
    create.mockRejectedValueOnce(new Error("upstream unavailable"));
    await expect(aiChatComplete({ messages, provider: "afro-test", afroAuthorized: true }))
      .rejects.toThrow("upstream unavailable");
    expect(clients).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity])("rejects invalid maxTokens %s before any provider call", async (maxTokens) => {
    await expect(aiChatComplete({ messages, provider: "afro-test", afroAuthorized: true, maxTokens }))
      .rejects.toMatchObject({ status: 400 });
    expect(clients).toHaveLength(0);
  });

  it("caps valid maxTokens by tier", async () => {
    await aiChatComplete({ messages, provider: "afro-test", afroAuthorized: true, maxTokens: 100_000, tier: "starter" });
    expect(create.mock.calls[0][0].max_tokens).toBe(8000);
  });
});