---
name: SQLite CLI error handling portability
description: Why SQL error-path tests need statement boundaries across runner versions
---

Do not assume SQLite CLI versions continue through the rest of an input line after a statement fails. Put expected-failure statements and subsequent verification queries on separate lines.

**Why:** The development CLI continued through same-line statements, while GitHub's Ubuntu CLI skipped the verification queries after the deliberate constraint error. Local tests passed but CI returned empty verification output.

**How to apply:** When testing rollback with the CLI, distinguish database behavior from CLI input handling and verify against the actual CI runner before claiming a fix.