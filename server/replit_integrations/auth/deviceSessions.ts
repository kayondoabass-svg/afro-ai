import crypto from "crypto";
import type { Express } from "express";
import { d1Query } from "../../d1";
import { deviceLabel } from "@shared/device-sessions";
import { isAuthenticated } from "./replitAuth";
import { authStorage } from "./storage";

// Same auth database as cloudflare/wrangler.toml; never the project-files database.
const AUTH_DATABASE_ID = "e796b2ab-d062-42c2-8412-7d281e4c0f5d";
export const sessionQuery = (sql: string, params: any[] = []) => d1Query(sql, params, AUTH_DATABASE_ID);
const now = () => Math.floor(Date.now() / 1000);

export async function validDeviceSession(id: unknown, userId: string): Promise<boolean> {
  if (typeof id !== "string") return false; // Legacy, unrevocable sessions require a fresh login.
  const { results } = await sessionQuery("SELECT id, last_seen_at FROM device_sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?", [id, userId, now()]);
  if (!results.length) return false;
  if (results[0].last_seen_at < now() - 300) {
    await sessionQuery("UPDATE device_sessions SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?", [now(), id, now() - 300]);
  }
  return true;
}

export async function createPassportDeviceSession(req: any, user: any) {
  const sid = crypto.randomUUID();
  await sessionQuery("INSERT INTO device_sessions (id, user_id, email, device, location, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [sid, user.claims.sub, user.claims.email.toLowerCase(), deviceLabel(req.headers["user-agent"] || ""), "Location unavailable", now(), now(), now() + 30 * 86400]);
  user.sid = sid;
}

export function registerDeviceSessionRoutes(app: Express) {
  app.get("/api/auth/devices", isAuthenticated, async (req: any, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const user = await authStorage.getUser(req.user.claims.sub);
      const { results } = await sessionQuery("SELECT id, device, location, created_at, last_seen_at FROM device_sessions WHERE email = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC", [user!.email!.toLowerCase(), now()]);
      res.json({ devices: results.map(row => ({ ...row, current: row.id === req.user.sid })) });
    } catch (error) { next(error); }
  });
  app.delete("/api/auth/devices/:id", isAuthenticated, async (req: any, res, next) => {
    try {
      // Do not let customer subdomains make credentialed account changes.
      const origin = req.get("origin");
      if (req.get("sec-fetch-site") === "cross-site" || (origin && origin !== `${req.protocol}://${req.get("host")}`)) {
        return res.status(403).json({ message: "Untrusted request origin." });
      }
      const user = await authStorage.getUser(req.user.claims.sub);
      const result = await sessionQuery("UPDATE device_sessions SET revoked_at = ? WHERE id = ? AND email = ? AND revoked_at IS NULL", [now(), req.params.id, user!.email!.toLowerCase()]);
      if (!result.meta.changes) return res.status(404).json({ message: "Session not found." });
      res.json({ ok: true, current: req.params.id === req.user.sid });
    } catch (error) { next(error); }
  });
}