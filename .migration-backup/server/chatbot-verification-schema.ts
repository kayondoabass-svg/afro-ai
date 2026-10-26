// Additive PostgreSQL migration. Existing widgets retain legacy mode; only
// widgets inserted after installation require an approved browser origin.
export const CHATBOT_VERIFICATION_SCHEMA = `
BEGIN;
SELECT pg_advisory_xact_lock(287194602);
CREATE TABLE IF NOT EXISTS chatbot_site_settings (
  widget_id integer PRIMARY KEY REFERENCES chatbot_widgets(id) ON DELETE CASCADE,
  enforcement text NOT NULL DEFAULT 'required' CHECK (enforcement IN ('legacy','required')),
  installation_verified boolean,
  installation_code text,
  installation_message text,
  installation_url text,
  installation_checked_at timestamptz,
  test_succeeded boolean,
  test_url text,
  test_checked_at timestamptz
);
CREATE TABLE IF NOT EXISTS chatbot_verified_domains (
  id uuid PRIMARY KEY,
  widget_id integer NOT NULL REFERENCES chatbot_widgets(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  last_checked_at timestamptz,
  UNIQUE(widget_id, hostname)
);
LOCK TABLE chatbot_widgets IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO chatbot_site_settings(widget_id,enforcement)
SELECT id,'legacy' FROM chatbot_widgets ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION chatbot_new_site_policy() RETURNS trigger AS $$
BEGIN
  INSERT INTO chatbot_site_settings(widget_id,enforcement)
  VALUES (NEW.id,'required') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='chatbot_new_site_policy_trigger'
    AND tgrelid='chatbot_widgets'::regclass) THEN
    CREATE TRIGGER chatbot_new_site_policy_trigger AFTER INSERT ON chatbot_widgets
    FOR EACH ROW EXECUTE FUNCTION chatbot_new_site_policy();
  END IF;
END; $$;
COMMIT;
`;
