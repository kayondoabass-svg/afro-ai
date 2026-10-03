-- Apply to Afro AI's existing PostgreSQL database, NOT any Cloudflare D1 database.
-- Restrict deletion so ordinary project deletion cannot orphan a paid resource.
CREATE TABLE IF NOT EXISTS project_infrastructure (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE RESTRICT,
  user_id VARCHAR NOT NULL REFERENCES users(id),
  database_name TEXT NOT NULL UNIQUE,
  database_id TEXT UNIQUE,
  create_attempted BOOLEAN NOT NULL DEFAULT FALSE,
  state TEXT NOT NULL CHECK (state IN ('provisioning','ready','failed','deleting','deleted')),
  migrations_applied INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS project_infrastructure_owner ON project_infrastructure(user_id);
CREATE TABLE IF NOT EXISTS project_infrastructure_events (
  id BIGSERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  user_id VARCHAR NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS project_infrastructure_events_owner_time ON project_infrastructure_events(user_id, created_at);