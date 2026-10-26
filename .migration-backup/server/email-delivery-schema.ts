// Additive, repeat-safe; seed the current allowance once without resetting usage.
export const EMAIL_DELIVERY_SCHEMA = `
BEGIN;
SELECT pg_advisory_xact_lock(287194603);
ALTER TABLE email_key_state ADD COLUMN IF NOT EXISTS secret_fingerprint text;
CREATE INDEX IF NOT EXISTS email_secret_fingerprint ON email_key_state(secret_fingerprint);
CREATE INDEX IF NOT EXISTS email_secret_preview ON email_api_keys(secret_key_preview);
CREATE TABLE IF NOT EXISTS email_quota_periods (
  quota_key_id integer NOT NULL REFERENCES email_api_keys(id),
  period date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK(used>=0),
  PRIMARY KEY(quota_key_id,period)
);
CREATE TABLE IF NOT EXISTS email_send_requests (
  id uuid PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id),
  key_id integer NOT NULL REFERENCES email_api_keys(id),
  project_id integer NOT NULL REFERENCES email_projects(id),
  quota_key_id integer NOT NULL REFERENCES email_api_keys(id),
  period date NOT NULL,
  idempotency_hash text NOT NULL,
  payload_hash text NOT NULL,
  recipient_count integer NOT NULL CHECK(recipient_count>0),
  status text NOT NULL CHECK(status IN ('pending','accepted','rejected','uncertain')),
  message_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,key_id,idempotency_hash)
);
CREATE INDEX IF NOT EXISTS email_send_requests_owner ON email_send_requests(user_id,project_id,created_at DESC);
CREATE TABLE IF NOT EXISTS email_provider_events (
  message_id text PRIMARY KEY,
  status text NOT NULL,
  occurred_at timestamptz NOT NULL
);
DO $seed$
BEGIN
IF NOT EXISTS(SELECT 1 FROM integration_project_migrations WHERE name='email-delivery-accounting') THEN
  INSERT INTO email_quota_periods(quota_key_id,period,used)
    SELECT DISTINCT k.id,date_trunc('month',now() AT TIME ZONE 'UTC')::date,GREATEST(0,k.emails_sent_month)
    FROM email_api_keys k JOIN email_key_state s ON s.quota_key_id=k.id
    ON CONFLICT DO NOTHING;
  INSERT INTO integration_project_migrations(name) VALUES('email-delivery-accounting');
END IF;
END;
$seed$;
COMMIT;
`;
