import type { Request, Response, NextFunction, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { users, usageLogs } from "@shared/schema";
import { storage } from "../storage";

export type AiKind = "chat" | "image" | "audio";
export type UserPlan = "starter" | "pro" | "business" | "payg";

const DAILY_REQUEST_LIMITS: Record<AiKind, Record<UserPlan, number>> = {
  chat:  { starter: 200, pro: 1000, business: 2000, payg: 5000 },
  image: { starter: 20,  pro: 100,  business: 200,  payg: 500  },
  audio: { starter: 30,  pro: 200,  business: 400,  payg: 1000 },
};

const COST_CENTS: Record<AiKind, number> = {
  chat: 2,
  image: 8,
  audio: 5,
};

function planOf(raw: unknown): UserPlan {
  return (raw === "pro" || raw === "business" || raw === "payg") ? raw : "starter";
}

function startOfUtcDay(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function friendlyMinutesUntilMidnightUtc(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 60_000));
}

export const aiBurstLimiters: Record<AiKind, RequestHandler> = {
  chat: rateLimit({
    windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false,
    message: { error: "Too many chat requests. Please slow down and try again in a minute." },
  }),
  image: rateLimit({
    windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
    message: { error: "Too many image generations. Please wait a minute and try again." },
  }),
  audio: rateLimit({
    windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: "Too many voice messages. Please wait a minute and try again." },
  }),
};

// For public AI endpoints (USSD, widget, demo, programmatic API) — keyed by IP
// so a single bad client can't burn an owner's plan quota or our global budget.
export const publicAiBurstLimiter: RequestHandler = rateLimit({
  windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests from this client. Please slow down." },
});

// Inline helper used by routes that have a non-standard auth model
// (USSD app key, widget API key, etc.) — enforces the SAME daily request
// cap that aiQuotaGuard does, billed against the owning user.
//
// Returns null on success, or { status, body, retryAfter? } on cap-hit.
export async function assertOwnerDailyCap(opts: {
  ownerUserId: string;
  kind: AiKind;
}): Promise<null | { status: number; body: any; retryAfterSeconds?: number }> {
  try {
    const [u] = await db
      .select({ plan: users.plan })
      .from(users)
      .where(eq(users.id, opts.ownerUserId));
    if (!u) {
      return { status: 404, body: { error: "Owner account not found." } };
    }
    const plan = planOf(u.plan);
    const dailyMax = DAILY_REQUEST_LIMITS[opts.kind][plan];
    const since = startOfUtcDay();
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(usageLogs)
      .where(and(eq(usageLogs.userId, opts.ownerUserId), gte(usageLogs.createdAt, since)));
    const used = row?.n ?? 0;
    if (used >= dailyMax) {
      const minutes = friendlyMinutesUntilMidnightUtc();
      return {
        status: 429,
        retryAfterSeconds: minutes * 60,
        body: {
          error: `Daily ${opts.kind} limit reached for this account. Resets in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          code: "DAILY_QUOTA_REACHED",
          retryAfterSeconds: minutes * 60,
        },
      };
    }
    return null;
  } catch (err) {
    console.error("[assertOwnerDailyCap] error:", err);
    // Fail-open on infra errors so legitimate traffic isn't blocked, but log.
    return null;
  }
}

// Global per-day call ceiling for public, unauthenticated endpoints
// (e.g. /api/demo-chat). Backed by an in-memory counter keyed by UTC date.
// Resets automatically when the date changes.
const _publicGlobalDay: { date: string; count: number } = { date: "", count: 0 };

export function checkAndBumpPublicGlobalCap(maxPerDay: number): boolean {
  const today = startOfUtcDay().toISOString().slice(0, 10);
  if (_publicGlobalDay.date !== today) {
    _publicGlobalDay.date = today;
    _publicGlobalDay.count = 0;
  }
  if (_publicGlobalDay.count >= maxPerDay) return false;
  _publicGlobalDay.count += 1;
  return true;
}

// Per-IP daily cap for public endpoints. In-memory; resets daily.
const _publicIpDay: Map<string, { date: string; count: number }> = new Map();

export function checkAndBumpPublicIpCap(ip: string, maxPerDayPerIp: number): boolean {
  const today = startOfUtcDay().toISOString().slice(0, 10);
  const cur = _publicIpDay.get(ip);
  if (!cur || cur.date !== today) {
    _publicIpDay.set(ip, { date: today, count: 1 });
    // Best-effort cleanup so the map doesn't grow forever.
    if (_publicIpDay.size > 50_000) {
      Array.from(_publicIpDay.entries()).forEach(([k, v]) => {
        if (v.date !== today) _publicIpDay.delete(k);
      });
    }
    return true;
  }
  if (cur.count >= maxPerDayPerIp) return false;
  cur.count += 1;
  return true;
}

export function aiQuotaGuard(kind: AiKind): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const anyReq = req as any;
      const userId: string | undefined = anyReq.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Please sign in to continue." });
      }

      const [u] = await db
        .select({
          plan: users.plan,
          paygBalance: users.paygBalance,
          paygLimit: users.paygLimit,
          paygSpent: users.paygSpent,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!u) return res.status(401).json({ error: "Please sign in to continue." });

      const plan = planOf(u.plan);
      const cost = COST_CENTS[kind];

      if (plan === "payg") {
        if ((u.paygBalance ?? 0) < cost) {
          return res.status(402).json({
            error: "You're out of credits. Top up your pay-as-you-go balance to continue.",
            code: "PAYG_INSUFFICIENT_BALANCE",
          });
        }
        const limit = u.paygLimit ?? 0;
        if (limit > 0 && (u.paygSpent ?? 0) + cost > limit) {
          return res.status(402).json({
            error: "You've reached your daily spend cap. Raise your limit in settings to continue.",
            code: "PAYG_LIMIT_REACHED",
          });
        }
      }

      const dailyMax = DAILY_REQUEST_LIMITS[kind][plan];
      const since = startOfUtcDay();
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(usageLogs)
        .where(and(eq(usageLogs.userId, userId), gte(usageLogs.createdAt, since)));
      const used = row?.n ?? 0;

      if (used >= dailyMax) {
        const minutes = friendlyMinutesUntilMidnightUtc();
        res.setHeader("Retry-After", String(minutes * 60));
        return res.status(429).json({
          error: `You've hit today's ${kind} limit (${dailyMax}). It resets in about ${minutes} minute${minutes === 1 ? "" : "s"}. Upgrade your plan for more.`,
          code: "DAILY_QUOTA_REACHED",
          retryAfterSeconds: minutes * 60,
        });
      }

      anyReq.aiContext = { kind, plan, cost, userId };
      return next();
    } catch (err) {
      console.error("[aiQuotaGuard] error:", err);
      return res.status(503).json({ error: "Couldn't check your usage right now. Please try again." });
    }
  };
}

export async function recordAiUsage(opts: {
  userId: string;
  kind: AiKind;
  model: string;
  tokensUsed?: number;
  conversationId?: number;
  costCents?: number;
  plan?: UserPlan;
}): Promise<void> {
  const cost = opts.costCents ?? COST_CENTS[opts.kind];
  try {
    await storage.createUsageLog({
      userId: opts.userId,
      conversationId: opts.conversationId ?? null as any,
      model: opts.model,
      tokensUsed: opts.tokensUsed ?? 0,
    });
  } catch (e) {
    console.error("[recordAiUsage] usage log insert failed:", e);
  }
  if (opts.plan === "payg") {
    try {
      await storage.deductPaygBalance(opts.userId, cost);
    } catch (e) {
      console.error("[recordAiUsage] payg deduct failed:", e);
    }
  }
}
