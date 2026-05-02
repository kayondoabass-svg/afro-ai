import { db } from "./db";
import { sql } from "drizzle-orm";
import { runAutoScan } from "./chatbot-autoscan";
import { storage } from "./storage";

function escapeLiteral(s: string): string { return s.replace(/'/g, "''"); }

const TICK_MS = 5 * 60_000; // check every 5 minutes
const MAX_CONCURRENT = 2;

let running = 0;

function nextRunDate(frequency: string): Date {
  const now = Date.now();
  if (frequency === "daily") return new Date(now + 24 * 60 * 60_000);
  if (frequency === "weekly") return new Date(now + 7 * 24 * 60 * 60_000);
  return new Date(now + 30 * 24 * 60 * 60_000);
}

async function runOnce(widget: { id: number; userId: string; websiteUrl: string | null; scanFrequency: string }) {
  if (!widget.websiteUrl) return;
  const startedAt = Date.now();
  try {
    const result = await runAutoScan(widget.id, widget.websiteUrl, { maxPages: 20 });

    // Incremental insert: only Q&As whose page hash changed.
    const knownPages = await storage.getChatbotScannedPages(widget.id);
    const knownByUrl = new Map(knownPages.map((p) => [p.url, p.contentHash]));
    const rowsToInsert = result.rows.filter((r) => {
      if (!r.sourceUrl || !r.sourceHash) return true;
      return knownByUrl.get(r.sourceUrl) !== r.sourceHash;
    });

    const inserted = await storage.bulkInsertChatbotQas(rowsToInsert);
    for (const p of result.pageHashes) {
      await storage.upsertChatbotScannedPage(widget.id, p.url, p.hash);
    }

    const stats = {
      pagesScanned: result.pagesScanned,
      qasInserted: inserted.length,
      qasSensitive: result.qasSensitive,
      durationMs: Date.now() - startedAt,
      ranBy: "scheduler",
    };
    const next = nextRunDate(widget.scanFrequency).toISOString();
    const statsJson = escapeLiteral(JSON.stringify(stats));
    await db.execute(sql.raw(`
      UPDATE chatbot_widgets
      SET last_scan_at = NOW(),
          next_scan_at = '${next}'::timestamp,
          last_scan_stats = '${statsJson}'
      WHERE id = ${widget.id}
    `));
    console.log(`[scan-scheduler] widget ${widget.id}: ${inserted.length} new Q&As from ${result.pagesScanned} pages (${stats.durationMs}ms)`);
  } catch (e: any) {
    console.error(`[scan-scheduler] widget ${widget.id} failed:`, e?.message || e);
    // Push next run forward to avoid hammering a broken site.
    const next = nextRunDate(widget.scanFrequency).toISOString();
    const errJson = escapeLiteral(JSON.stringify({ error: String(e?.message || e), at: new Date().toISOString() }));
    await db.execute(sql.raw(`
      UPDATE chatbot_widgets
      SET next_scan_at = '${next}'::timestamp,
          last_scan_stats = '${errJson}'
      WHERE id = ${widget.id}
    `)).catch(() => {});
  }
}

async function tick() {
  try {
    if (running >= MAX_CONCURRENT) return;
    const slots = MAX_CONCURRENT - running;
    const result: any = await db.execute(sql.raw(`
      SELECT id, user_id AS "userId", website_url AS "websiteUrl", scan_frequency AS "scanFrequency"
      FROM chatbot_widgets
      WHERE scan_frequency IN ('daily', 'weekly')
        AND website_url IS NOT NULL
        AND (next_scan_at IS NULL OR next_scan_at <= NOW())
      ORDER BY COALESCE(next_scan_at, last_scan_at, '1970-01-01'::timestamp) ASC
      LIMIT ${slots}
    `));
    const due = (result.rows ?? result) as any[];
    for (const w of due) {
      running += 1;
      runOnce(w).finally(() => { running -= 1; });
    }
  } catch (e: any) {
    console.error("[scan-scheduler] tick error:", e?.message || e);
  }
}

export function startChatbotAutoScanScheduler() {
  setTimeout(() => { void tick(); }, 90_000);
  setInterval(() => { void tick(); }, TICK_MS);
  console.log("[scan-scheduler] Auto-scan scheduler started (5-min tick)");
}
