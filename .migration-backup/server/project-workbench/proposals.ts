import type { Express, Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { assertProjectFileOwnership, listProjectFiles } from "../project-files";
import { ProjectFileError } from "../project-file-policy";
import { findMedia } from "../media-jobs";
import { readMedia, mediaExtension } from "../media-assets";
import { safeText } from "./model";
import { fingerprint } from "./model";
import { appendActivities } from "./activity-history";

const role = "workbench-proposal";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Proposal = { id: string; mediaJobId: string; title: string; createdAt: string; sourceFingerprint: string };
const owner = (req: Request) => (req as any).user?.claims?.sub || (req as any).user?.claims?.id;
const failure = (res: Response, error: unknown) => res.status(error instanceof ProjectFileError ? error.status : 503)
  .json({ error: error instanceof ProjectFileError ? error.message : "Design proposal is unavailable." });

// References a previously completed, privately stored image. This endpoint
// never creates, retries or pays for a media job. The image and project must
// belong to the same signed-in account.
export function registerProposalRoutes(app: Express, auth: RequestHandler) {
  const base = "/api/conversations/:id/workbench/proposals";
  const limit = rateLimit({ windowMs: 60_000, limit: 30,
    keyGenerator: req => owner(req), standardHeaders: true, legacyHeaders: false });
  app.post(base, auth, limit, async (req, res) => {
    try {
      if (!req.is("application/json")) throw new ProjectFileError(415, "Use JSON for design proposals.");
      const origin = req.get("Origin");
      if (origin) {
        try {
          if (new URL(origin).host !== req.get("host")) throw new Error("foreign origin");
        } catch { throw new ProjectFileError(403, "Use the studio's own origin."); }
      }
      if (Buffer.byteLength(JSON.stringify(req.body ?? {})) > 4096 ||
        !uuid.test(req.body?.requestId ?? "") || !uuid.test(req.body?.mediaJobId ?? ""))
        throw new ProjectFileError(400, "Provide a valid proposal request and image job.");
      const title = safeText(req.body.title, 120).trim();
      if (!title) throw new ProjectFileError(400, "Name the design proposal.");
      const user = owner(req);
      const workspace = await assertProjectFileOwnership(user, String(req.params.id));
      const media = await findMedia(user, req.body.mediaJobId);
      if (media.kind !== "image" || media.status !== "succeeded" || !media.asset_key)
        throw new ProjectFileError(409, "Only a completed, owned image can become a proposal.");
      mediaExtension("image", media.mime_type);
      // Do not save a card for an asset that cannot actually be opened.
      await readMedia(media);
      const sourceFingerprint = fingerprint(await listProjectFiles(user, workspace));
      const conn = await pool.connect();
      let item: Proposal;
      let created = false;
      try {
        await conn.query("BEGIN");
        await conn.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`proposal:${workspace}`]);
        await assertProjectFileOwnership(user, workspace);
        const existing = await conn.query(`SELECT content FROM messages WHERE conversation_id=$1 AND role=$2
          AND content::jsonb->>'id'=$3 LIMIT 1`, [workspace, role, req.body.requestId]);
        if (existing.rows.length) {
          item = JSON.parse(existing.rows[0].content);
          if (item.mediaJobId !== media.id || item.title !== title)
            throw new ProjectFileError(409, "This proposal request ID belongs to another image or title.");
        } else {
          item = { id: req.body.requestId, mediaJobId: media.id, title, createdAt: new Date().toISOString(), sourceFingerprint };
          await conn.query("INSERT INTO messages (conversation_id,role,content) VALUES ($1,$2,$3)",
            [workspace, role, JSON.stringify(item)]);
          await appendActivities(conn, workspace, [{
            id: `${item.id}:proposed`, artifactId: item.id, jobId: item.id, callId: media.id,
            createdAt: item.createdAt, tool: "design_proposal", status: "proposed",
            title: item.title, message: "Design proposal image · not implemented or visually verified",
          }]);
          created = true;
        }
        await conn.query("COMMIT");
      } catch (error) {
        await conn.query("ROLLBACK").catch(() => {});
        throw error;
      } finally { conn.release(); }
      res.setHeader("Cache-Control", "private, no-store");
      res.status(created ? 201 : 200).json(item);
    } catch (error) { failure(res, error); }
  });
  app.get(`${base}/:proposalId/image`, auth, limit, async (req, res) => {
    try {
      const user = owner(req);
      const workspace = await assertProjectFileOwnership(user, String(req.params.id));
      if (!uuid.test(String(req.params.proposalId))) throw new ProjectFileError(404, "Design proposal not found.");
      const { rows } = await pool.query(`SELECT content FROM messages WHERE conversation_id=$1 AND role=$2
        AND content::jsonb->>'id'=$3 LIMIT 1`, [workspace, role, req.params.proposalId]);
      if (!rows.length) throw new ProjectFileError(404, "Design proposal not found.");
      const item = JSON.parse(rows[0].content) as Proposal;
      const media = await findMedia(user, item.mediaJobId);
      if (media.kind !== "image" || media.status !== "succeeded")
        throw new ProjectFileError(503, "Saved proposal image is unavailable.");
      mediaExtension("image", media.mime_type);
      const bytes = await readMedia(media);
      await assertProjectFileOwnership(user, workspace);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("Content-Disposition", "inline");
      res.type(media.mime_type).send(bytes);
    } catch (error) { failure(res, error); }
  });
}
