---
name: GitHub release attribution
description: Avoid unrelated account attribution and distinguish contributors from repository access.
---

The user requires KEYO release commits not to be attributed to unrelated GitHub accounts.

**Why:** A generic release-author noreply address matched an existing unrelated GitHub account. That account appeared in contribution activity despite having no collaborator permissions.

**How to apply:** Derive attribution from the authenticated owner's numeric GitHub ID and login, override both author and committer environment fields, and verify GitHub's resulting account association. Removing old attribution can require rewriting published commits and tags; explain those consequences and obtain explicit approval first. Preserve release asset bytes and checksums.
