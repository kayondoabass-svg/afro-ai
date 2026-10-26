/**
 * Read-only project-files D1 migration preflight.
 * Run with: npx tsx scripts/project-files-d1-preflight.ts [--require-ready]
 * Uses the same D1 environment as the Express adapter; never prints credentials,
 * database identifiers, SQL results, or remote error bodies.
 */
import { pathToFileURL } from "node:url";
import { d1GetDatabaseInfo, d1Query } from "../server/d1";

type Info = { uuid: string; name: string };
type Query = (sql: string, params?: unknown[]) => Promise<{ results: any[] }>;

export async function preflightProjectFilesD1(
  config: { databaseId?: string; expectedName?: string },
  getInfo: () => Promise<Info>,
  query: Query,
): Promise<"ready" | "migration-required"> {
  const { databaseId, expectedName } = config;
  if (!databaseId || !expectedName || expectedName === "afro-ai-auth") {
    throw new Error("Configure CLOUDFLARE_D1_DATABASE_ID and PROJECT_FILES_D1_DATABASE_NAME (not the auth D1)");
  }
  const info = await getInfo();
  if (info.uuid !== databaseId || info.name !== expectedName || info.name === "afro-ai-auth") {
    throw new Error("D1 target identity does not match the expected project-files database");
  }

  const schema = (await query(
    "SELECT type, name, sql FROM sqlite_master WHERE name IN ('project_files', 'project_files_owner_path', 'project_file_commands', 'project_file_command_apply', 'project_file_command_apply_binary')",
  )).results;
  const table = schema.find(r => r.type === "table" && r.name === "project_files");
  if (!table) return "migration-required";

  // Count groups only; do not expose owners, paths, content, or credentials.
  const duplicateRows = (await query(
    "SELECT count(*) AS n FROM (SELECT 1 FROM project_files GROUP BY user_id, conversation_id, path COLLATE NOCASE HAVING count(*) > 1)",
  )).results;
  const duplicates = Number(duplicateRows[0]?.n);
  if (!Number.isSafeInteger(duplicates)) throw new Error("D1 duplicate check returned an invalid count");
  if (duplicates > 0) throw new Error(`Migration blocked: ${duplicates} duplicate owner/conversation/path groups; no rows changed. Review and resolve manually before applying.`);

  const index = schema.find(r => r.type === "index" && r.name === "project_files_owner_path");
  const commands = schema.find(r => r.type === "table" && r.name === "project_file_commands");
  const trigger = schema.find(r => r.type === "trigger" && r.name === "project_file_command_apply_binary");
  if (index && (!/CREATE\s+UNIQUE\s+INDEX/i.test(index.sql ?? "") ||
    !/\buser_id\s*,\s*conversation_id\s*,\s*path\s+COLLATE\s+NOCASE\b/i.test(index.sql ?? ""))) {
    throw new Error("Project-files index has unexpected definition; inspect manually");
  }
  if (!index || !commands || !trigger) return "migration-required";
  const columns = (await query("SELECT name FROM pragma_table_info('project_files')")).results;
  return columns.some(row => row.name === "encoding") ? "ready" : "migration-required";
}

async function main() {
  const requireReady = process.argv.slice(2).includes("--require-ready");
  if (process.argv.slice(2).some(arg => arg !== "--require-ready")) {
    throw new Error("Usage: npx tsx scripts/project-files-d1-preflight.ts [--require-ready]");
  }
  if (!process.env.CLOUDFLARE_API_TOKEN && !process.env.CLOUDFLARE_D1_TOKEN) {
    throw new Error("Configure CLOUDFLARE_API_TOKEN or CLOUDFLARE_D1_TOKEN");
  }
  const status = await preflightProjectFilesD1(
    { databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID, expectedName: process.env.PROJECT_FILES_D1_DATABASE_NAME },
    d1GetDatabaseInfo,
    d1Query,
  );
  if (status === "ready") console.log("Project-files D1 migrations 002 and 003 are present. No changes made.");
  else {
    console.log("Project-files D1 migration 002 or 003 is missing. Binary writes require 003; existing text writes remain available with 002. No changes made.");
    if (requireReady) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Remote error messages can include sensitive material; redact rather than log exceptions.
    console.error("Project-files D1 preflight failed: target, configuration, schema, or connectivity check. No changes made.");
    process.exitCode = 1;
  });
}