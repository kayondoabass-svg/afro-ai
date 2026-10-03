import type { Express, RequestHandler } from "express";
import { createHash } from "node:crypto";
import rateLimit from "express-rate-limit";
import { sql } from "drizzle-orm";
import { db } from "./db";

let ready: Promise<unknown> | undefined;
function ensureTable() {
  // Additive and idempotent: no existing records or schemas are changed.
  ready ??= db.execute(sql`CREATE TABLE IF NOT EXISTS app_installations (
    installation_hash VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).catch(error => { ready = undefined; throw error; });
  return ready;
}

export function registerAppInstallRoutes(app: Express, founderOnly: RequestHandler) {
  app.post("/api/app-installs", rateLimit({
    windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  }), async (req, res) => {
    const id = req.body?.installationId;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ message: "Invalid installation identifier" });
    }
    try {
      await ensureTable();
      const hash = createHash("sha256").update(id.toLowerCase()).digest("hex");
      await db.execute(sql`INSERT INTO app_installations (installation_hash)
        VALUES (${hash}) ON CONFLICT (installation_hash) DO NOTHING`);
      res.status(204).end();
    } catch {
      res.status(503).json({ message: "Installation tracking temporarily unavailable" });
    }
  });
  app.get("/api/admin/app-installs", founderOnly, async (_req, res) => {
    try {
      await ensureTable();
      const result = await db.execute(sql`SELECT COUNT(*)::int AS total FROM app_installations`);
      res.setHeader("Cache-Control", "no-store");
      res.json({ total: Number(result.rows[0].total) });
    } catch {
      res.status(503).json({ message: "Installation count temporarily unavailable" });
    }
  });
}