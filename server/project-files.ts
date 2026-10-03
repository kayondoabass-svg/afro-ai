import { d1Query, isD1Configured } from "./d1";
import { chatStorage } from "./replit_integrations/chat/storage";
import { ProjectFileError, validateProjectFiles, type ProjectFile } from "./project-file-policy";
import { indexWorkspaceFiles } from "./workspace-search";
export { ProjectFileError, validateProjectFiles, type ProjectFile } from "./project-file-policy";

export async function assertProjectFileOwnership(userId: string, conversationId: string | number): Promise<string> {
  if (typeof userId !== "string" || !userId) throw new ProjectFileError(401, "authentication required");
  const id = String(conversationId);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new ProjectFileError(400, "invalid conversation");
  const conversation = await chatStorage.getConversation(Number(id));
  if (!conversation || conversation.userId !== userId) throw new ProjectFileError(404, "conversation not found");
  if (conversation.projectId) {
    const { guardFullstackProject } = await import("./fullstack-access");
    await guardFullstackProject(userId, conversation.projectId);
  }
  return id;
}

async function query(sql: string, params: unknown[] = []) {
  if (!isD1Configured()) throw new ProjectFileError(503, "project file storage unavailable");
  try { return await d1Query(sql, params); }
  catch { throw new ProjectFileError(503, "project file storage operation failed"); }
}

export async function initializeProjectFiles(binary = false) {
  // Requests must never perform DDL. Operators apply migrations separately;
  // legacy reads/deletes remain available even when command writes are gated.
  const { results } = await query("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN ('project_file_command_apply', 'project_file_command_apply_binary')");
  if (!results.length) throw new ProjectFileError(503, "project file migration 002 required");
  if (binary && !results.some(row => row.name === "project_file_command_apply_binary")) {
    throw new ProjectFileError(503, "project file migration 003 required");
  }
}

export async function listProjectFileRecords(userId: string, conversationId: string | number) {
  const id = await assertProjectFileOwnership(userId, conversationId);
  const { results } = await query("SELECT * FROM project_files WHERE user_id = ? AND conversation_id = ? ORDER BY path", [userId, id]);
  const records = results.map(row => row.encoding === null ? { ...row, encoding: undefined } : row);
  validateProjectFiles(records); // Export/read protection includes legacy stored files.
  return records;
}

export async function listProjectFiles(userId: string, conversationId: string | number): Promise<ProjectFile[]> {
  return validateProjectFiles(await listProjectFileRecords(userId, conversationId));
}

async function resolveProjectFileRecord(userId: string, fileId: string) {
  if (!userId) throw new ProjectFileError(401, "authentication required");
  if (!/^[1-9]\d*$/.test(fileId)) throw new ProjectFileError(400, "invalid file id");
  const { results } = await query("SELECT * FROM project_files WHERE id = ? AND user_id = ?", [fileId, userId]);
  if (!results.length) throw new ProjectFileError(404, "file not found");
  await assertProjectFileOwnership(userId, results[0].conversation_id);
  return results[0];
}

export async function getProjectFileRecord(userId: string, fileId: string) {
  const record = await resolveProjectFileRecord(userId, fileId);
  const normalized = record.encoding === null ? { ...record, encoding: undefined } : record;
  validateProjectFiles([normalized]);
  return normalized;
}

// A command insert and its SQLite trigger execute atomically in one statement.
// No multi-request transaction assumption or partial-save fallback is needed.
export async function saveProjectFiles(userId: string, conversationId: string | number, input: unknown, mode: "merge" | "replace"): Promise<ProjectFile[]> {
  const id = await assertProjectFileOwnership(userId, conversationId);
  if (mode !== "merge" && mode !== "replace") throw new ProjectFileError(400, "invalid save mode");
  const files = validateProjectFiles(input);
  const previous = mode === "merge" ? await listProjectFiles(userId, id) : [];
  const merged = new Map((mode === "merge" ? previous : []).map(file => [file.path.toLowerCase(), file]));
  for (const file of files) merged.set(file.path.toLowerCase(), file);
  const result = validateProjectFiles(Array.from(merged.values()));
  await initializeProjectFiles(result.some(file => file.encoding === "base64"));
  // A single INSERT statement handles both modes via an AFTER INSERT trigger
  // on a durable command table (migration below). SQLite rolls back all trigger
  // effects if any limit/constraint fails.
  await query("INSERT INTO project_file_commands (user_id, conversation_id, mode, files) VALUES (?, ?, ?, ?)",
    [userId, id, mode, JSON.stringify(files)]);
  indexWorkspaceFiles(userId, id, result);
  return result;
}

