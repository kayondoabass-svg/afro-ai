# Private recovery backups

## Approved policy and scope

Daily, seven-day retention. The private `afro-ai-backups` R2 Standard bucket is
separate from the existing uploads bucket. Existing apps, source, suspensions,
owners and live database records are not modified by this process.

The snapshot contains:

- PostgreSQL custom-format dump, with public-table row counts from the same
  exported read-only database snapshot.
- Full D1 SQL exports: configured platform files, legacy data, authentication,
  plus any retained provisioned project databases discovered in PostgreSQL.
- Every object in the configured application uploads bucket, original key and
  content-type inventory, and per-object SHA-256 hashes. Archive filenames are
  hashes, not customer-controlled filesystem paths.
- Current Git revision, scope and integrity manifests. Code is retained in the
  existing Git repository; secrets and provider configuration are not dumped.

Snapshots of independent stores are not a globally atomic transaction. Recovery
may require reconciliation of operations made between individual store snapshots.

## Completion evidence

An archive is not verified merely because R2 accepted an upload. Each run downloads
the archive from R2, compares SHA-256 and size, then restores PostgreSQL into a
randomly named temporary database owned by a fresh, unprivileged NOLOGIN role.
Restored row counts must match the captured database snapshot. D1 exports are
imported into isolated SQLite databases and checked for integrity and table
inventory; filesystem attachment and extension loading are prohibited. Every
restored upload is checksum-checked. SQLite validation is not a claim that a live
D1 deployment was replaced or that end-to-end application failover was tested.

Only that run's isolated restore database/role and temporary staging directory
are removed. There is no automatic restore into production.

## Configuration and schedule

Root-owned `/srv/afro-ai/shared/backup.env` contains the dedicated
`BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY`,
`BACKUP_R2_ACCOUNT_ID`, `BACKUP_R2_BUCKET_NAME`, `BACKUP_RETENTION_DAYS=7`
and `AFRO_BACKUP_STATUS_FILE=/srv/afro-ai/backups/status.json`.
The service also reads the existing application environment for source access.
Dedicated backup credentials never replace application/DNS credentials.

Install the tracked `scripts/backup/systemd` units. The timer runs at 19:00 UTC,
02:00 the following day in Asia/Ho_Chi_Minh, and catches missed runs after boot.
Enable the timer only after an initial service run completes verification.
`systemctl start afro-ai-backup.service` performs an on-demand verified snapshot.
Use `systemctl status afro-ai-backup.timer` to inspect the schedule.

The job shares the deploy lock and has an exclusive backup lock. It uses bounded
temporary staging under `/run`, not large dumps on the nearly-full application
disk. Initial safety limits reject oversized snapshots/archives and cap managed
backup storage at 2 GB; exceeding a limit fails visibly, rather than silently
discarding data or promising unlimited free storage. These are not Cloudflare
account-wide spending limits. Other buckets share the R2 free allowance.

## Retention and access

Only verified, tool-owned archive/manifest pairs under `afro-ai-recovery/v1/`,
older than seven days, are removed, and only after a new archive is fully verified.
Unrelated objects and live upload objects are never deleted. A failed backup
does not expire the last good recovery point. Failed-run artifacts may require
review; the job never deletes unknown objects to reclaim space.

The root-owned, app-readable status file contains safe summary metadata only.
The founder operations card shows recent verified evidence, unavailable after
failure or after 36 hours, and unverified when evidence is incomplete. It never
returns object keys, dumps, credentials or signed export download URLs.

R2 provides server-side encryption; this setup does not assert client-side
encryption, immutable storage or protection against compromise of the owner's
Cloudflare account. Bucket locks, independent credentials and a second recovery
destination require separate approval. Keep access to provider accounts and the
existing secret vault outside the failed server. Budget alerts do not stop charges.

## Disaster recovery

1. Contain an attack and secure provider accounts; rotate compromised credentials.
2. Provision a clean host with matching PostgreSQL and application dependencies.
3. Privately download the chosen archive and corresponding verified manifest.
   Validate its SHA-256, size and safe archive entries before extraction.
4. Repeat isolated PostgreSQL/SQLite/upload validation before selecting a restore.
5. Restore PostgreSQL and D1 into new, isolated targets first; restore object keys
   and content types using `uploads.json`. Review migrations and ownership.
6. Recover runtime secrets through the owner's vault and provider accounts.
7. Test authentication, ownership, app serving and integrations before switching
   traffic. Do not overwrite current production or change DNS without approval.

Daily backups can lose changes since the last recovery point (normally up to
24 hours). Restoration is operator-managed, not instant automatic failover.
