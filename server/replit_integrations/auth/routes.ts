import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated, FOUNDER_EMAIL } from "./replitAuth";
import { db } from "../../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

const ALLOWED_LANGS = new Set(["en", "sw", "ar", "zu", "hi", "es", "fr", "lg", "yo", "ha", "tw", "pt", "zh", "gu", "ta"]);

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