export async function deleteProjectFile(userId: string, fileId: string) {
  // Deletion must remain possible for legacy files rejected by export policy.
  const file = await resolveProjectFileRecord(userId, fileId);
  await query("DELETE FROM project_files WHERE id = ? AND user_id = ? AND conversation_id = ?", [fileId, userId, file.conversation_id]);
}

/** Insert only missing starter paths in one D1 statement. Never replace user edits. */
export async function seedMissingProjectFiles(userId: string, conversationId: string | number, input: ProjectFile[]) {
  const id = await assertProjectFileOwnership(userId, conversationId);
  const files = validateProjectFiles(input);
  await initializeProjectFiles();
  await query(`INSERT INTO project_file_commands (user_id, conversation_id, mode, files)
    SELECT ?, ?, 'merge', json_group_array(json(candidate.value))
    FROM json_each(?) AS candidate
    WHERE NOT EXISTS (
      SELECT 1 FROM project_files
      WHERE user_id = ? AND conversation_id = ?
      AND path = json_extract(candidate.value, '$.path') COLLATE NOCASE
    ) HAVING count(*) > 0`, [userId, id, JSON.stringify(files), userId, id]);
  return listProjectFiles(userId, id);
}

/** Compare all touched files and insert the merge command in ONE SQLite statement.
 * Unrelated paths (including binary assets) are never rewritten. */
export async function applyProjectFileChanges(userId: string, conversationId: string, changes: { file: ProjectFile; before: ProjectFile | null }[]) {
  const id = await assertProjectFileOwnership(userId, conversationId);
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 8) throw new ProjectFileError(400, "invalid text changes");
  const edits = validateProjectFiles(changes.map(c => c.file));
  if (edits.some(f => f.encoding || f.language === "binary" || Buffer.byteLength(f.content) > 16000)) throw new ProjectFileError(400, "invalid text changes");
  for (const { file, before } of changes) {
    if (before) {
      validateProjectFiles([before]);
      if (before.path !== file.path || before.encoding || before.language === "binary" ||
          Buffer.byteLength(before.content) > 16000 ||
          (before.content === file.content && before.language === file.language)) throw new ProjectFileError(400, "invalid prior file snapshot");
    }
  }
  const current = await listProjectFiles(userId, id);
  validateProjectFiles([...current.filter(f => !edits.some(e => e.path.toLowerCase() === f.path.toLowerCase())), ...edits]);
  await initializeProjectFiles(current.some(f => f.encoding === "base64"));
  const conditions: string[] = [];
  const values: unknown[] = [userId, id, JSON.stringify(edits)];
  for (const { file, before } of changes) {
    if (before) {
       conditions.push(`EXISTS (SELECT 1 FROM project_files WHERE user_id = ? AND conversation_id = ? AND path = ? COLLATE BINARY AND content = ? AND language = ? AND (encoding IS NULL OR encoding = 'utf8'))`);
      values.push(userId, id, before.path, before.content, before.language);
       conditions.push(`NOT EXISTS (SELECT 1 FROM project_files WHERE user_id = ? AND conversation_id = ? AND path = ? COLLATE NOCASE AND path <> ? COLLATE BINARY)`);
       values.push(userId, id, file.path, file.path);
    } else {
      conditions.push(`NOT EXISTS (SELECT 1 FROM project_files WHERE user_id = ? AND conversation_id = ? AND path = ? COLLATE NOCASE)`);
      values.push(userId, id, file.path);
    }
  }
  // RETURNING describes the inserted command even though its AFTER trigger
  // consumes it; an empty result means the compare-and-swap did not match.
  const result = await query(`INSERT INTO project_file_commands (user_id, conversation_id, mode, files)
    SELECT ?, ?, 'merge', ? WHERE ${conditions.join(" AND ")} RETURNING id`, values);
  if (!result.results.length) throw new ProjectFileError(409, "proposal is stale; no files saved");
  return listProjectFiles(userId, id);
}