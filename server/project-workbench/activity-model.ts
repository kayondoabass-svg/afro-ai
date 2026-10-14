import { safeAssistantText } from "../chat-credential-safety";

export type Activity = {
  id: string; jobId: string; createdAt: string; tool: string; callId: string;
  status: string; title: string; message?: string; paths?: string[];
  sequence?: string; evidenceIds?: string[];
};

// Only this public projection enters the ledger; never store raw tool outputs,
// source, screenshots, credentials, provider metadata or model reasoning here.
export function safeActivity(input: Activity): Activity {
  const text = (value: unknown, length: number) => safeAssistantText(String(value ?? "")).slice(0, length);
  const date = new Date(input.createdAt);
  if (!input.id || !input.jobId || !Number.isFinite(date.getTime())) throw new Error("Invalid activity record.");
  return {
    id: text(input.id, 200), jobId: text(input.jobId, 200),
    createdAt: date.toISOString(), tool: text(input.tool, 80), callId: text(input.callId, 200),
    status: text(input.status, 40), title: text(input.title, 300),
    ...(input.message ? { message: text(input.message, 700) } : {}),
    ...(input.paths?.length ? { paths: input.paths.slice(0, 8).map(p => text(p, 240)) } : {}),
    ...(input.evidenceIds?.length ? { evidenceIds: input.evidenceIds.slice(0, 2).map(p => text(p, 100)) } : {}),
  };
}

export function publicActivitySnapshot(rows: { role: string; content: string }[]): Activity[] {
  const events: Activity[] = [];
  for (const row of rows) {
    const item = JSON.parse(row.content);
    if (row.role === "workbench-state") {
      if (item.job?.id && item.job.updatedAt) {
        const status = item.job.status === "reviewing"
          ? (Date.now() - Date.parse(item.job.updatedAt) > 120000 ? "interrupted" : "started") : item.job.status;
        events.push(safeActivity({ id: `${item.job.id}:${status}`, jobId: item.job.id, callId: item.job.id,
          createdAt: item.job.updatedAt, tool: "project_review", status,
          title: `Project review · ${status}`, message: status === "interrupted"
            ? "Inspect saved work before explicitly starting another request. No automatic replay." : item.job.detail }));
      }
      for (const event of (item.events || []).slice(-100)) {
        events.push(safeActivity({ ...event, title: `${String(event.tool).replace(/_/g, " ")} · ${event.status}` }));
      }
    } else if (row.role === "workbench-capture") {
      const status = item.status === "capturing" && Date.now() - Date.parse(item.updatedAt) > 60000 ? "uncertain" : item.status;
      events.push(safeActivity({
        id: `${item.id}:${status}`, jobId: item.id, callId: item.id,
        createdAt: item.updatedAt, tool: "take_ui_screenshot", status,
        title: status === "captured" ? "Desktop and mobile screenshots captured — visual review required" : `Screenshot capture · ${status}`,
        message: item.reason, evidenceIds: item.evidenceIds,
      }));
      if (item.review) events.push(safeActivity({
        id: `${item.id}:reviewed`, jobId: item.id, callId: item.review.id,
        createdAt: item.review.createdAt || item.updatedAt, tool: "visual_review", status: "reviewed",
        title: "Desktop and mobile images reviewed — functional checks remain separate",
        evidenceIds: item.evidenceIds,
      }));
      else if (item.reviewAttempt) events.push(safeActivity({
        id: `${item.id}:review:${item.reviewAttempt.status}`, jobId: item.id, callId: item.reviewAttempt.jobId,
        createdAt: item.updatedAt, tool: "visual_review", status: item.reviewAttempt.status,
        title: `Visual review · ${item.reviewAttempt.status} — no automatic retry`,
      }));
      if (item.repair) events.push(safeActivity({
        id: `${item.id}:repair`, jobId: item.id, callId: item.id,
        createdAt: item.repair.preparedAt, tool: "visual_repair", status: "awaiting-approval",
        title: "Responsive repair requested — approve source changes before recapture",
      }));
    }
  }
  return events.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
