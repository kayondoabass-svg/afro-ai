import type { Express, RequestHandler } from "express";
import { inspectDnsAccess } from "./cloudflare";
import { d1Query, isD1Configured } from "./d1";

declare const __AFRO_BUILD_SHA__: string | null;
type Check = { status: string; message: string };
type Health = { checkedAt: string; release: string | null; featureVersion: string; checks: { dns: Check; sourceStorage: Check; backups: Check } };
let cached: { expires: number; value: Health } | undefined;
let inFlight: Promise<Health> | undefined;

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
    const [dns, sourceStorage] = await Promise.all([inspectDnsAccess(), inspectSourceStorage()]);
    const release = typeof __AFRO_BUILD_SHA__ === "undefined" ? null : __AFRO_BUILD_SHA__;
    const value: Health = {
      checkedAt: new Date().toISOString(), release, featureVersion: "founder-operations-2026-11",
      checks: { dns, sourceStorage, backups: { status: "unverified",
        message: "Independent backup and restore-test coverage has not been verified. Saved HTML and version history are not proof of an off-host backup." } },
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
