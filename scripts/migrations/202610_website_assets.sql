BEGIN;
CREATE TABLE IF NOT EXISTS website_assets (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  conversation_id integer NOT NULL,
  filename text NOT NULL,
  project_path text NOT NULL,
  object_key text NOT NULL UNIQUE,
  bucket text NOT NULL,
  sha256 text NOT NULL,
  bytes integer NOT NULL CHECK (bytes > 0 AND bytes <= 400000),
  width integer NOT NULL,
  height integer NOT NULL,
  alt text NOT NULL,
  section text NOT NULL,
  source text NOT NULL,
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, conversation_id, sha256)
);
ALTER TABLE website_assets ADD COLUMN IF NOT EXISTS project_path text;
UPDATE website_assets SET project_path='assets/images/' || id::text || '.webp' WHERE project_path IS NULL;
ALTER TABLE website_assets ALTER COLUMN project_path SET NOT NULL;
CREATE INDEX IF NOT EXISTS website_assets_owner_project
  ON website_assets(user_id, conversation_id, created_at);
COMMENT ON TABLE website_assets IS
  'Permanent project-owned image copies. Never included in media_jobs 72-hour retention. Originals are private; publication embeds a separate copy.';
COMMIT;
