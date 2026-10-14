import type { Express, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { assertProjectFileOwnership } from "../project-files";
import { ProjectFileError } from "../project-file-policy";
import { activityCursor, activityLimit, importLegacyActivity, readActivityPage, resolveActivityCursor } from "./activity-history";
import type { Activity } from "./activity-model";
export { publicActivitySnapshot } from "./activity-model";

const subscriptions = new Map<string, number>();
let total = 0;
export function eventsAfter(events: Activity[], cursor?: string) {
  const index = cursor ? events.findIndex(e => e.id === cursor) : -1;
  return { reset: !!cursor && index < 0, events: index < 0 ? events : events.slice(index + 1) };
}
export function registerActivityStream(app: Express, auth: RequestHandler) {
  const historyLimit = rateLimit({ windowMs: 60000, limit: 60,
    keyGenerator: (req: any) => req.user?.claims?.sub || req.user?.claims?.id,
    standardHeaders: true, legacyHeaders: false });
  app.get("/api/conversations/:id/workbench/activity", auth, historyLimit, async (req: any, res) => {
    try {
      const owner = req.user?.claims?.sub || req.user?.claims?.id;
      const before = activityCursor(req.query.before), limit = activityLimit(req.query.limit);
      const workspace = await assertProjectFileOwnership(owner, String(req.params.id));
      await importLegacyActivity(workspace);
      const page = await readActivityPage(workspace, { before, limit });
      // Recheck after the database read, including legacy import.
      await assertProjectFileOwnership(owner, String(req.params.id));
      res.setHeader("Cache-Control", "private, no-store");
      res.json(page);
    } catch (e) {
      res.status(e instanceof ProjectFileError ? e.status : 503).json({ error: e instanceof ProjectFileError ? e.message : "Saved activity unavailable." });
    }
  });
  app.get("/api/conversations/:id/workbench/events", auth, async (req: any, res) => {
    const owner = req.user?.claims?.sub || req.user?.claims?.id;
    let counted = false, ended = false, timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (ended) return; ended = true;
      if (timer) clearTimeout(timer);
      if (counted) {
        total--; const remaining = (subscriptions.get(owner) || 1) - 1;
        if (remaining) subscriptions.set(owner, remaining); else subscriptions.delete(owner);
      }
    };
    try {
      const workspace = await assertProjectFileOwnership(owner, String(req.params.id));
      if (total >= 32 || (subscriptions.get(owner) || 0) >= 4) throw new ProjectFileError(429, "Too many activity streams are open.");
      let cursor = req.get("Last-Event-ID") || (typeof req.query.after === "string" ? req.query.after : "");
      if (cursor && !/^[a-zA-Z0-9:_-]{1,200}$/.test(cursor)) throw new ProjectFileError(400, "Invalid activity cursor.");
      await importLegacyActivity(workspace);
      const resolved = cursor ? await resolveActivityCursor(workspace, cursor) : undefined;
      const expired = !!cursor && !resolved;
      cursor = resolved || "";
      if (res.destroyed) return;
      // Imports/cursor reads above are asynchronous: recheck admission after
      // them so simultaneous connections cannot all pass an earlier count.
      if (total >= 32 || (subscriptions.get(owner) || 0) >= 4) throw new ProjectFileError(429, "Too many activity streams are open.");
      total++; subscriptions.set(owner, (subscriptions.get(owner) || 0) + 1); counted = true;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "private, no-store, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Connection", "keep-alive"); res.flushHeaders();
      res.on("close", cleanup);
      const expires = Date.now() + 300000;
      const send = (type: string, data: unknown, id?: string) => {
        if (ended) return;
        if (res.writableLength > 256000) { cleanup(); res.end(); return; }
        res.write(`${id ? `id: ${id}\n` : ""}event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
        (res as any).flush?.();
      };
      const poll = async () => {
        if (ended) return;
        try {
          // Check ownership on each read: deleting/reassigning a workspace must
          // revoke a previously opened stream, not leak events after access ends.
          const workspace = await assertProjectFileOwnership(owner, String(req.params.id));
          const page = await readActivityPage(workspace, { ...(cursor ? { after: cursor } : {}), limit: cursor ? 100 : 50 });
          await assertProjectFileOwnership(owner, String(req.params.id));
          for (const event of page.items) {
            send("activity", event, event.sequence);
            cursor = event.sequence!;
          }
          send("heartbeat", { connected: true });
          if (Date.now() >= expires) { send("end", { reason: "Reconnect to continue reading saved activity." }); cleanup(); res.end(); return; }
          if (!ended) timer = setTimeout(poll, cursor && page.hasMore ? 50 : 2500);
        } catch {
          send("end", { reason: "Activity unavailable or access revoked." }); cleanup(); res.end();
        }
      };
      if (expired) send("reset", { reason: "Cursor unavailable; latest saved history follows. Older activity remains available through pagination." });
      await poll();
    } catch (e) {
      cleanup();
      if (!res.headersSent) res.status(e instanceof ProjectFileError ? e.status : 503).json({ error: e instanceof ProjectFileError ? e.message : "Activity unavailable." });
      else res.end();
    }
  });
}
