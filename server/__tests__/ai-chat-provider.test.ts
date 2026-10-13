import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
const clients = vi.hoisted(() => [] as any[]);
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
    constructor(options: any) { clients.push(options); }
  },
}));

import { aiChatComplete, aiChatCompleteStream, hasAfroAiProvider, publicChatError } from "../ai-chat-provider";

const original = {
  HF_TOKEN: process.env.HF_TOKEN,
  AFRO_AI_BASE_URL: process.env.AFRO_AI_BASE_URL,
  AFRO_AI_MODEL: process.env.AFRO_AI_MODEL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GEMINI_API: process.env.GEMINI_API,
  AI_PRIMARY_PROVIDER: process.env.AI_PRIMARY_PROVIDER,
};

describe("default chat streaming cancellation", () => {
  it("does not start an already cancelled inference", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(aiChatCompleteStream({ messages: [], signal: controller.signal, onChunk: vi.fn() })).rejects.toThrow();
  });
  it("forwards cancellation and does not fall back to another paid model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubEnv("GEMINI_API_KEY", "test-only");
    const controller = new AbortController();
    create.mockReset().mockImplementation(async (_body, options) => {
      expect(options.signal).toBe(controller.signal);
      controller.abort();
      throw new Error("cancelled");
    });
    try {
      await expect(aiChatCompleteStream({ messages: [], signal: controller.signal, onChunk: vi.fn() })).rejects.toThrow("cancelled");
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
const messages = [{ role: "user" as const, content: "hello" }];

describe("knowledge AI provider opt-in", () => {
  it("recovers a definitive Gemini Pro 404 with Flash and reports the actual model", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("not found"), {status:404}))
      .mockResolvedValueOnce({choices:[{message:{content:"Recovered"},finish_reason:"stop"}],usage:{prompt_tokens:4,completion_tokens:2}});
    const onModelFallback = vi.fn();
    const result = await aiChatComplete({messages,tier:"business",maxTokens:64,onModelFallback});
    expect(create.mock.calls.map(c=>c[0].model)).toEqual(["gemini-2.5-pro","gemini-2.5-flash"]);
    expect(result).toMatchObject({model:"gemini-2.5-flash",provider:"gemini",text:"Recovered"});
    expect(onModelFallback).toHaveBeenCalledWith("gemini-2.5-pro","gemini-2.5-flash");
  });
  it("does not retry Gemini quota failures with a different Gemini model", async () => {
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY","_DUMMY_");
    vi.stubEnv("OPENAI_API_KEY","_DUMMY_");
    const onModelFallback = vi.fn();
    create.mockRejectedValue(Object.assign(new Error("quota"), {status:429}));
    try {
      await expect(aiChatComplete({messages,tier:"business",onModelFallback})).rejects.toThrow("quota");
      expect(create).toHaveBeenCalledTimes(1);
      expect(onModelFallback).not.toHaveBeenCalled();
    } finally {vi.unstubAllEnvs();}
  });
  it("does not substitute an unknown pinned model or increase a starter model's cost", async () => {
    vi.stubEnv("GEMINI_MODEL","unknown-pinned-model");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY","_DUMMY_");
    vi.stubEnv("OPENAI_API_KEY","_DUMMY_");
    create.mockRejectedValue(Object.assign(new Error("not found"), {status:404}));
    try {
      await expect(aiChatComplete({messages,tier:"starter"})).rejects.toThrow("not found");
      expect(create).toHaveBeenCalledTimes(1);
    } finally {vi.unstubAllEnvs();}
  });
  it("does not retry a rejected model request after cancellation", async () => {
    const controller = new AbortController();
    create.mockImplementationOnce(async () => {
      controller.abort(); throw Object.assign(new Error("not found"), {status:404});
    });
    await expect(aiChatComplete({messages,tier:"business",signal:controller.signal})).rejects.toThrow("not found");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("does not repeat a Flash 404 endlessly", async () => {
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY","_DUMMY_");
    vi.stubEnv("OPENAI_API_KEY","_DUMMY_");
    create.mockRejectedValue(Object.assign(new Error("not found"), {status:404}));
    try {
      await expect(aiChatComplete({messages,tier:"business"})).rejects.toThrow("not found");
      expect(create).toHaveBeenCalledTimes(2);
    } finally {vi.unstubAllEnvs();}
  });
  it("does not restart a partially streamed answer on a model 404", async () => {
    create.mockResolvedValue((async function*() {
      yield {choices:[{delta:{content:"Started"}}]};
      throw Object.assign(new Error("later failure"), {status:404});
    })());
    const onChunk = vi.fn(), onModelFallback = vi.fn();
    await expect(aiChatCompleteStream({messages,tier:"business",onChunk,onModelFallback})).rejects.toThrow("later failure");
    expect(onChunk).toHaveBeenCalledWith("Started");
    expect(create).toHaveBeenCalledTimes(1);
    expect(onModelFallback).not.toHaveBeenCalled();
  });
  it("recovers an initial streaming 404 before emitting chunks", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("not found"), {status:404}))
      .mockResolvedValueOnce((async function*() {yield {choices:[{delta:{content:"Recovered"}}]};})());
    const result = await aiChatCompleteStream({messages,tier:"business",onChunk:vi.fn()});
    expect(result).toMatchObject({model:"gemini-2.5-flash",fullText:"Recovered"});
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("distinguishes exhausted credits from rate limits without exposing raw errors", () => {
    expect(publicChatError({status:429,code:"credit_balance_exhausted"})).toContain("no available API credits");
    expect(publicChatError({status:429})).toContain("rate-limited");
    expect(publicChatError({status:404})).toContain("not a request to add money");
    expect(publicChatError({message:"secret error value"})).not.toContain("secret");
  });
  it("does not let a dummy integration credential hide the direct OpenAI configuration", async () => {
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "_DUMMY_");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://integration.invalid");
    vi.stubEnv("OPENAI_API_KEY", "direct-test-key");
    vi.stubEnv("AI_PRIMARY_PROVIDER", "openai");
    try {
      const result = await aiChatComplete({ messages, maxTokens: 64 });
      expect(result.provider).toBe("openai");
      expect(clients[0]).toMatchObject({ apiKey: "direct-test-key", baseURL: undefined });
    } finally { vi.unstubAllEnvs(); }
  });
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