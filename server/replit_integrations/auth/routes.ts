import type { Express } from "express";
import crypto from "crypto";
import { authStorage } from "./storage";
import { isAuthenticated, FOUNDER_EMAIL } from "./replitAuth";
import { db } from "../../db";
import { users, emailVerificationTokens } from "@shared/models/auth";
import { eq, and, isNull, gt } from "drizzle-orm";
import { sendEmailVerification } from "../../mailer";

const ALLOWED_LANGS = new Set(["en", "sw", "ar", "zu", "hi", "es", "fr", "lg", "yo", "ha", "tw", "pt", "zh", "gu", "ta"]);

function getOrigin(req: any): string {
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0] || req.headers.host;
  return `${proto}://${host}`;
}

async function issueVerificationToken(userId: string, email: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(emailVerificationTokens).values({ tokenHash, userId, email, expiresAt });
  return raw;
}

export async function sendVerificationEmailFor(userId: string, email: string, name: string, origin: string): Promise<void> {
  try {
    const raw = await issueVerificationToken(userId, email);
    const verifyUrl = `${origin}/verify-email?token=${raw}`;
    sendEmailVerification(email, { name, verifyUrl }).catch(() => {});
  } catch (e) {
    console.warn("[email-verify] failed to issue token:", (e as any)?.message || e);
  }
}

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (user) {
        res.json({ ...user, isFounder: user.email === FOUNDER_EMAIL });
      } else {
        res.json(null);
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ===== Email verification =====
  // Resend a verification email to the logged-in user (rate-limited to one email/min by token reuse window).
  app.post("/api/auth/send-verification", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || !user.email) return res.status(400).json({ error: "No email on file" });
      if (user.emailVerified) return res.json({ ok: true, alreadyVerified: true });
      // Throttle: reject if a still-valid token was issued in the last 60s.
      const recent = await db.select().from(emailVerificationTokens)
        .where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt), gt(emailVerificationTokens.expiresAt, new Date(Date.now() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000))));
      if (recent.length > 0) return res.status(429).json({ error: "Please wait a minute before requesting another verification email." });
      const name = user.firstName || user.email.split("@")[0];
      await sendVerificationEmailFor(userId, user.email, name, getOrigin(req));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Verify the token. GET so the email link works without JS.
  app.get("/api/auth/verify-email", async (req, res) => {
    try {
      const token = String(req.query.token || "");
      if (!token) return res.redirect("/verify-email?status=missing");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const [row] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.tokenHash, tokenHash));
      if (!row) return res.redirect("/verify-email?status=invalid");
      if (row.usedAt) return res.redirect("/verify-email?status=used");
      if (row.expiresAt < new Date()) return res.redirect("/verify-email?status=expired");
      await db.update(users).set({ emailVerified: new Date(), updatedAt: new Date() }).where(eq(users.id, row.userId));
      await db.update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.tokenHash, tokenHash));
      res.redirect("/verify-email?status=ok");
    } catch (e: any) {
      console.error("[verify-email] error:", e?.message);
      res.redirect("/verify-email?status=error");
    }
  });

  // Persist UI language choice to the user profile so it survives device changes
  app.patch("/api/auth/user/language", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { language } = req.body || {};
      if (!language || typeof language !== "string" || !ALLOWED_LANGS.has(language)) {
        return res.status(400).json({ error: "Invalid language code" });
      }
      await db.update(users).set({ preferredLanguage: language, updatedAt: new Date() }).where(eq(users.id, userId));
      res.json({ ok: true, language });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
