-- Apply explicitly with psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f this-file.
-- Idempotent additive migration; never run automatically at app startup.
BEGIN;
SELECT pg_advisory_xact_lock(746322);
CREATE TABLE IF NOT EXISTS media_jobs (
 id varchar PRIMARY KEY,
 user_id varchar NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK (kind IN ('image','video')),
 prompt text NOT NULL,
 duration integer CHECK (duration BETWEEN 2 AND 5),
 idempotency_key varchar(128) NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 lease_token text,
 error text,
 plan text NOT NULL,
 cost_cents integer NOT NULL,
 usage_log_id integer,
 asset_key text,
 asset_bytes bytea CHECK (octet_length(asset_bytes) <= 16777216),
 mime_type text
);
-- Older installations may have the queue but not newer nullable delivery data.
-- Never invent billing/ownership values or rewrite existing job states.
ALTER TABLE media_jobs
 ADD COLUMN IF NOT EXISTS duration integer CHECK (duration BETWEEN 2 AND 5),
 ADD COLUMN IF NOT EXISTS lease_until timestamptz,
 ADD COLUMN IF NOT EXISTS lease_token text,
 ADD COLUMN IF NOT EXISTS error text,
 ADD COLUMN IF NOT EXISTS usage_log_id integer,
 ADD COLUMN IF NOT EXISTS asset_key text,
 ADD COLUMN IF NOT EXISTS asset_bytes bytea CHECK (octet_length(asset_bytes) <= 16777216),
 ADD COLUMN IF NOT EXISTS mime_type text;
CREATE UNIQUE INDEX IF NOT EXISTS media_jobs_user_idempotency ON media_jobs(user_id,idempotency_key);
CREATE INDEX IF NOT EXISTS media_jobs_queue ON media_jobs(status,created_at);
-- A legacy table missing essential ownership or billing fields must fail before
-- COMMIT rather than allowing deployment to claim the feature is ready.
SELECT id,user_id,kind,prompt,duration,idempotency_key,status,created_at,
 lease_until,lease_token,error,plan,cost_cents,usage_log_id,asset_key,asset_bytes,mime_type
 FROM media_jobs LIMIT 0;
COMMIT;