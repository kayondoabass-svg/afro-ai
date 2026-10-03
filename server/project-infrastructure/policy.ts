import { createHash } from "node:crypto";
import { fullstackStarterFiles } from "../fullstack-starter";
import { ProjectFileError, type ProjectFile } from "../project-file-policy";

export const INFRASTRUCTURE_LIMITS = { databasesPerUser: 2, provisionsPerDay: 5 };
// Owner deferred platform-funded resources. No request/body/plan can enable this.
export function managedDatabaseSetupEnabled() { return false; }
export const HOSTING = {
  available: false,
  reason: "Paid managed database setup and full-stack hosting are deferred. Export the saved project to GitHub, then deploy it with your own hosting provider. Existing static websites can still publish at a subdomain of afroaigroup.com. A GitHub push alone does not deploy a backend.",
};
export const MIGRATION_PATH = "migrations/0001_initial.sql";
export const INITIAL_SQL = fullstackStarterFiles().find(f => f.path === MIGRATION_PATH)!.content;
export const INITIAL_CHECKSUM = createHash("sha256").update(INITIAL_SQL).digest("hex");

/** User SQL/config is untrusted; this release runs only the audited starter migration. */
export function checkInitialMigration(files: ProjectFile[]) {
  if (files.find(f => f.path === MIGRATION_PATH)?.content !== INITIAL_SQL) {
    throw new ProjectFileError(409, "The initial migration was changed or removed. Restore the starter migration before setup. Custom migrations are not automatically executed.");
  }
}

export function configuredWrangler(files: ProjectFile[], name: string, id: string) {
  const before = files.find(f => f.path === "wrangler.toml");
  if (!before || before.encoding) throw new ProjectFileError(409, "wrangler.toml is missing or unsupported.");
  const content = before.content;
  const starts = Array.from(content.matchAll(/^\s*\[\[d1_databases\]\]\s*$/gm));
  if (starts.length !== 1 || !/^\s*binding\s*=\s*"DB"\s*$/m.test(content)) {
    throw new ProjectFileError(409, "Database configuration was changed. Keep one starter DB binding before setup.");
  }
  // Narrow compare-and-swap patch: don't rewrite arbitrary TOML or replace user changes.
  const start = starts[0].index!;
  const next = content.slice(start + starts[0][0].length).search(/^\s*\[/m);
  const end = next < 0 ? content.length : start + starts[0][0].length + next;
  const section = content.slice(start, end);
  let updated = section;
  for (const [key, placeholder, value] of [
    ["database_name", "YOUR_DATABASE_NAME", name], ["database_id", "YOUR_DATABASE_ID", id],
  ]) {
    const lines = Array.from(section.matchAll(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"\\s*$`, "gm")));
    if (lines.length !== 1 || ![placeholder, value].includes(lines[0][1])) {
      throw new ProjectFileError(409, "Database configuration conflicts with the managed database. Your edits were preserved.");
    }
    updated = updated.replace(lines[0][0], `${key} = "${value}"`);
  }
  return { before, file: { ...before, content: content.slice(0, start) + updated + content.slice(end) } };
}