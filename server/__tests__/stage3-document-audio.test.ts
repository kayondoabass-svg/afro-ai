import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), parse: vi.fn(), ingest: vi.fn(), member: vi.fn(),
  stt: vi.fn(), tts: vi.fn(), convert: vi.fn(), ai: vi.fn(), usage: vi.fn(),
  reserve: vi.fn(), conversation: vi.fn(), messages: vi.fn(), createMessage: vi.fn(), stream: vi.fn(),
}));
vi.mock("../audio-reservation", () => ({
  reserveAudioUsage: mocks.reserve,
  AudioReservationError: class AudioReservationError extends Error {},
}));
vi.mock("../storage", () => ({ storage: { createKnowledgeDocument: mocks.create, getTeamMemberByUserId: mocks.member } }));
vi.mock("../attachment-parse", () => ({ parseAttachment: mocks.parse }));
vi.mock("../knowledge", () => ({ ingestDocument: mocks.ingest }));
vi.mock("../embeddings", () => ({ hasEmbeddingProvider: () => true }));
vi.mock("../replit_integrations/auth/replitAuth", () => ({ isAuthenticated: vi.fn() }));
vi.mock("../replit_integrations/auth/storage", () => ({ FOUNDER_EMAILS: ["founder@example.test"] }));
vi.mock("../replit_integrations/quota", () => ({ aiBurstLimiters: { chat: vi.fn(), audio: vi.fn() }, aiQuotaGuard: () => vi.fn(), recordAiUsage: mocks.usage }));
vi.mock("../replit_integrations/chat/storage", () => ({ chatStorage: { getConversation: mocks.conversation, getMessagesByConversation: mocks.messages, createMessage: mocks.createMessage } }));
vi.mock("../ai-chat-provider", () => ({ aiChatComplete: mocks.ai, hasAfroAiProvider: () => true }));
vi.mock("../replit_integrations/audio/client", () => ({
  openai: { chat: { completions: { create: mocks.stream } } }, speechToText: mocks.stt, textToSpeech: mocks.tts,
  convertToWav: mocks.convert, detectAudioFormat: () => "wav", ensureCompatibleFormat: vi.fn(),
}));
import { registerKnowledgeUploadRoutes, validateDocumentUpload } from "../knowledge-upload-routes";
import { registerAudioRoutes } from "../replit_integrations/audio/routes";

