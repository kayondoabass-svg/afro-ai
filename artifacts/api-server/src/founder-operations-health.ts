import type { Express, RequestHandler } from "express";
import { inspectDnsAccess } from "./cloudflare";
import { d1Query, isD1Configured } from "./d1";
import { readFile } from "node:fs/promises";

declare const __AFRO_BUILD_SHA__: string | null;
type Check = { status: string; message: string };
type Health = { checkedAt: string; release: string | null; featureVersion: string; checks: { dns: Check; sourceStorage: Check; backups: Check } };
let cached: { expires: number; value: Health } | undefined;
let inFlight: Promise<Health> | undefined;

async function inspectBackups(): Promise<Check> {
  const fallback: Check = { status: "unverified",
    message: "Independent backup and restore-test coverage has not been verified. Saved HTML and version history are not proof of an off-host backup." };
  if (!process.env.AFRO_BACKUP_STATUS_FILE) return fallback;
  try {
    const raw = await readFile(process.env.AFRO_BACKUP_STATUS_FILE, "utf8");
    if (raw.length > 20_000) return fallback;
    const status = JSON.parse(raw);
    if (status.status === "failed") return { status: "unavailable",
      message: "The latest recovery backup did not complete verification. Earlier restore points may remain; founder attention is required." };
    const completed = typeof status.completedAt === "string" ? Date.parse(status.completedAt) : NaN;
    if (status.kind !== "afro-ai-recovery" || status.version !== 1 || status.status !== "verified" ||
      status.retentionDays !== 7 || status.archiveReadBackVerified !== true || status.assetsVerified !== true ||
      !Number.isInteger(status.restoredPostgresTables) || !(status.restoredPostgresTables > 0) ||
      !Number.isInteger(status.restoredD1Databases) || !(status.restoredD1Databases >= 3) || !Array.isArray(status.scopes) ||
      !["postgres", "d1", "uploads"].every(scope => status.scopes?.includes(scope)) ||
      !Number.isFinite(completed) || completed > Date.now() + 60_000) return fallback;
    if (Date.now() - completed > 36 * 3600_000) return { status: "unavailable",
      message: "The latest verified recovery point is over 36 hours old. Check the daily backup job; do not assume current data is protected." };
    return { status: "ok",
      message: "Latest private R2 archive passed read-back, isolated PostgreSQL/D1 restores and upload checksums. Daily backups, seven-day retention. This does not establish account-compromise protection or instant recovery." };
  } catch { return fallback; }
}
async function inspectSourceStorage(): Promise<Check> {
  if (!isD1Configured()) return { status: "not_configured", message: "Project-file storage is not configured. Saved website snapshots have not been removed." };
  // A bounded schema-only read; no customer source or credentials are returned.
  try {
    const { results } = await d1Query("SELECT name FROM sqlite_master WHERE type='table' AND name='project_files'", [], undefined, AbortSignal.timeout(10_000));
    return results.length
      ? { status: "ok", message: "Project-file storage is reachable. This does not establish that every project's Files are synchronized." }
      : { status: "unavailable", message: "Project-file storage is reachable but its required table is missing. No migration or customer change was attempted." };
  } catch { return { status: "unavailable", message: "Project-file storage readiness could not be verified. Saved work has not been changed." }; }
}

export async function founderOperationsHealth(): Promise<Health> {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const [dns, sourceStorage, backups] = await Promise.all([inspectDnsAccess(), inspectSourceStorage(), inspectBackups()]);
    const release = typeof __AFRO_BUILD_SHA__ === "undefined" ? null : __AFRO_BUILD_SHA__;
    const value: Health = {
      checkedAt: new Date().toISOString(), release, featureVersion: "founder-operations-2026-11",
      checks: { dns, sourceStorage, backups },
    };
    cached = { expires: Date.now() + 30_000, value };
    return value;
  })();
  try { return await inFlight; } finally { inFlight = undefined; }
}

export function registerFounderOperationsHealth(app: Express, isFounder: RequestHandler) {
  app.get("/api/founder/operations-health", isFounder, async (_req, res) => {
    res.set("Cache-Control", "private, no-store");
    try { res.json(await founderOperationsHealth()); }
    catch { res.status(503).json({ message: "Operations checks are unavailable. No records were changed." }); }
  });
}
