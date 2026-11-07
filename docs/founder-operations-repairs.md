# Additive founder operations repair

No bulk deletion, account reset, suspension bypass, or automatic reactivation is part of this release.

## Where to find the changes

Sign in as the founder and open `/founder` on the actual production domain.
Use **Apps** in the header, then **View details**. **Refresh data** refetches
the founder reports. The operations checks show the running server's embedded
release revision, not a mutable checkout marker.

The backend's feature identifier is `founder-operations-2026-11`.
If the endpoint is unavailable, the UI must not imply its checks succeeded.

## What is checked

`GET /api/founder/operations-health` is founder-only and private/no-store.
Results are coalesced/cached for 30 seconds, with an actual ISO UTC `checkedAt`;
the UI displays times in the viewer's timezone.

- DNS: an exact-zone, read-only DNS lookup. Read success does not establish
  permission to change DNS records or purge caches.
- Source storage: a bounded schema-only read. This is service readiness,
  not a claim that every project's files or external assets are complete.
- Backups: explicitly **unverified**. Website snapshots and retained database
  records are not evidence of an independent backup or a tested restore.

Use a zone-scoped `CLOUDFLARE_DNS_TOKEN` when separating DNS access from
the existing storage credential. Existing configurations retain their
`CLOUDFLARE_API_TOKEN` fallback. Do not replace working D1 credentials or change
database bindings to fix DNS. Cache purge continues to use its separate token.

## Cleanup safety

Only an existing `unpublish-pending` operation may be retried through the founder
details sheet. It requires explicit confirmation and is checked again while
holding the app's advisory lock. It never deletes saved source or projects.
Neither administrative suspensions nor hosting expiry may use this retry.

New requests record their actor and time before cleanup. Failures record the
stage (DNS, cache, or hosted content), not raw provider responses or credentials.
Historic records remain unchanged; do not fabricate who initiated old requests.
No automatic cleanup retries are scheduled.

## Recovering source

Owners use **My Apps → Recover source**, or their project's existing source-sync
action. Recovery remains scoped to the signed-in owner and exact project.
The latest usable saved HTML is selected even if a newer retained entry contains
only narration. Existing manual `index.html` changes are never silently replaced,
and sibling files/assets are not removed.

Founder details contain sizes/counts and verified project associations only.
Missing associations are not evidence of lost source, and a zero permanent-image
count is not proof that a website never used external images.

## Hosting reminders

Active Starter apps receive one queued advance reminder during days 27–30 of
their existing hosting period. Founder accounts, paid accounts, already expired
apps and inactive apps are excluded. Concurrent workers cannot claim the same
app. Delivery is checked separately from provider acceptance. An upgrade or
offline state before sending causes the warning to be skipped.

The reminder neither extends the hosting period nor changes existing daily
free-use allowances. No retroactive suspension events are created.

## Remaining infrastructure gates

Before any bulk data repair, establish a private off-host backup destination,
take database and necessary asset backups, and verify a restoration in isolation.
Never put database dumps in a public website-image bucket or on the nearly-full
application disk. Provider snapshots remain unverified until checked.

Restore the production credential's appropriate zone access before attempting
Cloudflare cleanup. Deploying application code cannot grant Cloudflare account
permissions. Do not mark this blocker fixed until the real operation is verified.
