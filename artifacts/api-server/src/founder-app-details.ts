import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { publicationLinkSql } from "./founder-records";
import { FREE_HOSTING_DAYS } from "./app-suspension-policy";
import { removePublishedApp } from "./app-management";
import { ProjectLifecycleError } from "./project-lifecycle";

/** Founder-only, explicit metadata projection. No HTML/source, credentials or payment payloads. */
export async function founderAppDetails(appId: number) {
  const { rows } = await pool.query(`SELECT id,title,subdomain,custom_domain AS "customDomain",
    app_status AS "appStatus",suspend_reason AS "suspendReason",suspended_at AS "suspendedAt",
    created_at AS "createdAt",updated_at AS "updatedAt",user_id
    FROM published_apps WHERE id=$1`, [appId]);
  const row = rows[0];
  if (!row) return null;
  const { user_id: ownerId, ...app } = row;
  const unavailableSections: string[] = [];
  const optional = async (name: string, sql: string, params: unknown[]) => {
    try { return (await pool.query(sql, params)).rows; }
    catch { unavailableSections.push(name); return null; }
  };
  const [owners, projects, payments, ussd, ussdApps, events, source] = await Promise.all([
    optional("owner", `SELECT id,email,first_name AS "firstName",last_name AS "lastName",plan FROM users WHERE id=$1`, [ownerId]),
    optional("projects", `SELECT p.id,p.name,p.type,p.status FROM projects p
      WHERE p.user_id=$2 AND p.id IN (SELECT links.project_id FROM published_apps a
      CROSS JOIN LATERAL (${publicationLinkSql}) links WHERE a.id=$1 AND a.user_id=$2)`, [appId, ownerId]),
    optional("payments", `SELECT id,plan,amount,currency,status,payment_method,created_at
      FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 25`, [ownerId]),
    optional("ussd", `SELECT id,plan,status,activated_at,expires_at,created_at FROM ussd_subscriptions
      WHERE user_id=$1 ORDER BY created_at DESC LIMIT 25`, [ownerId]),
    optional("ussdApps", `SELECT id,name,is_active,sessions_used,created_at FROM ussd_apps
      WHERE user_id=$1 ORDER BY created_at DESC LIMIT 25`, [ownerId]),
    optional("events", `SELECT id,action,reason,actor_id,created_at,email_status,email_error,provider,provider_message_id
      FROM app_status_events WHERE app_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 50`, [appId, ownerId]),
    optional("source", `SELECT octet_length(a.html_content)::int AS "htmlBytes",
      (SELECT count(*)::int FROM app_versions v JOIN conversations c ON c.id=v.conversation_id
       WHERE c.user_id=$2 AND c.project_id IN (
         SELECT links.project_id FROM published_apps a
         CROSS JOIN LATERAL (${publicationLinkSql}) links WHERE a.id=$1 AND a.user_id=$2
       )) AS "snapshotCount"
      FROM published_apps a WHERE a.id=$1 AND a.user_id=$2`, [appId, ownerId]),
  ]);
  return {
    app, owner: owners?.[0] ?? null, projects, payments, ussd, ussdApps, events, unavailableSections,
    source: { htmlBytes: source?.[0]?.htmlBytes ?? null, snapshotCount: source?.[0]?.snapshotCount ?? null,
      linkedProjects: projects ? projects.length : null,
      message: "Metadata only. Saved HTML does not prove Files or external assets are complete. Owners can use My Apps → Recover source; existing manual edits must be preserved. No backup or recovery was performed by this lookup." },
    relatedRecordsScope: "Payments and USSD records belong to this owner; they are not proof of an app-specific purchase or gateway connection.",
    historyNote: "History records new status changes only. Older suspensions may have a saved reason and time but no recorded actor or notification.",
    hosting: { freePeriodDays: FREE_HOSTING_DAYS, projectPreserved: true,
      dailyAllowance: "Existing daily free limits and midnight reset are unchanged." },
  };
}
export function registerFounderAppDetails(app: Express, isFounder: RequestHandler) {
  app.post("/api/admin/published-apps/:id/retry-unpublish", isFounder, async (req: any, res) => {
    res.set("Cache-Control", "private, no-store");
    const raw = String(req.params.id);
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || req.body?.confirm !== true) {
      res.status(400).json({ message: "A valid app ID and explicit confirmation are required." }); return;
    }
    try {
      const { rows } = await pool.query("SELECT id,user_id,suspend_reason FROM published_apps WHERE id=$1", [Number(raw)]);
      if (!rows.length) { res.status(404).json({ message: "App not found." }); return; }
      if (rows[0].suspend_reason !== "unpublish-pending") {
        res.status(409).json({ message: "Only an existing pending unpublish can be retried. No app was changed." }); return;
      }
      const actor = req.user?.claims?.sub;
      if (!actor) { res.status(401).json({ message: "A signed-in founder is required." }); return; }
      res.json(await removePublishedApp(rows[0].user_id, rows[0].id, true, undefined, actor, "unpublish-pending"));
    } catch (error) {
      res.status(error instanceof ProjectLifecycleError ? error.status : 503).json({
        message: error instanceof ProjectLifecycleError ? error.message : "Cleanup could not be confirmed. No reactivation or saved-project deletion was attempted.",
      });
    }
  });
  app.get("/api/admin/published-apps/:id/details", isFounder, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const raw = String(req.params.id);
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
      res.status(400).json({ message: "Invalid app ID." }); return;
    }
    try {
      const details = await founderAppDetails(Number(raw));
      if (!details) { res.status(404).json({ message: "App not found." }); return; }
      res.json(details);
    } catch { res.status(503).json({ message: "App details are temporarily unavailable. No records were changed." }); }
  });
}
