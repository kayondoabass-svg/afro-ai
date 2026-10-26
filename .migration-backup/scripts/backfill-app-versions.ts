/**
 * One-shot backfill: give every existing conversation a baseline Version 1
 * from the latest HTML found in its assistant messages.
 *
 * Why: before the fenced-block save fix landed, only conversations whose AI
 * response contained a literal <!DOCTYPE html ... </html> got snapshots. Every
 * other older project is sitting on a chat full of generated HTML with zero
 * rows in app_versions, so their new Undo button has nothing to undo back to.
 *
 * Safe to re-run: only inserts when a conversation has HTML AND zero existing
 * versions. Idempotent.
 *
 * Run on the droplet:
 *   cd /opt/afro-ai && npx tsx scripts/backfill-app-versions.ts
 */

import { db } from "../server/db";
import { conversations, messages, appVersions } from "../shared/models/chat";
import { eq, desc, asc, sql } from "drizzle-orm";

function extractHtml(content: string): string | null {
  const fenceRe = /```(\w+)?\n([\s\S]*?)```/g;
  const candidates: { lang: string; code: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(content)) !== null) {
    candidates.push({ lang: (m[1] || "").toLowerCase(), code: m[2] });
  }
  const htmlBlock = candidates.find(c => c.lang === "html" || c.lang === "htm");
  if (htmlBlock) return htmlBlock.code.trim();
  const looksHtml = candidates.find(c =>
    /<!doctype html|<html\b|<body\b|<div\b|<section\b/i.test(c.code)
  );
  if (looksHtml) return looksHtml.code.trim();
  if (/<!doctype html|<html\b/i.test(content)) return content.trim();
  const fullDoc = content.match(/<!DOCTYPE html[\s\S]*?<\/html>/i);
  if (fullDoc) return fullDoc[0];
  return null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`\n=== app_versions backfill ${dryRun ? "(DRY RUN)" : "(LIVE)"} ===\n`);

  // Find conversations that have ZERO rows in app_versions.
  // (LEFT JOIN + IS NULL is the standard "find rows missing in B" idiom.)
  const targets = await db
    .select({ id: conversations.id, userId: conversations.userId, title: conversations.title })
    .from(conversations)
    .leftJoin(appVersions, eq(appVersions.conversationId, conversations.id))
    .where(sql`${appVersions.id} IS NULL`)
    .groupBy(conversations.id, conversations.userId, conversations.title);

  console.log(`Found ${targets.length} conversation(s) with no snapshots yet.\n`);

  let withHtml = 0;
  let withoutHtml = 0;
  let inserted = 0;
  let errors = 0;

  for (const conv of targets) {
    try {
      // Walk assistant messages newest-first; take the first one containing HTML.
      const msgs = await db
        .select({ id: messages.id, content: messages.content, createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt));

      const assistantWithHtml = msgs
        .map(m => ({ ...m, html: extractHtml(m.content) }))
        .find(m => m.html && m.html.length > 50);

      if (!assistantWithHtml || !assistantWithHtml.html) {
        withoutHtml++;
        continue;
      }
      withHtml++;

      if (dryRun) {
        console.log(
          `  [dry] conv #${conv.id} (${conv.userId || "no-user"}) — would save ${assistantWithHtml.html.length} bytes from msg #${assistantWithHtml.id}`
        );
        continue;
      }

      // Use the message's createdAt as the snapshot timestamp so the version's
      // history matches when the AI actually generated the code.
      await db.insert(appVersions).values({
        conversationId: conv.id,
        htmlContent: assistantWithHtml.html,
        label: "Version 1 (recovered)",
      });
      inserted++;
      if (inserted % 25 === 0) console.log(`  ... ${inserted} inserted`);
    } catch (err) {
      errors++;
      console.error(`  ! conv #${conv.id} failed:`, (err as Error).message);
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Conversations scanned       : ${targets.length}`);
  console.log(`  Had HTML in messages        : ${withHtml}`);
  console.log(`  No HTML found (skipped)     : ${withoutHtml}`);
  console.log(`  Snapshots inserted          : ${dryRun ? `0 (dry-run; would insert ${withHtml})` : inserted}`);
  if (errors) console.log(`  Errors                      : ${errors}`);
  console.log("");

  process.exit(0);
}

main().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
