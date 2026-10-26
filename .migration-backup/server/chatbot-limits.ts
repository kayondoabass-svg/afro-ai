import { storage } from "./storage";
import { FOUNDER_EMAILS } from "./replit_integrations/auth/storage";

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export type EnforcementResult =
  | { ok: true; founder: true }
  | { ok: true; founder: false; sub: any | null; remaining: number }
  | { ok: false; reason: "REPLY_LIMIT_REACHED"; limit: number; plan: string }
  | { ok: false; reason: "API_REQUIRES_AGENCY"; plan: string };

export async function enforceChatbotReplyLimit(ownerUserId: string): Promise<EnforcementResult> {
  const owner = await storage.getUser(ownerUserId);
  if (owner?.email && FOUNDER_EMAILS.includes(owner.email)) {
    return { ok: true, founder: true };
  }

  const sub = await storage.getChatbotSubscription(ownerUserId);
  if (!sub) {
    return { ok: true, founder: false, sub: null, remaining: Number.POSITIVE_INFINITY };
  }

  const now = Date.now();
  const periodStart = sub.periodStartsAt ? new Date(sub.periodStartsAt).getTime() : new Date(sub.activatedAt).getTime();
  let repliesUsed = sub.repliesUsed;

  if (now - periodStart >= PERIOD_MS) {
    const elapsed = Math.floor((now - periodStart) / PERIOD_MS);
    const newPeriodStart = new Date(periodStart + elapsed * PERIOD_MS);
    await storage.updateChatbotSubscription(ownerUserId, { repliesUsed: 0, periodStartsAt: newPeriodStart });
    repliesUsed = 0;
  }

  if (sub.repliesLimit !== -1 && repliesUsed >= sub.repliesLimit) {
    return { ok: false, reason: "REPLY_LIMIT_REACHED", limit: sub.repliesLimit, plan: sub.plan };
  }

  return { ok: true, founder: false, sub, remaining: sub.repliesLimit === -1 ? Infinity : sub.repliesLimit - repliesUsed };
}

export async function enforceAgencyForApi(ownerUserId: string): Promise<EnforcementResult> {
  const owner = await storage.getUser(ownerUserId);
  if (owner?.email && FOUNDER_EMAILS.includes(owner.email)) {
    return { ok: true, founder: true };
  }
  const sub = await storage.getChatbotSubscription(ownerUserId);
  if (!sub || sub.plan !== "agency") {
    return { ok: false, reason: "API_REQUIRES_AGENCY", plan: sub?.plan || "none" };
  }
  return enforceChatbotReplyLimit(ownerUserId);
}

export const PLAN_RETENTION_DAYS: Record<string, number> = {
  starter: 7,
  business: 30,
  agency: 90,
};
