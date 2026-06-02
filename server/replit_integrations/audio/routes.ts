import express, { type Express, type Request, type Response } from "express";
import { chatStorage } from "../chat/storage";
import { openai, speechToText, ensureCompatibleFormat } from "./client";
import { isAuthenticated } from "../auth/replitAuth";
import { aiBurstLimiters, aiQuotaGuard, recordAiUsage } from "../quota";

// Body parser with 50MB limit for audio payloads
const audioBodyParser = express.json({ limit: "50mb" });

export function registerAudioRoutes(app: Express): void {
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
      const id = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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
    "/api/conversations/:id/messages",
    isAuthenticated,
    aiBurstLimiters.audio,
    aiQuotaGuard("audio"),
    audioBodyParser,
    async (req: Request, res: Response) => {
    const ctx = (req as any).aiContext as { userId: string; plan: any; cost: number; kind: "audio" };
    try {
      const conversationId = parseInt(req.params.id);
      const { audio, voice = "alloy" } = req.body;

      if (!audio) {
        return res.status(400).json({ error: "Audio data (base64) is required" });
      }

      // Ownership check: the conversation must belong to the caller.
      const ownedConvo = await chatStorage.getConversation(conversationId);
      if (!ownedConvo || ownedConvo.userId !== ctx.userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // 1. Auto-detect format and convert to OpenAI-compatible format
      const rawBuffer = Buffer.from(audio, "base64");
      const { buffer: audioBuffer, format: inputFormat } = await ensureCompatibleFormat(rawBuffer);

      // 2. Transcribe user audio
      const userTranscript = await speechToText(audioBuffer, inputFormat);

      // 3. Save user message
      await chatStorage.createMessage(conversationId, "user", userTranscript);

      // 4. Get conversation history
      const existingMessages = await chatStorage.getMessagesByConversation(conversationId);
      const chatHistory = existingMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // 5. Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      res.write(`data: ${JSON.stringify({ type: "user_transcript", data: userTranscript })}\n\n`);

      // 6. Stream audio response from gpt-audio
      const stream = await openai.chat.completions.create({
        model: "gpt-audio",
        modalities: ["text", "audio"],
        audio: { voice, format: "pcm16" },
        messages: chatHistory,
        stream: true,
      });

      let assistantTranscript = "";

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta as any;
        if (!delta) continue;

        if (delta?.audio?.transcript) {
          assistantTranscript += delta.audio.transcript;
          res.write(`data: ${JSON.stringify({ type: "transcript", data: delta.audio.transcript })}\n\n`);
        }

        if (delta?.audio?.data) {
          res.write(`data: ${JSON.stringify({ type: "audio", data: delta.audio.data })}\n\n`);
        }
      }

      // 7. Save assistant message
      await chatStorage.createMessage(conversationId, "assistant", assistantTranscript);

      // 8. Record AI usage so daily quota + PAYG balance both stay accurate.
      await recordAiUsage({
        userId: ctx.userId,
        kind: "audio",
        model: "gpt-audio",
        tokensUsed: Math.ceil((userTranscript.length + assistantTranscript.length) / 4),
        conversationId,
        costCents: ctx.cost,
        plan: ctx.plan,
      });

      res.write(`data: ${JSON.stringify({ type: "done", transcript: assistantTranscript })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error processing voice message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to process voice message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process voice message" });
      }
    }
  });
}
