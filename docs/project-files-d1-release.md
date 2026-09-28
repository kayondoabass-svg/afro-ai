# Project-files D1 release prerequisite (operator runbook)

Migration `cloudflare/migrations/002_project_files.sql` belongs to the **Express project-files D1**, not `cloudflare/wrangler.toml`'s `afro-ai-auth` D1. Never run `wrangler d1 migrations apply` against the auth binding for this file. Nothing in the app or deployment script automatically applies this migration. The project-files read-only preflight uses the same account, token and database ID as `server/d1.ts`; it verifies the remote database's returned UUID and name before reading schema. It does not print identifiers, credentials, file paths, or contents.

Required environment names (values stay in the production secret store; do **not** paste values into logs or commits):

- `CLOUDFLARE_D1_DATABASE_ID` — UUID of the existing project-files D1 used by Express, **not** the auth D1.
- `PROJECT_FILES_D1_DATABASE_NAME` — exact Cloudflare dashboard name for that UUID (the D1 console currently labels it `production-db`; confirm the real name in Cloudflare before setting). Must not be `afro-ai-auth`.
- `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_D1_TOKEN` — scoped to read the D1 database and its metadata. For manual migration, use a separately authorized token with D1 write permission. The adapter prefers `CLOUDFLARE_API_TOKEN` if both exist; Wrangler normally uses `CLOUDFLARE_API_TOKEN`.
- `CLOUDFLARE_ACCOUNT_ID` (or `R2_ACCOUNT_ID`) — account used by the Express adapter. Confirm it is the intended Cloudflare account; the adapter otherwise uses its existing default account.

## Before deploying

1. Confirm the configured database UUID and name against the Cloudflare dashboard, including account. Back up/export the **project-files** D1 in Cloudflare before any manual migration. Do not log exported data.
2. On the production host, load the shared environment privately (`set -a; source /srv/afro-ai/shared/.env; set +a`), then run from `/opt/afro-ai`: `./node_modules/.bin/tsx scripts/project-files-d1-preflight.ts`. This makes read-only metadata and SQL requests only. Its output reports readiness or that migration is required, without identifiers or duplicate paths. A mismatch, failed lookup, or duplicate groups exits nonzero. `--require-ready` makes missing migration nonzero too.
3. If duplicates are reported, **stop**. The duplicate condition is `(user_id, conversation_id, path COLLATE NOCASE)` in the existing `project_files` table. Investigate in a private operator session, back up first, choose a data-preserving resolution for every conflicting row, and re-run preflight. There is no automated deletion or deduplication.
4. If migration is missing and there are no duplicates, have an authorized operator apply it **manually**, only after the target identity is confirmed. From `/opt/afro-ai/cloudflare` with Wrangler installed and a separately approved D1 write token in `CLOUDFLARE_API_TOKEN`:

   ```sh
   npx --no-install wrangler d1 execute "$PROJECT_FILES_D1_DATABASE_NAME" --remote --file=migrations/002_project_files.sql
   ```

   The explicit database name is required; do not substitute the auth D1 name. Review Wrangler's selected database/account before confirming execution. Wrangler may not share Express's ID binding; if it cannot independently establish the selected UUID equals `CLOUDFLARE_D1_DATABASE_ID`, use the Cloudflare dashboard to run the SQL on the verified UUID instead. Do not apply if identity is uncertain. The migration creates an index, command table and trigger; the `DELETE` in its trigger executes **only on subsequent explicit replace-file commands**, not while applying the migration.
5. Re-run preflight with `--require-ready` and only then release the feature. `scripts/deploy.sh` calls the read-only preflight with `--require-ready` after dependencies install and before building/restarting. A missing migration halts deployment, as do identity/duplicate/connectivity failures, without touching D1. This prevents replacing the running application with a version whose file writes cannot work. There is no automatic schema creation on a user request. In development, missing migration returns 503 for command writes until the correct database is migrated.

## Rollback

To revert application code, use the existing manual `scripts/rollback.sh <previous-sha>` procedure on the droplet after verifying the target SHA and a clean worktree. **Do not drop the index, trigger, table, or existing file rows as part of a code rollback.** Migration 002 is additive; older code can continue using `project_files`. If the migration itself fails, stop and inspect Cloudflare's actual schema and backup before retrying; do not assume multi-statement D1 execution rolled back every statement. If a command-write feature misbehaves, pause its rollout or roll back the app; retain D1 data and investigate separately with a database operator.