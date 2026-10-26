/**
 * One-shot: copy existing Postgres users into the Cloudflare D1 `users` table.
 *
 * - Preserves the Postgres user id (both sides use string ids, so this keeps
 *   downstream foreign keys stable).
 * - Carries over password_hash, name fields, profile image, plan.
 * - Marks email_verified = 1 (these are established accounts).
 * - Skips users with no email (D1 requires email NOT NULL).
 * - Skips users that already exist in D1 (idempotent).
 *
 * Usage (dry run prints SQL but doesn't execute):
 *   tsx scripts/migrate-users-to-d1.ts --dry-run
 *
 * Usage (actually push to remote D1):
 *   tsx scripts/migrate-users-to-d1.ts --apply
 */
import { db } from "../server/db";
import { users } from "@shared/models/auth";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

function escape(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;

  console.log(`[migrate] mode: ${dryRun ? "DRY-RUN" : "APPLY"}`);

  const rows = await db.select().from(users);
  console.log(`[migrate] Postgres users: ${rows.length}`);

  // Pull existing D1 ids so we don't double-insert.
  let existing = new Set<string>();
  try {
    const out = execSync(
      `npx wrangler d1 execute afro-ai-auth --remote --command "SELECT id FROM users" --json`,
      { cwd: path.join(process.cwd(), "cloudflare"), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const parsed = JSON.parse(out);
    const results = parsed?.[0]?.results || [];
    for (const r of results) existing.add(r.id);
    console.log(`[migrate] D1 already has: ${existing.size}`);
  } catch (e: any) {
    console.warn("[migrate] Could not read existing D1 ids — will rely on INSERT OR IGNORE");
  }

  const candidates = rows.filter((r) => r.email && !existing.has(r.id));
  const skippedNoEmail = rows.filter((r) => !r.email).length;
  console.log(`[migrate] to insert: ${candidates.length}  (skipped ${skippedNoEmail} with no email)`);

  if (candidates.length === 0) {
    console.log("[migrate] nothing to do.");
    return;
  }

  // Build a single SQL file with all INSERTs (D1 supports multi-statement files).
  // D1 wraps every statement in an implicit transaction and rejects
  // explicit BEGIN/COMMIT, so we just emit a flat list of INSERTs.
  const lines: string[] = [];
  for (const u of candidates) {
    const created = u.createdAt ? Math.floor(new Date(u.createdAt).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const updated = u.updatedAt ? Math.floor(new Date(u.updatedAt).getTime() / 1000) : created;
    lines.push(
      `INSERT OR IGNORE INTO users (id, email, password_hash, first_name, last_name, profile_image_url, email_verified, plan, created_at, updated_at) VALUES (${escape(
        u.id,
      )}, ${escape(u.email)}, ${escape(u.passwordHash)}, ${escape(u.firstName)}, ${escape(u.lastName)}, ${escape(
        u.profileImageUrl,
      )}, 1, ${escape(u.plan || "starter")}, ${created}, ${updated});`,
    );
  }
  const sql = lines.join("\n");

  const tmpPath = path.join(os.tmpdir(), `afroai-d1-migration-${Date.now()}.sql`);
  fs.writeFileSync(tmpPath, sql, "utf8");
  console.log(`[migrate] SQL written to: ${tmpPath} (${sql.length} bytes, ${candidates.length} inserts)`);

  if (dryRun) {
    console.log("[migrate] DRY-RUN — not executing. Re-run with --apply to push.");
    console.log("[migrate] Preview (first 3 lines):");
    console.log(lines.slice(0, 4).join("\n"));
    return;
  }

  console.log("[migrate] Pushing to remote D1 …");
  execSync(`npx wrangler d1 execute afro-ai-auth --remote --file=${tmpPath}`, {
    cwd: path.join(process.cwd(), "cloudflare"),
    stdio: "inherit",
  });
  console.log("[migrate] ✓ done");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[migrate] failed:", e);
    process.exit(1);
  });
