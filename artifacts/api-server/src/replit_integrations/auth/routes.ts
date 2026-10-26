import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated, isSignedIn, FOUNDER_EMAIL } from "./replitAuth";
import { db } from "../../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { sendVerificationEmailFor, verifyEmailToken } from "./verification";
import { registerDeviceSessionRoutes } from "./deviceSessions";

const ALLOWED_LANGS = new Set(["en", "sw", "ar", "zu", "hi", "es", "fr", "lg", "yo", "ha", "tw", "pt", "zh", "gu", "ta"]);

function getOrigin(req: any): string {
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0] || req.headers.host;
  return `${proto}://${host}`;
}

export function registerAuthRoutes(app: Express): void {
  registerDeviceSessionRoutes(app);
  app.get("/api/auth/user", isSignedIn, async (req: any, res) => {
    res.setHeader("Cache-Control", "no-store");
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
  app.post("/api/auth/send-verification", isSignedIn, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || !user.email) return res.status(400).json({ error: "No email on file" });
      if (user.emailVerified) return res.json({ ok: true, alreadyVerified: true });
      const name = user.firstName || user.email.split("@")[0];
      const status = await sendVerificationEmailFor(userId, user.email, name, getOrigin(req));
      if (status === "throttled") {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({ error: "Please wait a minute before requesting another verification email." });
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Verify the token. GET so the email link works without JS.
  app.get("/api/auth/verify-email", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    try {
      const token = String(req.query.token || "");
      const status = await verifyEmailToken(token);
      res.redirect(`/verify-email?status=${status}`);
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
