-- Additive diagnostics only: no users, keys, sessions or email tokens changed.
CREATE TABLE IF NOT EXISTS tenant_mail_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT,
  message_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tenant_mail_events_project ON tenant_mail_events(tenant_id,created_at DESC);
CREATE TABLE IF NOT EXISTS tenant_mail_health (
  id INTEGER PRIMARY KEY CHECK(id=1),
  status TEXT NOT NULL,
  checked_at INTEGER NOT NULL
);
