// Additive migration only. No existing credentials, provider identities or logs
// are deleted or changed; old integrations retain their own legacy workspace.
export const INTEGRATION_PROJECT_SCHEMA = `
BEGIN;
SELECT pg_advisory_xact_lock(287194603);
CREATE TABLE IF NOT EXISTS integration_project_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_projects (
  id serial PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id),
  name text NOT NULL,
  legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_projects_one_legacy
  ON email_projects(user_id) WHERE legacy;
CREATE TABLE IF NOT EXISTS email_project_domains (
  id serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES email_projects(id),
  domain_id integer NOT NULL REFERENCES email_api_domains(id) ON DELETE CASCADE,
  UNIQUE(project_id,domain_id)
);
CREATE TABLE IF NOT EXISTS email_key_state (
  key_id integer PRIMARY KEY REFERENCES email_api_keys(id) ON DELETE CASCADE,
  project_id integer NOT NULL REFERENCES email_projects(id),
  quota_key_id integer NOT NULL REFERENCES email_api_keys(id),
  replaces_key_id integer REFERENCES email_api_keys(id),
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS chatbot_api_policy (
  widget_id integer PRIMARY KEY REFERENCES chatbot_widgets(id) ON DELETE CASCADE,
  enforcement text NOT NULL CHECK(enforcement IN ('legacy','required'))
);
CREATE TABLE IF NOT EXISTS chatbot_api_credentials (
  id varchar(32) PRIMARY KEY,
  widget_id integer NOT NULL REFERENCES chatbot_widgets(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  secret_hash text NOT NULL,
  replaces_key_id varchar(32) REFERENCES chatbot_api_credentials(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS chatbot_api_credentials_widget
  ON chatbot_api_credentials(widget_id);
LOCK TABLE email_api_keys, email_api_domains, chatbot_widgets IN SHARE ROW EXCLUSIVE MODE;
DO $backfill$
BEGIN
IF NOT EXISTS(SELECT 1 FROM integration_project_migrations WHERE name='email-project-legacy-import') THEN
INSERT INTO email_projects(user_id,name,legacy)
  SELECT user_id,'Existing email setup',true FROM (
    SELECT user_id FROM email_api_keys UNION SELECT user_id FROM email_api_domains
  ) owners
  ON CONFLICT(user_id) WHERE legacy DO NOTHING;
INSERT INTO email_key_state(key_id,project_id,quota_key_id)
  SELECT k.id,p.id,k.id FROM email_api_keys k
  JOIN email_projects p ON p.user_id=k.user_id AND p.legacy
  ON CONFLICT(key_id) DO NOTHING;
INSERT INTO email_project_domains(project_id,domain_id)
  SELECT p.id,d.id FROM email_api_domains d
  JOIN email_projects p ON p.user_id=d.user_id AND p.legacy
  ON CONFLICT(project_id,domain_id) DO NOTHING;
INSERT INTO integration_project_migrations(name) VALUES('email-project-legacy-import');
END IF;
END;
$backfill$;
-- Capture writes from the previous server while it is still running during
-- the rolling release. Managed inserts use a transaction-local marker.
CREATE OR REPLACE FUNCTION email_legacy_insert_bridge() RETURNS trigger AS $$
DECLARE legacy_id integer;
BEGIN
  IF current_setting('afro.managed_email_insert',true)='yes' THEN RETURN NEW; END IF;
  INSERT INTO email_projects(user_id,name,legacy) VALUES(NEW.user_id,'Existing email setup',true)
    ON CONFLICT(user_id) WHERE legacy DO NOTHING RETURNING id INTO legacy_id;
  IF legacy_id IS NOT NULL THEN
    INSERT INTO email_project_domains(project_id,domain_id)
      SELECT legacy_id,id FROM email_api_domains WHERE user_id=NEW.user_id
      ON CONFLICT(project_id,domain_id) DO NOTHING;
  ELSE
    SELECT id INTO legacy_id FROM email_projects WHERE user_id=NEW.user_id AND legacy;
  END IF;
  IF TG_TABLE_NAME='email_api_keys' THEN
    INSERT INTO email_key_state(key_id,project_id,quota_key_id) VALUES(NEW.id,legacy_id,NEW.id);
  ELSE
    INSERT INTO email_project_domains(project_id,domain_id) VALUES(legacy_id,NEW.id)
      ON CONFLICT(project_id,domain_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS email_legacy_key_bridge ON email_api_keys;
CREATE TRIGGER email_legacy_key_bridge AFTER INSERT ON email_api_keys
  FOR EACH ROW EXECUTE FUNCTION email_legacy_insert_bridge();
DROP TRIGGER IF EXISTS email_legacy_domain_bridge ON email_api_domains;
CREATE TRIGGER email_legacy_domain_bridge AFTER INSERT ON email_api_domains
  FOR EACH ROW EXECUTE FUNCTION email_legacy_insert_bridge();
INSERT INTO chatbot_api_policy(widget_id,enforcement)
  SELECT id,'legacy' FROM chatbot_widgets ON CONFLICT(widget_id) DO NOTHING;
CREATE OR REPLACE FUNCTION chatbot_private_api_new_widget() RETURNS trigger AS $$
BEGIN
  INSERT INTO chatbot_api_policy(widget_id,enforcement)
    VALUES(NEW.id,'required') ON CONFLICT(widget_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS chatbot_private_api_new_widget_trigger ON chatbot_widgets;
CREATE TRIGGER chatbot_private_api_new_widget_trigger
  AFTER INSERT ON chatbot_widgets FOR EACH ROW EXECUTE FUNCTION chatbot_private_api_new_widget();
COMMIT;
`;