function handler(register: (app: any) => void, route: string) {
  const app = { post: vi.fn(), get: vi.fn(), delete: vi.fn() };
  register(app);
  return app.post.mock.calls.find((args) => args[0] === route || (Array.isArray(args[0]) && args[0].includes(route)))!.at(-1);
}
function response() {
  const res: any = { status: vi.fn(), json: vi.fn(), on: vi.fn(), off: vi.fn(), destroyed: false, writableEnded: false };
  res.status.mockReturnValue(res); res.json.mockReturnValue(res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.parse.mockResolvedValue({ ok: true, text: "Extracted document" });
  mocks.create.mockImplementation(async (doc) => ({ ...doc, id: 123 }));
  mocks.ingest.mockResolvedValue(undefined);
  mocks.member.mockResolvedValue(null);
  mocks.convert.mockResolvedValue(Buffer.from("normalized"));
  mocks.stt.mockResolvedValue("Hello");
  mocks.ai.mockResolvedValue({ text: "Welcome", model: "afro-test-model" });
  mocks.tts.mockResolvedValue(Buffer.from("mp3"));
  mocks.reserve.mockResolvedValue(undefined);
});
describe("bounded knowledge upload", () => {
  it("rejects malformed base64, oversized and unsupported files", () => {
    for (const body of [{ name: "x.exe", data: "YQ==" }, { name: "x.pdf", data: "!!!" }, { name: "x.txt", data: "A".repeat(7_000_000) }]) {
      expect(validateDocumentUpload(body)).toBeNull();
    }
  });
  it("uses authenticated ownership and parsed text, never a supplied URL or user ID", async () => {
    const res = response();
    await handler(registerKnowledgeUploadRoutes, "/api/knowledge/upload")({
      user: { claims: { sub: "owner" } },
      body: { name: "notes.pdf", data: "YQ==", userId: "victim", url: "http://private" },
    }, res);
    expect(mocks.parse.mock.calls[0][0].url).toBeUndefined();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner", sourceType: "file", content: "Extracted document" }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it("does not leak parser errors or create empty documents", async () => {
    mocks.parse.mockResolvedValue({ ok: false, error: "secret stack trace" });
    const res = response();
    await handler(registerKnowledgeUploadRoutes, "/api/knowledge/upload")({ user: { claims: { sub: "owner" } }, body: { name: "x.pdf", data: "YQ==" } }, res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("secret");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
describe("Afro audio pipeline", () => {
  const request = (email = "ordinary@example.test") => ({
    user: { claims: { sub: "owner", email } }, aiContext: { userId: "owner", cost: 2, plan: {} },
    body: { provider: "afro-test", audio: "YQ==", afroAuthorized: true, idempotencyKey: "unique-request-key-123" },
  });
  it("denies ordinary users before STT even with forged authorization", async () => {
    const res = response();
    await handler(registerAudioRoutes, "/api/audio/respond")(request(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.stt).not.toHaveBeenCalled();
  });
  it("reserves before founder STT → explicit Afro chat → existing alloy TTS", async () => {
    const res = response();
    await handler(registerAudioRoutes, "/api/audio/respond")(request("founder@example.test"), res);
    expect(mocks.ai).toHaveBeenCalledWith(expect.objectContaining({ provider: "afro-test", afroAuthorized: true, messages: [
      expect.objectContaining({ role: "system", content: expect.stringContaining("Voice Lab") }),
      { role: "user", content: "Hello" },
    ] }));
    expect(mocks.tts).toHaveBeenCalledWith("Welcome", "alloy", "mp3", expect.any(AbortSignal));
    expect(mocks.reserve).toHaveBeenCalledWith("owner", "unique-request-key-123", "afro-test", Buffer.from("a"));
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.stt.mock.invocationCallOrder[0]);
    expect(mocks.usage).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ transcript: "Hello", reply: "Welcome", mimeType: "audio/mpeg" }));
  });
  it("supplies trusted product context to the standalone default text reply without changing its provider", async () => {
    const res = response();
    mocks.stream.mockResolvedValue({ choices: [{ message: { content: "Hello back" } }] });
    await handler(registerAudioRoutes, "/api/audio/respond")({
      ...request(),
      body: { ...request().body, provider: "default" },
    }, res);
    expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-audio",
      messages: [
        expect.objectContaining({ role: "system", content: expect.stringContaining("no document retrieval") }),
        { role: "user", content: "Hello" },
      ],
    }), expect.any(Object));
    expect(mocks.ai).not.toHaveBeenCalled();
  });
  it("allows active full admins and sanitizes upstream failures", async () => {
    mocks.member.mockResolvedValue({ status: "active", tier: "full_admin" });
    mocks.ai.mockRejectedValue(new Error("secret provider URL and token"));
    const res = response();
    await handler(registerAudioRoutes, "/api/audio/respond")(request(), res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("secret");
    expect(mocks.tts).not.toHaveBeenCalled();
  });
  it("fails closed before providers if reservation fails", async () => {
    mocks.reserve.mockRejectedValue(new Error("database offline"));
    await handler(registerAudioRoutes, "/api/audio/respond")(request("founder@example.test"), response());
    expect(mocks.stt).not.toHaveBeenCalled();
    expect(mocks.ai).not.toHaveBeenCalled();
  });
});

