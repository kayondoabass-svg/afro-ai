import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth/replitAuth";
import { aiBurstLimiters, aiQuotaGuard, recordAiUsage } from "../quota";
import {
  generateImageWithImagen,
  generateImageWithOpenAIFallback,
  isImagenAvailable,
} from "../../imagen";
import { generateVideoWithVeo, isVeoAvailable } from "../../veo";

export function registerImageRoutes(app: Express): void {
  // ── Image generation: Imagen 3 (Gemini) primary, OpenAI fallback ────
  app.post(
    "/api/generate-image",
    isAuthenticated,
    aiBurstLimiters.image,
    aiQuotaGuard("image"),
    async (req: Request, res: Response) => {
      const ctx = (req as any).aiContext as {
        userId: string;
        plan: any;
        cost: number;
        kind: "image";
      };
      try {
        const { prompt, aspectRatio = "1:1", size = "1024x1024" } = req.body ?? {};

        if (!prompt || typeof prompt !== "string") {
          return res.status(400).json({ error: "Prompt is required" });
        }
        if (prompt.length > 4000) {
          return res
            .status(400)
            .json({ error: "Prompt is too long. Keep it under 4000 characters." });
        }

        let result;
        let modelUsed = "imagen-3.0-generate-002";

        // Try Imagen 3 first (cheaper, ~$0.04/image vs ~$0.04 for OpenAI but
        // higher quality on logos/photos). Fall back to OpenAI on auth/quota
        // errors so users never see a hard failure.
        if (isImagenAvailable()) {
          try {
            result = await generateImageWithImagen(prompt, { aspectRatio });
          } catch (err: any) {
            const status = err?.status;
            // Fall back on auth/quota errors AND on 5xx (Google outage). Hard
            // failures (400 invalid prompt, content blocked) bubble up so the
            // user sees the real reason instead of an opaque OpenAI error.
            const recoverable =
              status === 401 ||
              status === 402 ||
              status === 403 ||
              status === 429 ||
              (typeof status === "number" && status >= 500);
            if (!recoverable) throw err;
            console.warn(
              `[generate-image] Imagen failed (${status}), falling back to OpenAI:`,
              err?.message,
            );
            result = await generateImageWithOpenAIFallback(prompt, size);
            modelUsed = "gpt-image-1";
          }
        } else {
          result = await generateImageWithOpenAIFallback(prompt, size);
          modelUsed = "gpt-image-1";
        }

        await recordAiUsage({
          userId: ctx.userId,
          kind: "image",
          model: modelUsed,
          tokensUsed: 0,
          costCents: ctx.cost,
          plan: ctx.plan,
        });

        res.json({
          b64_json: result.b64_json,
          mimeType: result.mimeType,
          model: modelUsed,
        });
      } catch (error: any) {
        console.error("Error generating image:", error?.message || error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to generate image" });
      }
    },
  );

  // ── Video generation: Veo 2, Business+ only ─────────────────────────
  // Hard daily cap of 5 clips/day for Business (5×$1.75 = $8.75/day worst
  // case → still profitable on $25/mo plan). Free + Pro are blocked at the
  // quota guard level (DAILY_REQUEST_LIMITS.video.starter = 0).
  app.post(
    "/api/generate-video",
    isAuthenticated,
    aiBurstLimiters.video,
    aiQuotaGuard("video"),
    async (req: Request, res: Response) => {
      const ctx = (req as any).aiContext as {
        userId: string;
        plan: any;
        cost: number;
        kind: "video";
      };
      try {
        if (!isVeoAvailable()) {
          return res
            .status(503)
            .json({ error: "Video generation is not configured on this server." });
        }

        const { prompt, durationSeconds = 5 } = req.body ?? {};
        if (!prompt || typeof prompt !== "string") {
          return res.status(400).json({ error: "Prompt is required" });
        }
        if (prompt.length > 2000) {
          return res
            .status(400)
            .json({ error: "Prompt is too long. Keep it under 2000 characters." });
        }

        const dur = Math.min(5, Math.max(2, Number(durationSeconds) || 5));
        const result = await generateVideoWithVeo(prompt, { durationSeconds: dur });

        await recordAiUsage({
          userId: ctx.userId,
          kind: "video",
          model: "veo-2.0-generate-001",
          tokensUsed: 0,
          costCents: ctx.cost,
          plan: ctx.plan,
        });

        res.json({
          videoBase64: result.videoBase64,
          mimeType: result.mimeType,
          durationSeconds: result.durationSeconds,
          model: "veo-2.0-generate-001",
        });
      } catch (error: any) {
        console.error("Error generating video:", error?.message || error);
        res
          .status(500)
          .json({ error: error?.message || "Failed to generate video" });
      }
    },
  );
}
