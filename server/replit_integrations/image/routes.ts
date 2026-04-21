import type { Express, Request, Response } from "express";
import { openai } from "./client";
import { isAuthenticated } from "../auth/replitAuth";
import { aiBurstLimiters, aiQuotaGuard, recordAiUsage } from "../quota";

export function registerImageRoutes(app: Express): void {
  app.post(
    "/api/generate-image",
    isAuthenticated,
    aiBurstLimiters.image,
    aiQuotaGuard("image"),
    async (req: Request, res: Response) => {
      const ctx = (req as any).aiContext as { userId: string; plan: any; cost: number; kind: "image" };
      try {
        const { prompt, size = "1024x1024" } = req.body ?? {};

        if (!prompt || typeof prompt !== "string") {
          return res.status(400).json({ error: "Prompt is required" });
        }
        if (prompt.length > 4000) {
          return res.status(400).json({ error: "Prompt is too long. Keep it under 4000 characters." });
        }

        const response = await openai.images.generate({
          model: "gpt-image-1",
          prompt,
          n: 1,
          size: size as "1024x1024" | "512x512" | "256x256",
        });

        const imageData = response.data?.[0];
        if (!imageData) {
          return res.status(502).json({ error: "Image generation returned no data. Please try again." });
        }

        await recordAiUsage({
          userId: ctx.userId,
          kind: "image",
          model: "gpt-image-1",
          tokensUsed: 0,
          costCents: ctx.cost,
          plan: ctx.plan,
        });

        res.json({
          url: imageData.url,
          b64_json: imageData.b64_json,
        });
      } catch (error) {
        console.error("Error generating image:", error);
        res.status(500).json({ error: "Failed to generate image" });
      }
    }
  );
}
