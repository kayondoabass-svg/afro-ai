import { db } from "./db";
import { sql } from "drizzle-orm";
import { PLAN_RETENTION_DAYS } from "./chatbot-limits";
import { FOUNDER_EMAILS } from "./replit_integrations/auth/storage";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function runRetentionPass() {
  try {
    let totalDeleted = 0;
    // Founders are never trimmed — they get unlimited retention
    const founderList = FOUNDER_EMAILS.map((e) => `'${e.replace(/'/g, "''")}'`).join(",") || "''";

    for (const [plan, days] of Object.entries(PLAN_RETENTION_DAYS)) {
      const result = await db.execute(sql.raw(`
        DELETE FROM widget_conversations
        WHERE updated_at < NOW() - INTERVAL '${days} days'
          AND widget_id IN (
            SELECT w.id FROM chatbot_widgets w
            JOIN users u ON u.id = w.user_id
            LEFT JOIN chatbot_subscriptions s
              ON s.user_id = w.user_id AND s.status = 'active'
            WHERE COALESCE(s.plan, 'starter') = '${plan}'
              AND (u.email IS NULL OR u.email NOT IN (${founderList}))
          )
      `));
      const n = (result as any).rowCount ?? 0;
      totalDeleted += n;
    }
    if (totalDeleted > 0) {
      console.log(`[chatbot-retention] Trimmed ${totalDeleted} old conversations`);
    }
  } catch (e: any) {
    console.error("[chatbot-retention] error:", e?.message || e);
  }
}

export function startChatbotRetentionJob() {
  setTimeout(() => { void runRetentionPass(); }, 60_000);
  setInterval(() => { void runRetentionPass(); }, ONE_DAY_MS);
  console.log("[chatbot-retention] Daily conversation cleanup scheduled");
}
