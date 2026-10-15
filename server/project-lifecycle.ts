import type { PoolClient } from "pg";
import { pool } from "./db";
import type { Project } from "@shared/schema";
import { extractWebsiteHtml } from "@shared/html-extraction";

export class ProjectLifecycleError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type ProjectLink = { project: Project; conversationId: number; sourceSyncWarning?: string };
function project(row: any): Project {
  return { id: row.id, userId: row.user_id, name: row.name, description: row.description,
    type: row.type, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}
function positiveId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new ProjectLifecycleError(400, "Invalid source identifier.");
  return id;
}
async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
async function linkConversation(client: PoolClient, userId: string, conversationId: number, name?: string): Promise<ProjectLink> {
  const { rows } = await client.query("SELECT * FROM conversations WHERE id = $1 AND user_id = $2 FOR UPDATE", [conversationId, userId]);
  const conversation = rows[0];
  if (!conversation) throw new ProjectLifecycleError(404, "Source conversation not found.");
  if (conversation.project_id) {
    const existing = await client.query("SELECT * FROM projects WHERE id = $1 AND user_id = $2", [conversation.project_id, userId]);
    if (!existing.rows[0]) throw new ProjectLifecycleError(404, "Project not found.");
    return { project: project(existing.rows[0]), conversationId };
  }
  const title = (name || conversation.title || "My website").trim().slice(0, 160) || "My website";
  const created = await client.query(
    "INSERT INTO projects (user_id, name, type, status) VALUES ($1, $2, 'website', 'draft') RETURNING *", [userId, title],
  );
  await client.query("UPDATE conversations SET project_id = $1 WHERE id = $2 AND user_id = $3",
    [created.rows[0].id, conversationId, userId]);
  return { project: project(created.rows[0]), conversationId };
}

// Existing conversations and workbench metadata provide durable source links:
// no new database, schema replacement or title-based ownership matching.
export function ensureConversationProject(userId: string, conversationId: number, name?: string) {
  return transaction(client => linkConversation(client, userId, positiveId(conversationId), name));
}

export async function validatePublishConversation(userId: string, conversationId: unknown) {
  if (conversationId == null) return undefined;
  const id = positiveId(conversationId);
  const { rows } = await pool.query("SELECT id FROM conversations WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!rows.length) throw new ProjectLifecycleError(404, "Source conversation not found.");
  return id;
}

export function ensurePublishedProject(userId: string, publishedAppId: number, preferredConversationId?: number): Promise<ProjectLink> {
  return transaction(async client => {
    const appResult = await client.query("SELECT * FROM published_apps WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [positiveId(publishedAppId), userId]);
    const app = appResult.rows[0];
    if (!app) throw new ProjectLifecycleError(404, "Published site not found.");
    const links = await client.query(
      "SELECT m.content, c.id, c.project_id FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = $1 AND m.role = 'workbench-publication' ORDER BY m.id DESC", [userId],
    );
    const existing = links.rows.find(row => {
      try { return JSON.parse(row.content).publishedAppId === app.id; } catch { return false; }
    });
    if (existing) {
      if (preferredConversationId && existing.id !== preferredConversationId) {
        const requested = await client.query("SELECT project_id FROM conversations WHERE id = $1 AND user_id = $2", [preferredConversationId, userId]);
        if (!requested.rows[0]?.project_id || requested.rows[0].project_id !== existing.project_id) {
          throw new ProjectLifecycleError(409, "This live site belongs to another project. Open its saved project to edit it.");
        }
      }
      return linkConversation(client, userId, existing.id);
    }
    const html = extractWebsiteHtml(app.html_content);
    if (!html) throw new ProjectLifecycleError(409, "No recoverable website source was found.");
    let conversationId = preferredConversationId;
    if (!conversationId) {
      // Only unambiguous exact saved source can identify a legacy conversation.
      const candidates = await client.query(
        "SELECT DISTINCT c.id FROM conversations c JOIN app_versions v ON v.conversation_id = c.id WHERE c.user_id = $1 AND v.html_content = $2 LIMIT 2", [userId, html],
      );
      if (candidates.rows.length === 1) conversationId = candidates.rows[0].id;
    }
    if (!conversationId) {
      const created = await client.query("INSERT INTO conversations (title, user_id) VALUES ($1, $2) RETURNING id", [app.title || "Recovered website", userId]);
      conversationId = created.rows[0].id;
      await client.query("INSERT INTO app_versions (conversation_id, html_content, label) VALUES ($1, $2, 'Recovered published source')", [conversationId, html]);
      await client.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)",
        [conversationId, `Recovered the saved source of your published website. You can continue editing it here.\n\n\`\`\`html\n${html}\n\`\`\``]);
    }
    const linked = await linkConversation(client, userId, conversationId!, app.title);
    const snapshots = await client.query("SELECT id FROM app_versions WHERE conversation_id = $1 AND html_content = $2 LIMIT 1", [linked.conversationId, html]);
    if (!snapshots.rows.length) {
      await client.query("INSERT INTO app_versions (conversation_id, html_content, label) VALUES ($1, $2, 'Published source')", [linked.conversationId, html]);
    }
    await client.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'workbench-publication', $2)",
      [linked.conversationId, JSON.stringify({ publishedAppId: app.id, projectId: linked.project.id })]);
    await client.query("UPDATE projects SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2",
      [linked.project.id, userId]);
    linked.project.status = "published";
    return linked;
  });
}

export async function reconcilePublishedProjects(userId: string) {
  const { rows } = await pool.query("SELECT id FROM published_apps WHERE user_id = $1 ORDER BY id", [userId]);
  const projects: ProjectLink[] = [];
  let failures = 0;
  for (const app of rows) {
    try {
      const linked = await recoverPublishedProject(userId, app.id);
      projects.push(linked);
      if (linked.sourceSyncWarning) failures++;
    }
    catch { failures++; }
  }
  return { projects, failures };
}

export async function recoverPublishedProject(userId: string, publishedAppId: number, preferredConversationId?: number): Promise<ProjectLink> {
  const linked = await ensurePublishedProject(userId, publishedAppId, preferredConversationId);
  try {
    const { listProjectFiles } = await import("./project-files");
    const files = await listProjectFiles(userId, linked.conversationId);
    if (!files.some(file => file.path.toLowerCase() === "index.html")) {
      const { syncGeneratedSource } = await import("./project-source-sync");
      await syncGeneratedSource(userId, linked.conversationId);
    }
  } catch {
    linked.sourceSyncWarning = "Your project and website snapshot are saved, but Files could not be synchronized. Open the project to retry source sync.";
  }
  return linked;
}
