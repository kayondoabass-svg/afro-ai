import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { chatbotQas, chatbotScannedPages, chatbotWidgets } from "@shared/schema";
import type { ScanResult } from "./chatbot-autoscan";

export async function saveScan(widgetId: number, result: ScanResult, mode: "incremental" | "replace", signal?: AbortSignal) {
  if (!result.pagesScanned || !result.rows.length) {
    throw new Error("No usable Q&As extracted. Existing knowledge is unchanged.");
  }
  return db.transaction(async tx => {
    // The existing parent row is our concurrency lock. No new UNIQUE index or
    // destructive duplicate cleanup is needed on older customer databases.
    const widgets = await tx.select({ id: chatbotWidgets.id }).from(chatbotWidgets)
      .where(eq(chatbotWidgets.id, widgetId)).for("update");
    if (!widgets.length) throw new Error("Chatbot no longer exists");
    if (signal?.aborted) throw new Error("Scan cancelled");
    const known = await tx.select().from(chatbotScannedPages).where(eq(chatbotScannedPages.widgetId, widgetId));
    const hashes = new Map(known.map(p => [p.url, p.contentHash]));
    const rows = mode === "replace" ? result.rows : result.rows.filter(r =>
      !r.sourceUrl || hashes.get(r.sourceUrl) !== r.sourceHash);
    if (mode === "replace") await tx.delete(chatbotQas).where(eq(chatbotQas.widgetId, widgetId));
    let inserted = 0;
    for (const row of rows) {
      // Do not accidentally persist a Q&A into a different customer's widget.
      if (row.widgetId !== widgetId) throw new Error("Scan ownership mismatch");
      const matches = mode === "incremental" && row.sourceUrl
        ? await tx.select().from(chatbotQas).where(and(
          eq(chatbotQas.widgetId, widgetId), eq(chatbotQas.sourceUrl, row.sourceUrl), eq(chatbotQas.question, row.question)))
        : [];
      if (matches.length) {
        for (const existing of matches) await tx.update(chatbotQas).set({
          answer: row.answer, topic: row.topic, sourceHash: row.sourceHash,
          sensitive: row.sensitive, sensitiveReason: row.sensitiveReason,
          included: existing.included && row.included !== false,
          embedding: null, updatedAt: new Date(),
        }).where(and(eq(chatbotQas.id, existing.id), eq(chatbotQas.widgetId, widgetId)));
      } else {
        await tx.insert(chatbotQas).values(row);
        inserted++;
      }
    }
    for (const page of result.pageHashes) {
      const updated = await tx.update(chatbotScannedPages).set({ contentHash: page.hash, scannedAt: new Date() })
        .where(and(eq(chatbotScannedPages.widgetId, widgetId), eq(chatbotScannedPages.url, page.url)))
        .returning({ id: chatbotScannedPages.id });
      if (!updated.length) await tx.insert(chatbotScannedPages).values({ widgetId, url: page.url, contentHash: page.hash });
    }
    if (signal?.aborted) throw new Error("Scan cancelled");
    return { inserted, skipped: result.rows.length - rows.length };
  });
}
