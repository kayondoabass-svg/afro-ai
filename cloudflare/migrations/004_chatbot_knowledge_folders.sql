-- Apply only to the verified, dedicated project-files D1 database.
-- Additive: does not migrate, delete or alter existing project/customer data.
CREATE TABLE IF NOT EXISTS chatbot_knowledge_files (
  user_id TEXT NOT NULL,
  widget_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL CHECK (length(CAST(content AS BLOB)) <= 65536),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, widget_id, path)
);
