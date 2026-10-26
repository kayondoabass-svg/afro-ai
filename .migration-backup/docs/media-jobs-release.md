# Durable media jobs release

## Required before enabling

1. Back up PostgreSQL and apply the additive, idempotent migration explicitly:
   `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/202606_media_jobs.sql`
   No migration runs at startup. Missing table/columns fail closed with HTTP 503.
2. Configure Gemini (`GEMINI_API_KEY`, `GOOGLE_API_KEY`, or `GEMINI_API`) for Imagen/Veo, or
   `OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_API_KEY` for images only. No paid smoke
   generation is part of deployment or tests.
3. Existing R2 credentials can be reused, but set `MEDIA_R2_BUCKET` to a private
   bucket with public access disabled and `MEDIA_R2_PRIVATE=true` only after verifying
   bucket policy. Generated objects are never returned as provider/public URLs.
   If absent/unavailable, PostgreSQL bytea is the durable fallback; assets are capped
   at 16 MiB on both paths. Provision DB capacity/backups accordingly. Keep bucket
   configuration stable for existing assets.
4. Run `npx vitest run server/__tests__/media-jobs.test.ts server/__tests__/media-assets.test.ts` and `npm run check`.
   Start the application normally; existing image route registration registers media
   routes and a 2-second polling worker. `MEDIA_CONCURRENCY` defaults to 2, bounded
   1–4 across all replicas by DB lock and leases. Do not apply live DB changes in tests.

## API

Authenticated POST `/api/media/jobs` accepts `{kind,prompt,duration?,idempotencyKey}`
and returns 202 with `{id,kind,status,prompt,createdAt,error?,assetUrl?}`.
Duration is integer 2–5 seconds for video (default 5); image prompt max 4000,
video max 2000. Idempotency key is required (1–128 characters); a reused key
with differing input returns 409. GET collection returns `{jobs:[...]}` (latest 100).
GET `/:id` and POST `/:id/cancel` return the job. GET `/:id/asset` returns
authenticated private download bytes only after success. Foreign IDs return 404.
Errors are `{code,error}`; provider details, keys and object keys are never exposed.
Legacy image/video routes use the same queue and return legacy base64 fields upon
completion; exceptionally long queues return 202 with the job. Clients should
prefer the jobs API and persist idempotency keys across retries. Legacy endpoints
also require `idempotencyKey` in the body or an `Idempotency-Key` header (no server
generated fallback). Missing keys return 400. Non-default legacy
image dimensions/aspect ratios now fail explicitly rather than silently changing.

## Accounting and operational recovery

Submission locks the user row, checks existing quota configuration, debits PAYG and
creates the usage reservation and job in one transaction. Duplicate keys never
debit twice. Queued cancellation deletes the usage reservation and refunds PAYG
atomically, once. Running cancellation stops delivery, not a remote paid operation.
Running failures/timeouts retain their reservation because provider billing may
already have occurred. No fallback/retry after a provider attempt. OpenAI retries
are disabled; requests have a six-minute abort deadline.

Claims hold an eight-minute durable lease. Expired running jobs become failed with
an explicit unknown-outcome message; they are **never** automatically resubmitted.
Cancellation keeps its concurrency slot until the in-flight worker exits or lease
expires. Operators must reconcile ambiguous provider bills before any manual credit.
Workers check token and DB-clock lease freshness before provider invocation and
immediately before storage, then fence the final update again. A lost update
deletes its token-specific R2 object; delete failures emit the stable
`MEDIA_ORPHAN_CLEANUP_FAILED` warning for lifecycle reconciliation. An ambiguous DB
commit failure never deletes a possibly referenced object. Completion enforces
exactly one asset storage representation. Downloads revalidate MIME against an
image/video allowlist; failure messages contain stable category prefixes, never
raw provider details. Veo rejects invalid durations rather than clamping them.
Reservation cost and daily caps come directly from the existing quota module.
Non-media legacy chat/audio accounting is unchanged; its existing guard/record
two-step design is not made transactional by this media release.

Monitor failed/expired jobs and database size. No automatic history/asset deletion
is implemented; establish a retention policy before high-volume use. An R2 upload
that succeeds immediately before a worker crash/cancel can leave an unreferenced
private object; lifecycle cleanup should only remove keys absent from media_jobs.
Rollback application code only after draining queued/running jobs; retain the
additive table and private assets for recovery and audit.