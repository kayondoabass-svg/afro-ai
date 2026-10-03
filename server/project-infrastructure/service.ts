import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { pool } from "../db";
import { fullstackAccess, requireFullstackAccess } from "../fullstack-access";
import { ProjectFileError } from "../project-file-policy";
import { listProjectFiles, applyProjectFileChanges } from "../project-files";
import * as provider from "./provider";
import { HOSTING, INFRASTRUCTURE_LIMITS, INITIAL_SQL, INITIAL_CHECKSUM, checkInitialMigration, configuredWrangler, managedDatabaseSetupEnabled } from "./policy";

type OwnerProject = { id: number; user_id: string; name: string; status: string };
type Infra = {
  project_id: number; user_id: string; database_name: string; database_id: string | null;
  create_attempted: boolean; state: string; migrations_applied: number; last_error: string | null;
};
type Sql = Pick<Client, "query">;

async function ownedProject(sql: Sql, userId: string, id: number): Promise<OwnerProject> {
  if (!userId) throw new ProjectFileError(401, "Sign in to continue.");
  if (!Number.isSafeInteger(id) || id <= 0) throw new ProjectFileError(400, "Invalid project.");
  const { rows } = await sql.query("SELECT id, user_id, name, status FROM projects WHERE id = $1 AND user_id = $2 AND type = 'fullstack'", [id, userId]);
  if (!rows.length) throw new ProjectFileError(404, "Project not found.");
  return rows[0];
}

async function record(sql: Sql, userId: string, id: number): Promise<Infra | undefined> {
  const { rows } = await sql.query("SELECT * FROM project_infrastructure WHERE project_id = $1 AND user_id = $2", [id, userId]);
  return rows[0];
}

export async function infrastructureView(userId: string, id: number) {
  await ownedProject(pool, userId, id);
  const item = await record(pool, userId, id);
  const access = await fullstackAccess(userId);
  return {
    state: item?.state ?? "not_provisioned", databaseName: item?.database_name ?? null,
    lastError: item?.last_error ?? null, migrationsApplied: item?.migrations_applied ?? 0,
    canProvision: access.allowed && managedDatabaseSetupEnabled(), setupAvailable: managedDatabaseSetupEnabled(), configured: provider.infrastructureConfigured(),
    limits: INFRASTRUCTURE_LIMITS, hosting: HOSTING,
  };
}

async function withProjectLock<T>(userId: string, id: number, work: (sql: Client, project: OwnerProject) => Promise<T>) {
  // Check ownership BEFORE lock attempts or provider requests; foreign IDs always return 404.
  await ownedProject(pool, userId, id);
  const connection = new Client({ connectionString: process.env.DATABASE_URL });
  await connection.connect();
  try {
    const userLock = await connection.query("SELECT pg_try_advisory_lock(hashtext($1), 94117) AS locked", [userId]);
    if (!userLock.rows[0]?.locked) throw new ProjectFileError(409, "Another database operation is running for this account. Try again shortly.");
    const projectLock = await connection.query("SELECT pg_try_advisory_lock(73641, $1) AS locked", [id]);
    if (!projectLock.rows[0]?.locked) throw new ProjectFileError(409, "Project setup is already running. Try again shortly.");
    return await work(connection, await ownedProject(connection, userId, id));
  } finally { await connection.end().catch(() => {}); }
}

async function audit(sql: Sql, userId: string, id: number, action: string) {
  await sql.query("INSERT INTO project_infrastructure_events (project_id, user_id, action) VALUES ($1, $2, $3)", [id, userId, action]);
}

async function updateState(sql: Sql, userId: string, id: number, state: string, error: string | null = null) {
  await sql.query("UPDATE project_infrastructure SET state = $3, last_error = $4, updated_at = CURRENT_TIMESTAMP WHERE project_id = $1 AND user_id = $2", [id, userId, state, error]);
}

