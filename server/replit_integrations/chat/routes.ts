import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const BUILDER_SYSTEM_PROMPT = `You are Africa.ai, an AI-powered website and app builder for African creators. When a user asks you to build, create, make, or design a website, app, page, landing page, portfolio, store, or any digital product:

1. IMMEDIATELY generate the COMPLETE working code as a single HTML file with embedded CSS and JavaScript.
2. Wrap ALL generated code in a single code block using triple backticks with "html" language tag like this:
\`\`\`html
<!DOCTYPE html>
<html>...</html>
\`\`\`

3. Before the code block, write a brief 1-2 sentence description of what you built.
4. After the code block, suggest 2-3 improvements they could ask for.

CRITICAL RULES FOR CODE GENERATION:
- Generate a COMPLETE, standalone HTML file that works by itself
- Include ALL CSS inline in a <style> tag
- Include ALL JavaScript inline in a <script> tag
- Use modern, beautiful design with gradients, shadows, animations
- Make it fully responsive (mobile + desktop)
- Use professional color schemes appropriate for the request
- Include real placeholder content that makes sense (not lorem ipsum)
- Use Google Fonts via CDN link for beautiful typography
- Use Font Awesome or similar icon CDN for icons
- Make it production-quality, not a basic template
- Include smooth scroll, hover effects, transitions
- For apps: simulate app-like UI with navigation, cards, lists

If the user is NOT asking you to build something (just asking a question, requesting help, etc.), respond normally with helpful text advice. Do not generate code for simple questions.

You are enthusiastic, supportive, and proud to help African creators bring their ideas to life. Keep explanations short - let the code speak for itself.`;

export function registerChatRoutes(app: Express): void {
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id as string);
      const { content: userContent } = req.body;

      await chatStorage.createMessage(conversationId, "user", userContent);

      const messages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const systemMessage = {
        role: "system" as const,
        content: BUILDER_SYSTEM_PROMPT,
      };

      const stream = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [systemMessage, ...chatMessages],
        stream: true,
        max_completion_tokens: 16000,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      try {
        if (messages.length <= 1) {
          const titleText = userContent.trim().split(/\n/)[0].slice(0, 60);
          await chatStorage.updateConversationTitle(conversationId, titleText || "New Chat");
        }
      } catch (titleErr) {
        console.error("Error updating title:", titleErr);
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}
