export class DailyQuotaError extends Error {
  name = "DailyQuotaError";
}

// Shared by fetch-based chat and the ordinary API client. Quota responses are
// customer guidance, not agent failures. No billing or entitlement changes.
export function inspectQuota(res: Response, bodyText?: string): boolean {
  try {
    const kind = res.headers.get("X-AfroAI-Quota-Kind");
    const used = Number(res.headers.get("X-AfroAI-Quota-Used") || 0);
    const limit = Number(res.headers.get("X-AfroAI-Quota-Limit") || 0);
    const percent = Number(res.headers.get("X-AfroAI-Quota-Percent") || 0);
    const plan = res.headers.get("X-AfroAI-Quota-Plan") || "starter";
    const resetsAt = res.headers.get("X-AfroAI-Quota-Resets-At") || "";
    if (res.status === 429 && bodyText) {
      let body: any = {};
      try { body = JSON.parse(bodyText); } catch {}
      if (body?.code === "DAILY_QUOTA_REACHED") {
        window.dispatchEvent(new CustomEvent("afroai:quota-blocked", { detail: {
          ...body,
          kind: kind || body.kind || "chat",
          used: res.headers.has("X-AfroAI-Quota-Used") ? used : body.used ?? used,
          limit: res.headers.has("X-AfroAI-Quota-Limit") ? limit : body.limit ?? limit,
          plan: res.headers.has("X-AfroAI-Quota-Plan") ? plan : body.plan || plan,
          resetsAt: res.headers.has("X-AfroAI-Quota-Resets-At") ? resetsAt : body.resetsAt || resetsAt,
        } }));
        return true;
      }
    }
    if (kind && percent >= 80 && percent < 100) {
      window.dispatchEvent(new CustomEvent("afroai:quota-warn", { detail: { kind, used, limit, percent, plan, resetsAt } }));
    }
  } catch { /* Invalid metadata must not break an ordinary request. */ }
  return false;
}
