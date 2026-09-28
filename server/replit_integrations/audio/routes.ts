import express, { type Express, type Request, type Response } from "express";
import { chatStorage } from "../chat/storage";
import { openai, speechToText, textToSpeech, convertToWav, detectAudioFormat } from "./client";
import { isAuthenticated } from "../auth/replitAuth";
import { aiBurstLimiters } from "../quota";
import { FOUNDER_EMAILS } from "../auth/storage";
import { storage } from "../../storage";
import { aiChatComplete, hasAfroAiProvider } from "../../ai-chat-provider";
import { AudioReservationError, reserveAudioUsage } from "../../audio-reservation";

// Body parser with 50MB limit for audio payloads
const audioBodyParser = express.json({ limit: "7mb" });

export function decodeAudioInput(audio: unknown): Buffer | null {
  if (typeof audio !== "string" || !audio.length || audio.length > 6_990_508 ||
      audio.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) return null;
  const raw = Buffer.from(audio, "base64");
  if (!raw.length || raw.length > 5 * 1024 * 1024 || raw.toString("base64") !== audio || detectAudioFormat(raw) === "unknown") return null;
  return raw;
}

export function registerAudioRoutes(app: Express): void {
  // Standalone, opt-in audio demo. Existing conversation voice behavior stays unchanged.
  app.post("/api/audio/respond", isAuthenticated, aiBurstLimiters.audio, async (req: any, res) => {
    const userId = req.user?.claims?.sub || req.user?.claims?.id || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Please sign in." });
    const { audio, provider = "default", idempotencyKey } = req.body || {};
    const raw = decodeAudioInput(audio);
    if (!["default", "afro-test"].includes(provider) || !raw ||
        typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) {
      return res.status(400).json({ message: "Provide a supported audio file up to 5 MB and a valid provider." });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", onClose);
    try {
      let authorized = false;
      if (provider === "afro-test") {
        const email = req.user?.claims?.email;
        const member = email && FOUNDER_EMAILS.includes(email) ? null : await storage.getTeamMemberByUserId(userId);
        authorized = Boolean(email && FOUNDER_EMAILS.includes(email)) || (member?.status === "active" && member.tier === "full_admin");
        if (!authorized) return res.status(403).json({ message: "Afro test is restricted to administrators." });
        if (!hasAfroAiProvider()) return res.status(503).json({ message: "Afro test is unavailable." });
      }
      // Normalize all inputs to a bounded two-minute mono stream.
      const normalized = await convertToWav(raw, controller.signal, 120);
      controller.signal.throwIfAborted();
      await reserveAudioUsage(userId, idempotencyKey, provider, raw);
      controller.signal.throwIfAborted();
      const transcript = await speechToText(normalized, "wav", controller.signal);
      controller.signal.throwIfAborted();
      if (!transcript.trim() || transcript.length > 12_000) return res.status(422).json({ message: "No usable speech found, or transcript too long." });
      let reply: string;
      if (provider === "afro-test") {
        const result = await aiChatComplete({
          provider: "afro-test", afroAuthorized: authorized, signal: controller.signal, maxTokens: 600,
          messages: [{ role: "user", content: transcript }],
        });
        reply = result.text;
      } else {
        const result = await openai.chat.completions.create({
          model: "gpt-audio", messages: [{ role: "user", content: transcript }], max_completion_tokens: 600,
        }, { signal: controller.signal });
        reply = result.choices[0]?.message?.content || "";
      }
      if (!reply.trim() || reply.length > 8_000) throw new Error("Invalid response");
      controller.signal.throwIfAborted();
      const output = await textToSpeech(reply, "alloy", "mp3", controller.signal);
      if (!output.length) throw new Error("Empty audio");
      if (!controller.signal.aborted && !res.destroyed) res.json({ transcript, reply, audio: output.toString("base64"), mimeType: "audio/mpeg" });
    } catch (error) {
      if (error instanceof AudioReservationError && !res.destroyed) {
        return res.status(error.status).json({ message: error.message, error: error.message, code: error.code });
      }
      if (!res.destroyed) res.status(controller.signal.aborted ? 504 : 502).json({ message: controller.signal.aborted ? "Audio request cancelled or timed out." : "Unable to process audio. Please try again." });
    } finally {
      clearTimeout(timer);
      res.off("close", onClose);
    }
  });
  // Get all conversations
  app.get("/api/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id;
      const conversations = await chatStorage.getConversationsByUser(userId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation with messages
  app.get("/api/conversations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id;
      const id = parseInt(String(req.params.id));
      const conversation = await chatStorage.getConversation(id);
      if (!conversation || conversation.userId !== userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new conversation
  app.post("/api/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id;
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat", undefined, userId);
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete conversation
  app.delete("/api/conversations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id;
      const id = parseInt(String(req.params.id));
      const conversation = await chatStorage.getConversation(id);
      if (!conversation || conversation.userId !== userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send voice message and get streaming audio response
  // Auto-detects audio format and converts WebM/MP4/OGG to WAV
  // Uses gpt-4o-mini-transcribe for STT, gpt-audio for voice response
  app.post(
    ["/api/conversations/:id/messages", "/api/voice-conversations/:id/messages"],
    isAuthenticated,
    aiBurstLimiters.audio,
    audioBodyParser,
    async (req: Request, res: Response) => {
    const userId = (req.user as any)?.claims?.sub || (req.user as any)?.claims?.id || (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: "Please sign in." });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", onClose);
    const send = (event: unknown) => {
      controller.signal.throwIfAborted();
      if (res.destroyed || res.writableEnded) throw new Error("Connection closed");
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    try {
      const conversationId = parseInt(String(req.params.id));
      const { audio, voice = "alloy", idempotencyKey } = req.body || {};
      const rawBuffer = decodeAudioInput(audio);

      if (!Number.isSafeInteger(conversationId) || conversationId <= 0 ||
          !rawBuffer || !["alloy", "echo", "fable", "onyx", "nova", "shimmer"].includes(voice)) {
        return res.status(400).json({ error: "Provide valid base64 WAV, MP3, WebM, MP4 or OGG audio up to 5 MB and a supported voice." });
      }
      if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) {
        return res.status(400).json({ error: "Provide a valid audio request key." });
      }

      // Ownership check: the conversation must belong to the caller.
      const ownedConvo = await chatStorage.getConversation(conversationId);
      if (!ownedConvo || ownedConvo.userId !== userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // 1. Auto-detect format and convert to OpenAI-compatible format
      const audioBuffer = await convertToWav(rawBuffer, controller.signal, 120);
      controller.signal.throwIfAborted();
      await reserveAudioUsage(userId, idempotencyKey, `conversation:${conversationId}:voice:${voice}`, rawBuffer, conversationId);
      controller.signal.throwIfAborted();

      // 2. Transcribe user audio
      const userTranscript = await speechToText(audioBuffer, "wav", controller.signal);
      controller.signal.throwIfAborted();
      if (!userTranscript.trim() || userTranscript.length > 12_000) return res.status(422).json({ error: "No usable speech found, or transcript too long." });

      // 3. Save user message
      await chatStorage.createMessage(conversationId, "user", userTranscript);

      // 4. Get conversation history
      const existingMessages = await chatStorage.getMessagesByConversation(conversationId);
      const chatHistory = existingMessages.slice(-30).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content.slice(0, 12_000),
      }));

      // 5. Set up SSE
      controller.signal.throwIfAborted();
      if (res.destroyed || res.writableEnded) return;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      send({ type: "user_transcript", data: userTranscript });

      // 6. Stream audio response from gpt-audio
      const stream = await openai.chat.completions.create({
        model: "gpt-audio",
        modalities: ["text", "audio"],
        audio: { voice, format: "pcm16" },
        messages: chatHistory,
        stream: true,
        max_completion_tokens: 1200,
      }, { signal: controller.signal });

      let assistantTranscript = "";

      for await (const chunk of stream) {
        controller.signal.throwIfAborted();
        const delta = chunk.choices?.[0]?.delta as any;
        if (!delta) continue;

        if (delta?.audio?.transcript) {
          assistantTranscript += delta.audio.transcript;
          send({ type: "transcript", data: delta.audio.transcript });
        }

        if (delta?.audio?.data) {
          send({ type: "audio", data: delta.audio.data });
        }
      }

      // 7. Save assistant message
      controller.signal.throwIfAborted();
      await chatStorage.createMessage(conversationId, "assistant", assistantTranscript);

      // Already accounted atomically before STT; never debit a second time.
      send({ type: "done", transcript: assistantTranscript });
      res.end();
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      if (error instanceof AudioReservationError && !res.headersSent) {
        return res.status(error.status).json({ message: error.message, error: error.message, code: error.code });
      }
      if (res.headersSent) {
        if (!controller.signal.aborted) send({ type: "error", error: "Failed to process voice message" });
        res.end();
      } else {
        res.status(controller.signal.aborted ? 504 : 500).json({ error: "Failed to process voice message" });
      }
    } finally {
      clearTimeout(timer);
      res.off("close", onClose);
    }
  });
}
