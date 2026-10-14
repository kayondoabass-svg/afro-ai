import type { Express, RequestHandler } from "express";
import { pool } from "../db";
import { assertProjectFileOwnership } from "../project-files";
import { ProjectFileError } from "../project-file-policy";
import { safeAssistantText } from "../chat-credential-safety";

type Activity = { id: string; jobId: string; createdAt: string; tool: string; callId: string; status: string; title: string; message?: string; paths?: string[] };
const subscriptions = new Map<string, number>();
let total = 0;
export function publicActivitySnapshot(rows: { role: string; content: string }[]): Activity[] {
  const events: Activity[] = [];
  for (const row of rows) {
    const item = JSON.parse(row.content);
    if (row.role === "workbench-state") {
      for (const event of (item.events || []).slice(-100)) {
        events.push({ id: String(event.id), jobId: String(event.jobId), createdAt: event.createdAt,
          tool: safeAssistantText(String(event.tool)).slice(0, 80), callId: String(event.callId).slice(0, 100),
          status: event.status, title: `${String(event.tool).replace(/_/g, " ")} · ${event.status}`,
          ...(event.message ? { message: safeAssistantText(String(event.message)).slice(0, 300) } : {}),
          ...(Array.isArray(event.paths) ? { paths: event.paths.map((p: string) => safeAssistantText(p).slice(0, 240)).slice(0, 8) } : {}) });
      }
    } else if (row.role === "workbench-capture") {
      const status = item.status === "capturing" && Date.now() - Date.parse(item.updatedAt) > 60000 ? "uncertain" : item.status;
      events.push({ id: `${item.id}:${status}`, jobId: item.id, callId: item.id,
        createdAt: item.updatedAt, tool: "take_ui_screenshot", status,
        title: status === "captured" ? "Desktop and mobile screenshots captured — visual review required" : `Screenshot capture · ${status}`,
        ...(item.reason ? { message: safeAssistantText(String(item.reason)).slice(0, 300) } : {}) });
      if (item.review) events.push({ id: `${item.id}:reviewed`, jobId: item.id, callId: item.review.id,
        createdAt: item.review.createdAt, tool: "visual_review", status: "reviewed",
        title: "Desktop and mobile images reviewed — functional checks remain separate" });
      else if (item.reviewAttempt) events.push({ id: `${item.id}:review:${item.reviewAttempt.status}`, jobId: item.id, callId: item.reviewAttempt.jobId,
        createdAt: item.updatedAt, tool: "visual_review", status: item.reviewAttempt.status,
        title: `Visual review · ${item.reviewAttempt.status} — no automatic retry` });
      if (item.repair) events.push({ id: `${item.id}:repair`, jobId: item.id, callId: item.id,
        createdAt: item.repair.preparedAt, tool: "visual_repair", status: "awaiting-approval",
        title: "Responsive repair requested — approve source changes before recapture" });
    }
  }
  return events.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).slice(-140);
}
export function eventsAfter(events: Activity[], cursor?: string) {
  const index = cursor ? events.findIndex(e => e.id === cursor) : -1;
  return { reset: !!cursor && index < 0, events: index < 0 ? events : events.slice(index + 1) };
}
export function registerActivityStream(app: Express, auth: RequestHandler) {
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
      await assertProjectFileOwnership(owner, String(req.params.id));
      if (total >= 32 || (subscriptions.get(owner) || 0) >= 4) throw new ProjectFileError(429, "Too many activity streams are open.");
      let cursor = req.get("Last-Event-ID") || (typeof req.query.after === "string" ? req.query.after : "");
      if (cursor && !/^[a-zA-Z0-9:_-]{1,200}$/.test(cursor)) throw new ProjectFileError(400, "Invalid activity cursor.");
      total++; subscriptions.set(owner, (subscriptions.get(owner) || 0) + 1); counted = true;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "private, no-store, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Connection", "keep-alive"); res.flushHeaders();
      res.on("close", cleanup);
      const expires = Date.now() + 300000;
      const seen = new Set<string>();
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
          const { rows } = await pool.query(`SELECT role, content FROM messages WHERE conversation_id = $1
            AND role IN ('workbench-state', 'workbench-capture') ORDER BY id DESC LIMIT 21`, [workspace]);
          const snapshot = publicActivitySnapshot(rows);
          const replay = eventsAfter(snapshot, cursor);
          if (replay.reset) send("reset", { reason: "Cursor expired; bounded saved history follows." });
          for (const event of replay.events) {
            if (!seen.has(event.id)) { send("activity", event, event.id); seen.add(event.id); }
          }
          if (snapshot.length) cursor = snapshot[snapshot.length - 1].id;
          send("heartbeat", { connected: true });
          if (Date.now() >= expires) { send("end", { reason: "Reconnect to continue reading saved activity." }); cleanup(); res.end(); return; }
          if (!ended) timer = setTimeout(poll, 2500);
        } catch {
          send("end", { reason: "Activity unavailable or access revoked." }); cleanup(); res.end();
        }
      };
      await poll();
    } catch (e) {
      cleanup();
      if (!res.headersSent) res.status(e instanceof ProjectFileError ? e.status : 503).json({ error: e instanceof ProjectFileError ? e.message : "Activity unavailable." });
      else res.end();
    }
  });
}
