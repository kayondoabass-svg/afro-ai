import { pool } from "./db";
import { Pool } from "pg";
import { storage } from "./storage";
import { removePublishedAppDns, purgePublishedAppCache } from "./cloudflare";
import { ProjectLifecycleError } from "./project-lifecycle";

export const DELETE_PENDING = "deletion-pending";
export const UNPUBLISHED = "customer-unpublished";
export const UNPUBLISH_PENDING = "unpublish-pending";

// Locks must not exhaust the pool used by storage queries while waiting.
const lockPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 45000 });
type Unlock = (() => Promise<void>) & { lockApp(id: number): Promise<() => Promise<void>> };
export async function lockPublishedApp(id: number, namespace = 72801) {
  const client = await lockPool.connect();
  try { await client.query("SELECT pg_advisory_lock($1::int, $2::int)", [namespace, id]); }
  catch (error) { client.release(); throw error; }
  const unlock = async () => {
    try { await client.query("SELECT pg_advisory_unlock($1::int, $2::int)", [namespace, id]); }
    finally { client.release(); }
  };
  (unlock as Unlock).lockApp = async appId => {
    await client.query("SELECT pg_advisory_lock($1::int, $2::int)", [72801, appId]);
    return async () => { await client.query("SELECT pg_advisory_unlock($1::int, $2::int)", [72801, appId]); };
  };
  return unlock as Unlock;
}

export const lockProject = (id: number) => lockPublishedApp(id, 72802);

export async function linkedPublicationIds(userId: string, projectId: number): Promise<number[]> {
  const result = await pool.query(
    `SELECT m.content FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.user_id = $1 AND c.project_id = $2 AND m.role = 'workbench-publication'`, [userId, projectId]);
  const ids = new Set<number>();
  for (const row of result.rows) {
    try {
      const value = JSON.parse(row.content);
      if (value.projectId === projectId && Number.isSafeInteger(value.publishedAppId) && value.publishedAppId > 0) ids.add(value.publishedAppId);
    } catch { /* Malformed legacy metadata is not permission to delete a site. */ }
  }
  return Array.from(ids);
}

export async function getAppLibrary(userId: string) {
  const [projects, publications, conversations, links] = await Promise.all([
    storage.getProjectsByUser(userId), storage.getPublishedAppsByUser(userId),
    pool.query("SELECT id, project_id FROM conversations WHERE user_id = $1 ORDER BY created_at, id", [userId]),
    pool.query(`SELECT m.content, c.project_id FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $1 AND m.role = 'workbench-publication' ORDER BY m.id DESC`, [userId]),
  ]);
  const publicationProjects = new Map<number, number>();
  for (const row of links.rows) {
    try {
      const value = JSON.parse(row.content);
      if (value.projectId === row.project_id && !publicationProjects.has(value.publishedAppId)) publicationProjects.set(value.publishedAppId, row.project_id);
    } catch {}
  }
  const ownedProjectIds = new Set(projects.map(project => project.id));
  const apps = projects.map(project => ({
    key: `project-${project.id}`, project,
    conversationId: conversations.rows.find(conversation => conversation.project_id === project.id)?.id ?? null,
    publishedApps: publications.filter(app => publicationProjects.get(app.id) === project.id),
  }));
  for (const app of publications) {
    if (!ownedProjectIds.has(publicationProjects.get(app.id)!)) {
      apps.push({ key: `publication-${app.id}`, project: null as any, conversationId: null, publishedApps: [app] });
    }
  }
  return { apps };
}

/** Fail closed at the origin first; retain metadata until all cleanup succeeds. */
export async function removePublishedApp(userId: string, id: number, unpublish = false, projectLock?: Unlock, actorId = userId, expectedReason?: string) {
  if (!Number.isSafeInteger(id) || id < 1) throw new ProjectLifecycleError(400, "Invalid app identifier.");
  const unlock = projectLock ? await projectLock.lockApp(id) : await lockPublishedApp(id);
  try {
    const app = await storage.getPublishedAppById(id);
    if (!app || app.userId !== userId) throw new ProjectLifecycleError(404, "Published app not found.");
    if (expectedReason && app.suspendReason !== expectedReason) throw new ProjectLifecycleError(409, "The pending operation changed. Refresh details before retrying.");
    if (unpublish && app.suspendReason === DELETE_PENDING) throw new ProjectLifecycleError(409, "Deletion is pending. Retry deletion instead.");
    const audit = async (action: string, reason: string) => {
      await pool.query(`INSERT INTO app_status_events(app_id,user_id,action,reason,actor_id,email_status)
        VALUES($1,$2,$3,$4,$5,'not_requested')`, [id, userId, action, reason, actorId]);
    };
    // Audit availability is a prerequisite, not permission to silently lose history.
    await audit(unpublish ? "unpublish_requested" : "deletion_requested",
      unpublish ? "Unpublish requested. Saved source will be retained." : "Existing explicit deletion request received.");
    await storage.updatePublishedApp(id, { appStatus: "suspended", suspendReason: unpublish ? UNPUBLISH_PENDING : DELETE_PENDING, suspendedAt: new Date() });
    let stage = "DNS";
    try {
      await removePublishedAppDns(app.subdomain);
      stage = "cache";
      await purgePublishedAppCache(app.subdomain);
      stage = "hosted content";
      if (unpublish) {
        await storage.updatePublishedApp(id, { appStatus: "suspended", suspendReason: UNPUBLISHED, cloudflareDnsRecordId: null });
      } else {
        await storage.deletePublishedApp(id, true);
      }
    } catch {
      await audit("cleanup_failed", `${stage} cleanup was not confirmed. Public serving remains blocked; saved records are retained for review.`);
      // Keep the app, resource keys and deletion marker for an idempotent retry.
      throw new ProjectLifecycleError(503, `Public serving is blocked, but ${stage} cleanup is incomplete. Review Cloudflare access or storage readiness before retrying. Saved records have been retained.`);
    }
    await audit("cleanup_completed", unpublish ? "Unpublish cleanup confirmed. Saved source and project retained." : "Requested publication cleanup confirmed.");
    return { id, subdomain: app.subdomain, offline: true, sourcePreserved: unpublish };
  } finally { await unlock(); }
}
