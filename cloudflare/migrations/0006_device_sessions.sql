-- Apply to afro-ai-auth before releasing the Worker and Express session changes.
CREATE TABLE IF NOT EXISTS device_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  device TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_device_sessions_email ON device_sessions(email, expires_at);