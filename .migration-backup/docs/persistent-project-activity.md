# Persistent project activity

## Delivered

Activity lives in the existing PostgreSQL messages store under a private
workbench-only role. Each event is an independent, append-only record rather
than an ever-growing array. No new database service or migration is required.
Existing chat queries exclude all workbench roles.

Tool start/completion/failure, project review lifecycle, reviewed workbench
mutations and screenshot capture/review/repair transitions are saved before
they can be streamed. Activity and its related state/receipt commit together.
Stable job/call/status identities deduplicate repeated tool callbacks.
Owner-scoped routes resolve the canonical project workspace; a user ID from
the URL cannot grant access to someone else's project.

The ledger contains only bounded public descriptions, paths and evidence IDs.
It contains no screenshot bytes, credentials, provider metadata, raw tool
outputs or private model reasoning. Capture alone is not a successful visual
review, functional test or deployment.

## Read interface

- GET /api/conversations/:id/workbench/activity?limit=50
- GET /api/conversations/:id/workbench/activity?limit=50&before=123
- GET /api/conversations/:id/workbench/events

Pages return chronological items, hasMore and nextBefore. Sequence cursors are
exact database ID strings, not JavaScript floating-point numbers. Streams
replay missed committed events in bounded batches; initial connection sends
the latest page. Load older activity inside chat retrieves older pages.
Refresh, reconnection and multiple tabs only read stored work: they never
dispatch paid tools, launch a job or retry a provider request.

Surviving legacy activity is imported once in bounded batches. Capture
receipts are reconciled for interrupted/uncertain outcomes. Old tool events
already removed by the previous 100-event cap cannot be recovered.

## Storage lifetime and limitations

New activity is no longer truncated by the 100/140-event rolling buffers.
It remains with the canonical workspace while that workspace exists. Existing
conversation deletion, account deletion and database retention still apply.
This is not an immutable regulatory audit store, a six-year legal archive,
a backup guarantee or indefinite personal-data retention.

Disconnecting the UI does not delete recorded events. This change does not
turn request-bound execution into a durable job runner; a server crash or
cancelled request may interrupt work and must not trigger an automatic paid
retry. Billing reservations and measured usage remain in their existing
ledger; activity is not proof of a billable provider charge.

The screenshot-offloading attachment was reviewed, not installed: public
Cloudflare Images variants, placeholder-image fallback and claiming that a
snapshot was verified are unsuitable for private customer evidence. Screenshot
bytes remain in the existing bounded, authenticated evidence store, not in the
activity ledger. Private object storage needs a separate verified integration,
failure/cleanup policy and explicit configuration. No Cloudflare Images plan
has been purchased or activated.

## Verification

Unit/API/UI tests cover history beyond the old caps, pagination, deduplication,
cursor replay, project isolation, input validation, database errors and late
responses after switching conversations. The opt-in PostgreSQL check uses a
connection-local temporary table without changing application records:

    npx tsx scripts/activity-history-db-smoke.ts --confirm-temporary-table

Public preview screenshots render authentication, not signed-in chat. Do not
claim the signed-in UI or real remote screenshot provider was visually verified
on that basis.
