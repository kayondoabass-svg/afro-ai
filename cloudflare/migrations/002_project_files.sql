-- Apply to the existing project-files D1 database, not the auth database.
-- No existing rows are removed. Duplicate paths cause a visible migration
-- failure and require operator resolution.
CREATE TABLE IF NOT EXISTS project_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL, user_id TEXT NOT NULL,
  name TEXT NOT NULL, path TEXT NOT NULL,
  language TEXT DEFAULT 'html', content TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS project_files_owner_path
  ON project_files(user_id, conversation_id, path COLLATE NOCASE);

-- Commands are consumed within the same SQLite statement/transaction.
CREATE TABLE IF NOT EXISTS project_file_commands (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('merge','replace')),
  files TEXT NOT NULL CHECK(json_valid(files))
);
CREATE TRIGGER IF NOT EXISTS project_file_command_apply
AFTER INSERT ON project_file_commands BEGIN
  DELETE FROM project_files
    WHERE user_id = NEW.user_id AND conversation_id = NEW.conversation_id
      AND NEW.mode = 'replace'
      AND path COLLATE NOCASE NOT IN (SELECT json_extract(value, '$.path') FROM json_each(NEW.files));
  INSERT INTO project_files(user_id, conversation_id, name, path, language, content)
    SELECT NEW.user_id, NEW.conversation_id,
      json_extract(value, '$.name'), json_extract(value, '$.path'),
      json_extract(value, '$.language'), json_extract(value, '$.content')
    FROM json_each(NEW.files) WHERE 1
    ON CONFLICT(user_id, conversation_id, path COLLATE NOCASE) DO UPDATE SET
      name = excluded.name, path = excluded.path, language = excluded.language,
      content = excluded.content, updated_at = datetime('now');
  SELECT CASE WHEN
    (SELECT count(*) FROM project_files WHERE user_id = NEW.user_id AND conversation_id = NEW.conversation_id) > 200 OR
    (SELECT coalesce(sum(length(CAST(content AS BLOB))), 0) FROM project_files WHERE user_id = NEW.user_id AND conversation_id = NEW.conversation_id) > 5000000 OR
    EXISTS(SELECT 1 FROM project_files WHERE user_id = NEW.user_id AND conversation_id = NEW.conversation_id AND length(CAST(content AS BLOB)) > 1000000)
    THEN RAISE(ABORT, 'Project file limit exceeded') END;
  DELETE FROM project_file_commands WHERE id = NEW.id;
END;