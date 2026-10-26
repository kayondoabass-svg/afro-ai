// In-memory runtime state shared between the auto-scan trigger route, the
// progress polling route, and the abort route. Tied to the process — fine for
// single-instance deployments. If we ever go multi-replica, move to Redis.

export type ScanProgress = {
  phase: "queued" | "crawl" | "extract" | "done" | "error" | "aborted";
  scanned: number;
  total: number;
  currentUrl?: string;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  result?: {
    pagesScanned: number;
    qasExtracted: number;
    qasDeduped: number;
    qasSensitive: number;
    qasInserted: number;
    qasSkippedUnchanged: number;
    topics: string[];
    mode: string;
  };
};

const progressByWidget = new Map<number, ScanProgress>();
const controllerByWidget = new Map<number, AbortController>();

// Per-user throttle: max 10 manual scans per rolling hour.
const userTimestamps = new Map<string, number[]>();
export const SCAN_HOURLY_LIMIT = 10;

export function registerScan(widgetId: number, controller: AbortController): ScanProgress {
  controllerByWidget.set(widgetId, controller);
  const p: ScanProgress = { phase: "queued", scanned: 0, total: 0, startedAt: Date.now() };
  progressByWidget.set(widgetId, p);
  return p;
}

export function updateProgress(widgetId: number, patch: Partial<ScanProgress>): void {
  const p = progressByWidget.get(widgetId);
  if (!p) return;
  Object.assign(p, patch);
}

export function getProgress(widgetId: number): ScanProgress | undefined {
  return progressByWidget.get(widgetId);
}

export function finishScan(widgetId: number, finalPatch: Partial<ScanProgress>): void {
  const p = progressByWidget.get(widgetId);
  if (p) {
    Object.assign(p, finalPatch, { finishedAt: Date.now() });
  }
  controllerByWidget.delete(widgetId);
  // Keep progress in memory for 5 min so the UI can read the final state, then evict.
  setTimeout(() => progressByWidget.delete(widgetId), 5 * 60_000);
}

export function abortScan(widgetId: number): boolean {
  const c = controllerByWidget.get(widgetId);
  if (!c) return false;
  c.abort();
  return true;
}

export function isScanRunning(widgetId: number): boolean {
  return controllerByWidget.has(widgetId);
}

export function recordScanForUser(userId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowMs = 60 * 60_000;
  const arr = (userTimestamps.get(userId) || []).filter((t) => now - t < windowMs);
  if (arr.length >= SCAN_HOURLY_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: arr[0] + windowMs };
  }
  arr.push(now);
  userTimestamps.set(userId, arr);
  return { allowed: true, remaining: SCAN_HOURLY_LIMIT - arr.length, resetAt: now + windowMs };
}