describe("legacy conversation audio limits and cancellation", () => {
  const request = (audio = "YQ==") => ({ params: { id: "1" }, user: { claims: { sub: "owner" } }, body: { audio, idempotencyKey: "legacy-request-key-123" } });
  it("rejects malformed and oversized payloads before conversion or STT", async () => {
    for (const audio of ["YQ=", "YR==", "A".repeat(7_000_000), ""]) {
      const res = response();
      await handler(registerAudioRoutes, "/api/conversations/:id/messages")(request(audio), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mocks.convert).not.toHaveBeenCalled();
  });
  it("propagates disconnect abort during STT and never starts streaming or writes", async () => {
    mocks.conversation.mockResolvedValue({ userId: "owner" });
    const res = response();
    res.write = vi.fn();
    mocks.stt.mockImplementation(async (_audio, _format, signal) => {
      res.destroyed = true;
      res.on.mock.calls.find(([name]: any[]) => name === "close")[1]();
      expect(signal.aborted).toBe(true);
      return "Hello";
    });
    await handler(registerAudioRoutes, "/api/conversations/:id/messages")(request(), res);
    expect(mocks.convert).toHaveBeenCalledWith(Buffer.from("a"), expect.any(AbortSignal), 120);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.stt.mock.invocationCallOrder[0]);
  });
  it("passes abort signal to streaming provider and stops dead SSE writes", async () => {
    mocks.conversation.mockResolvedValue({ userId: "owner" });
    mocks.messages.mockResolvedValue([{ role: "user", content: "Hello" }]);
    const res = response();
    res.write = vi.fn(); res.setHeader = vi.fn(); res.end = vi.fn();
    mocks.stream.mockImplementation(async (_input, { signal }) => (async function* () {
      expect(signal.aborted).toBe(false);
      res.destroyed = true;
      res.on.mock.calls.find(([name]: any[]) => name === "close")[1]();
      yield { choices: [{ delta: { audio: { transcript: "late" } } }] };
    })());
    await handler(registerAudioRoutes, "/api/conversations/:id/messages")(request(), res);
    expect(res.write).toHaveBeenCalledTimes(1); // only initial user transcript
    expect(res.write.mock.calls[0][0]).not.toContain("late");
  });
  it("fails closed before STT on reservation failure", async () => {
    mocks.conversation.mockResolvedValue({ userId: "owner" });
    mocks.reserve.mockRejectedValue(new Error("database offline"));
    const res = response();
    await handler(registerAudioRoutes, "/api/voice-conversations/:id/messages")(request(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mocks.stt).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it("reserves owned conversation and voice once before provider, with no post-success debit", async () => {
    mocks.conversation.mockResolvedValue({ userId: "owner" });
    mocks.messages.mockResolvedValue([{ role: "user", content: "Hello" }]);
    mocks.stream.mockResolvedValue((async function* () {
      yield { choices: [{ delta: { audio: { transcript: "Welcome", data: "YQ==" } } }] };
    })());
    const res = response();
    res.write = vi.fn(); res.setHeader = vi.fn(); res.end = vi.fn();
    await handler(registerAudioRoutes, "/api/voice-conversations/:id/messages")(request(), res);
    expect(mocks.stream.mock.calls[0][0].messages[0]).toEqual(expect.objectContaining({
      role: "system", content: expect.stringContaining("legacy founder console /d1"),
    }));
    expect(mocks.reserve).toHaveBeenCalledExactlyOnceWith("owner", "legacy-request-key-123", "conversation:1:voice:alloy", Buffer.from("a"), 1);
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.stt.mock.invocationCallOrder[0]);
    expect(mocks.usage).not.toHaveBeenCalled();
    expect(res.write.mock.calls.at(-1)?.[0]).toContain('"type":"done"');
    expect(mocks.createMessage).toHaveBeenCalledWith(1, "assistant", "Welcome");
  });
  it("does not reserve another user's conversation", async () => {
    mocks.conversation.mockResolvedValue({ userId: "other" });
    const res = response();
    await handler(registerAudioRoutes, "/api/voice-conversations/:id/messages")(request(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.stt).not.toHaveBeenCalled();
  });
});