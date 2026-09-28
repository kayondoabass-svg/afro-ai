import type { Express, Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { pool } from "./db";
import { isAuthenticated } from "./replit_integrations/auth/replitAuth";
import { aiBurstLimiters } from "./replit_integrations/quota";
import { readMedia, mediaExtension, MediaAssetError } from "./media-assets";
import { MediaError, mediaReady, publicMediaJob, submitMedia, findMedia, cancelMedia, startMediaWorker } from "./media-jobs";

const owner = (req: Request) => (req as any).user?.claims?.sub as string;
const endpoint = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, _next: NextFunction) => {
    void (async () => {
      try {
        if (!owner(req)) throw new MediaError(401, "UNAUTHENTICATED", "Please sign in.");
        await mediaReady();
        await fn(req, res);
      } catch (e) {
        if (res.headersSent) return;
        if (e instanceof ZodError) res.status(400).json({ code: "INVALID_MEDIA_REQUEST", error: e.issues.map(i => i.message).join("; ") });
        else if (e instanceof MediaError) res.status(e.status).json({ code: e.code, error: e.message });
        else if (e instanceof MediaAssetError) res.status(503).json({ code: e.code, error: "The generated asset is unavailable or invalid." });
        else res.status(503).json({ code: "MEDIA_UNAVAILABLE", error: "Media service is temporarily unavailable." });
      }
    })();
  };

export function registerMediaRoutes(app: Express) {
  app.get("/api/media/jobs", isAuthenticated, endpoint(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id,kind,status,prompt,created_at,error FROM media_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100", [owner(req)]);
    res.json({ jobs: rows.map(publicMediaJob) });
  }));
  app.post("/api/media/jobs", isAuthenticated,
    (req, res, next) => (req.body?.kind === "video" ? aiBurstLimiters.video : aiBurstLimiters.image)(req, res, next),
    endpoint(async (req, res) => {
      res.status(202).json(publicMediaJob(await submitMedia(owner(req), req.body)));
    }));
  app.get("/api/media/jobs/:id", isAuthenticated, endpoint(async (req, res) => {
    res.json(publicMediaJob(await findMedia(owner(req), String(req.params.id))));
  }));
  app.post("/api/media/jobs/:id/cancel", isAuthenticated, endpoint(async (req, res) => {
    res.json(publicMediaJob(await cancelMedia(owner(req), String(req.params.id))));
  }));
  app.get("/api/media/jobs/:id/asset", isAuthenticated, endpoint(async (req, res) => {
    const job = await findMedia(owner(req), String(req.params.id));
    if (job.status !== "succeeded") throw new MediaError(409, "MEDIA_NOT_READY", "No completed asset is available.");
    const bytes = await readMedia(job);
    const ext = mediaExtension(job.kind, job.mime_type);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename="generated-media.${ext}"`);
    res.type(job.mime_type).send(bytes);
  }));
  // Keep legacy response shapes, but route every call through the SAME atomic
  // reservation and durable queue. No legacy direct-provider quota bypass.
  for (const kind of ["image", "video"] as const) {
    app.post(`/api/generate-${kind}`, isAuthenticated, aiBurstLimiters[kind], endpoint(async (req, res) => {
      if ((req.body?.aspectRatio && req.body.aspectRatio !== "1:1") ||
          (req.body?.size && req.body.size !== "1024x1024")) {
        throw new MediaError(400, "UNSUPPORTED_MEDIA_OPTIONS", "Durable image generation currently supports square 1024x1024 images only.");
      }
      let job = await submitMedia(owner(req), {
        kind, prompt: req.body?.prompt,
        ...(kind === "video" ? { duration: req.body?.durationSeconds ?? 5 } : {}),
        idempotencyKey: req.body?.idempotencyKey ?? req.get("Idempotency-Key"),
      });
      res.setHeader("X-Media-Job-Id", job.id);
      const deadline = Date.now() + 7 * 60_000;
      while (["queued", "running"].includes(job.status) && Date.now() < deadline && !res.destroyed) {
        await new Promise(r => setTimeout(r, 1500));
        job = await findMedia(owner(req), job.id);
      }
      if (res.destroyed) return;
      if (job.status === "succeeded") {
        const b64 = (await readMedia(job)).toString("base64");
        res.json(kind === "image"
          ? { b64_json: b64, mimeType: job.mime_type, jobId: job.id }
          : { videoBase64: b64, mimeType: job.mime_type, durationSeconds: job.duration, jobId: job.id });
      } else if (job.status === "queued" || job.status === "running") {
        res.status(202).json(publicMediaJob(job));
      } else res.status(409).json({ ...publicMediaJob(job), error: job.error || "Generation cancelled." });
    }));
  }
  startMediaWorker();
}