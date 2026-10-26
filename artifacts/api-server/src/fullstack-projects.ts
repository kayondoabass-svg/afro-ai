import { Client } from "pg";
import { storage } from "./storage";
import { requireFullstackAccess } from "./fullstack-access";
import { fullstackStarterFiles } from "./fullstack-starter";
import { ProjectFileError } from "./project-file-policy";
import { seedMissingProjectFiles } from "./project-files";
import type { InsertProject } from "@shared/schema";

export class FullstackSetupError extends Error {
  constructor(public project: { id: number; status: string }) {
    super("Starter setup could not finish. Your project was kept. Use Retry setup; existing files will not be overwritten.");
  }
}

export async function createFullstackProject(input: InsertProject) {
  await requireFullstackAccess(input.userId);
  const project = await storage.createProject({ ...input, type: "fullstack", status: "initializing" });
  try { return await initializeFullstackProject(input.userId, project.id); }
  catch (error) {
    if (error instanceof FullstackSetupError) throw error;
    throw new FullstackSetupError({ id: project.id, status: "setup_failed" });
  }
}

export async function initializeFullstackProject(userId: string, projectId: number) {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new ProjectFileError(400, "invalid project");
  await requireFullstackAccess(userId);
  // Dedicated lock connection prevents lock holders from exhausting the app pool.
  const connection = new Client({ connectionString: process.env.DATABASE_URL });
  await connection.connect();
  let ownsProject = false;
  let locked = false;
  try {
    const lock = await connection.query("SELECT pg_try_advisory_lock($1, $2) AS locked", [73641, projectId]);
    locked = lock.rows[0]?.locked === true;
    if (!locked) throw new ProjectFileError(409, "Project setup is already running. Reload shortly.");
    const found = await connection.query("SELECT * FROM projects WHERE id = $1 AND user_id = $2 AND type = 'fullstack'", [projectId, userId]);
    if (!found.rows.length) throw new ProjectFileError(404, "project not found");
    ownsProject = true;
    // Completed projects are never re-seeded: intentionally deleted files stay deleted.
    if (found.rows[0].status === "draft") return storage.getProject(projectId);
    await connection.query("UPDATE projects SET status = 'initializing' WHERE id = $1", [projectId]);
    let { rows } = await connection.query("SELECT id FROM conversations WHERE project_id = $1 AND user_id = $2 ORDER BY id LIMIT 1", [projectId, userId]);
    if (!rows.length) {
      ({ rows } = await connection.query("INSERT INTO conversations (title, project_id, user_id) VALUES ($1, $2, $3) RETURNING id",
        [found.rows[0].name, projectId, userId]));
    }
    await seedMissingProjectFiles(userId, rows[0].id, fullstackStarterFiles());
    await connection.query("UPDATE projects SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [projectId]);
    return storage.getProject(projectId);
  } catch (error) {
    if (!ownsProject) throw error;
    await connection.query("UPDATE projects SET status = 'setup_failed' WHERE id = $1 AND user_id = $2", [projectId, userId]).catch(() => {});
    throw new FullstackSetupError({ id: projectId, status: "setup_failed" });
  } finally {
    // Closing releases the advisory lock even after an error.
    await connection.end().catch(() => {});
  }
}