export async function provisionInfrastructure(userId: string, id: number) {
  await withProjectLock(userId, id, async (sql, project) => {
    if (!managedDatabaseSetupEnabled()) throw new ProjectFileError(503, "Managed database setup is deferred. Export your project to GitHub and use your own hosting provider.");
    await requireFullstackAccess(userId);
    if (project.status !== "draft") throw new ProjectFileError(409, "Finish source-file setup before creating the database.");
    if (!provider.infrastructureConfigured()) throw new ProjectFileError(503, "Project database credentials are not configured.");
    let item = await record(sql, userId, id);
    if (item?.state === "deleting") throw new ProjectFileError(409, "Finish deleting this database before creating another.");
    const { rows: attempts } = await sql.query("SELECT count(*)::int AS total FROM project_infrastructure_events WHERE user_id = $1 AND action = 'provision' AND created_at >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')", [userId]);
    if (attempts[0].total >= INFRASTRUCTURE_LIMITS.provisionsPerDay) throw new ProjectFileError(429, "Daily database setup limit reached. Try again tomorrow.");
    if (!item || item.state === "deleted") {
      const { rows: count } = await sql.query("SELECT count(*)::int AS total FROM project_infrastructure WHERE user_id = $1 AND state <> 'deleted'", [userId]);
      if (count[0].total >= INFRASTRUCTURE_LIMITS.databasesPerUser) throw new ProjectFileError(409, "Database limit reached. Delete an unused project database first.");
      // No automatic recreation of deleted resources: users retain source and can create a new project.
      if (item?.state === "deleted") throw new ProjectFileError(409, "This project's database was deleted. Create a new project to start a new database.");
      const name = `afro-project-${id}-${randomBytes(12).toString("hex")}`;
      const created = await sql.query("INSERT INTO project_infrastructure (project_id, user_id, database_name, state) VALUES ($1, $2, $3, 'provisioning') RETURNING *", [id, userId, name]);
      item = created.rows[0];
    }
    await audit(sql, userId, id, "provision");
    await updateState(sql, userId, id, "provisioning");
    const resource = item!;
    try {
      const conversations = await sql.query("SELECT id FROM conversations WHERE project_id = $1 AND user_id = $2 ORDER BY id LIMIT 1", [id, userId]);
      if (!conversations.rows[0]) throw new ProjectFileError(409, "Project source conversation is missing. Retry starter setup first.");
      const conversationId = conversations.rows[0].id;
      const files = await listProjectFiles(userId, conversationId);
      checkInitialMigration(files);
      // Check for user config conflicts before making a new paid resource.
      configuredWrangler(files, resource.database_name, resource.database_id || "00000000-0000-0000-0000-000000000000");
      let database = resource.database_id
        ? await provider.verifyDatabase(resource.database_id, resource.database_name)
        : await provider.findDatabase(resource.database_name);
      if (!database) {
        if (resource.database_id || resource.create_attempted) {
          throw new ProjectFileError(409, "A previous database operation could not be confirmed. Automatic creation is paused to avoid duplicates; ask the administrator to reconcile it.");
        }
        await sql.query("UPDATE project_infrastructure SET create_attempted = TRUE WHERE project_id = $1 AND user_id = $2", [id, userId]);
        database = await provider.createDatabase(resource.database_name);
      }
      provider.validateDatabaseIdentity(database, resource.database_name, resource.database_id);
      await sql.query("UPDATE project_infrastructure SET database_id = $3 WHERE project_id = $1 AND user_id = $2", [id, userId, database.uuid]);
      // Only an audited, idempotent initial migration runs. No customer SQL endpoint exists.
      await provider.queryDatabase(database.uuid, "CREATE TABLE IF NOT EXISTS __afro_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL)");
      const applied = await provider.queryDatabase(database.uuid, "SELECT checksum FROM __afro_migrations WHERE id = ?", ["0001_initial"]);
      if (applied.length && applied[0].checksum !== INITIAL_CHECKSUM) throw new ProjectFileError(409, "Migration checksum mismatch. No schema changes were applied.");
      if (!applied.length) {
        await provider.queryDatabase(database.uuid, INITIAL_SQL);
        await provider.queryDatabase(database.uuid, "INSERT OR IGNORE INTO __afro_migrations (id, checksum) VALUES (?, ?)", ["0001_initial", INITIAL_CHECKSUM]);
      }
      const health = await provider.queryDatabase(database.uuid, "SELECT message FROM app_messages WHERE id = ?", [1]);
      if (typeof health[0]?.message !== "string") throw new ProjectFileError(503, "Database health check failed.");
      const fresh = await listProjectFiles(userId, conversationId);
      const change = configuredWrangler(fresh, database.name, database.uuid);
      if (change.before.content !== change.file.content) {
        await applyProjectFileChanges(userId, String(conversationId), [change]);
      }
      await sql.query("UPDATE project_infrastructure SET migrations_applied = 1 WHERE project_id = $1 AND user_id = $2", [id, userId]);
      await updateState(sql, userId, id, "ready");
      await audit(sql, userId, id, "database_ready");
    } catch (error) {
      const message = error instanceof ProjectFileError ? error.message : "Database setup failed. Retry safely from this project.";
      await updateState(sql, userId, id, "failed", message).catch(() => {});
      throw error instanceof ProjectFileError ? error : new ProjectFileError(503, message);
    }
  });
  return infrastructureView(userId, id);
}

export async function deleteInfrastructure(userId: string, id: number, confirmation: unknown) {
  await withProjectLock(userId, id, async (sql, project) => {
    // Owners can delete their resources after paid access expires. No billing bypass elsewhere.
    if (typeof confirmation !== "string" || confirmation !== project.name) throw new ProjectFileError(400, "Type the exact project name to confirm permanent database deletion.");
    const item = await record(sql, userId, id);
    if (!item || item.state === "deleted") return;
    await updateState(sql, userId, id, "deleting");
    try {
      const database = item.database_id
        ? await provider.verifyDatabase(item.database_id, item.database_name)
        : await provider.findDatabase(item.database_name);
      if (database) {
        provider.validateDatabaseIdentity(database, item.database_name, item.database_id);
        await provider.deleteDatabase(database.uuid, item.database_name);
      } else if (item.create_attempted && !item.database_id) {
        throw new ProjectFileError(409, "The earlier create operation is unresolved. Ask the administrator to reconcile it before deletion.");
      }
      await updateState(sql, userId, id, "deleted");
      await audit(sql, userId, id, "database_deleted");
    } catch (error) {
      const message = error instanceof ProjectFileError ? error.message : "Database deletion was not confirmed. Retry deletion.";
      await updateState(sql, userId, id, "deleting", message).catch(() => {});
      throw error instanceof ProjectFileError ? error : new ProjectFileError(503, message);
    }
  });
  return infrastructureView(userId, id);
}

/** FK + shared advisory lock prevent ordinary project deletion from orphaning resources. */
export async function deleteFullstackProject(userId: string, id: number) {
  await withProjectLock(userId, id, async (sql) => {
    const item = await record(sql, userId, id);
    if (item && item.state !== "deleted") throw new ProjectFileError(409, "Delete this project's database from Database setup before deleting the project.");
    await sql.query("BEGIN");
    try {
      await sql.query("DELETE FROM project_infrastructure WHERE project_id = $1 AND user_id = $2 AND state = 'deleted'", [id, userId]);
      await sql.query("DELETE FROM projects WHERE id = $1 AND user_id = $2 AND type = 'fullstack'", [id, userId]);
      await sql.query("COMMIT");
    } catch (error) { await sql.query("ROLLBACK"); throw error; }
  });
}