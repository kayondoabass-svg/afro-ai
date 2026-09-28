-- Apply explicitly with psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f this-file.
-- Idempotent additive migration; never run automatically at app startup.
BEGIN;
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
CREATE UNIQUE INDEX IF NOT EXISTS media_jobs_user_idempotency ON media_jobs(user_id,idempotency_key);
CREATE INDEX IF NOT EXISTS media_jobs_queue ON media_jobs(status,created_at);
COMMIT;