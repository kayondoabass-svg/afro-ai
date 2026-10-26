-- Apply to the existing project-files D1 database after migration 002.
-- Existing text rows retain NULL encoding. No DDL is performed by requests.
ALTER TABLE project_files ADD COLUMN encoding TEXT;

DROP TRIGGER project_file_command_apply;
CREATE TRIGGER project_file_command_apply_binary
AFTER INSERT ON project_file_commands BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM json_each(NEW.files)
    WHERE coalesce(json_extract(value, '$.encoding'), '') NOT IN ('', 'base64')
  ) THEN RAISE(ABORT, 'Invalid project file encoding') END;
  DELETE FROM project_files
    WHERE user_id = NEW.user_id AND conversation_id = NEW.conversation_id
      AND NEW.mode = 'replace'
      AND path COLLATE NOCASE NOT IN (SELECT json_extract(value, '$.path') FROM json_each(NEW.files));
  INSERT INTO project_files(user_id, conversation_id, name, path, language, content, encoding)
    SELECT NEW.user_id, NEW.conversation_id,
      json_extract(value, '$.name'), json_extract(value, '$.path'),
      json_extract(value, '$.language'), json_extract(value, '$.content'),
      json_extract(value, '$.encoding')
    FROM json_each(NEW.files) WHERE 1
    ON CONFLICT(user_id, conversation_id, path COLLATE NOCASE) DO UPDATE SET
      name = excluded.name, path = excluded.path, language = excluded.language,
      content = excluded.content, encoding = excluded.encoding, updated_at = datetime('now');
  SELECT CASE WHEN
    (SELECT count(*) FROM project_files WHERE user_id = NEW.user_id AND conversation_id = NEW.conversation_id) > 200 OR
    (SELECT coalesce(sum(CASE WHEN encoding = 'base64'
      THEN (length(content) / 4) * 3 - (content LIKE '%==' ) - (content LIKE '%=')
      ELSE length(CAST(content AS BLOB)) END), 0)
      FROM project_files WHERE user_id = NEW.user_id AND conversation_id = NEW.conversation_id) > 5000000 OR
    EXISTS(SELECT 1 FROM project_files WHERE user_id = NEW.user_id AND conversation_id = NEW.conversation_id AND
      (CASE WHEN encoding = 'base64'
        THEN (length(content) / 4) * 3 - (content LIKE '%==') - (content LIKE '%=')
        ELSE length(CAST(content AS BLOB)) END) > 1000000)
    THEN RAISE(ABORT, 'Project file limit exceeded') END;
  DELETE FROM project_file_commands WHERE id = NEW.id;
END;