---
name: Binary project storage decisions
description: Why small imported assets stay with owned project records and Git LFS fails closed
---

Keep bounded binary assets in the same owner-scoped database transaction as project source files, rather than splitting metadata and bytes between the database and object storage.

**Why:** At the existing 1 MB per-file and 5 MB per-project limits, base64 overhead is bounded. A single transaction avoids partially imported projects, orphaned objects, and new public asset URLs.

**How to apply:** Revisit object storage only if transfer limits grow; design transactional finalization, ownership checks, and cleanup before moving bytes.

Git LFS objects are not supported by this transfer flow; never fetch pointer URLs or treat pointers as complete assets.

**Why:** Git blob transfer does not transfer LFS objects, and silently exporting raw binaries into an LFS-tracked repository can break downstream checkouts.

**How to apply:** Preserve explicit pointer exclusions and fail-closed export checks until a separate authenticated LFS protocol is implemented.

Keep project-file storage separate from the existing authentication and legacy production D1 databases.

**Why:** The configured droplet database ID did not resolve. The user authorized a new, dedicated database rather than repurposing either existing database or copying their records. Similar table names are not evidence that these stores should be merged.

**How to apply:** Check live identity against the configured expected database name before migrations. Do not consolidate stores or migrate legacy data without a separate, reviewed plan.

Apply trigger-containing D1 migrations through Wrangler's remote file import, not the REST query endpoint.

**Why:** The query endpoint returned “incomplete input” for complete SQLite triggers, including when sent individually. Wrangler's file-import path successfully applied the same migration.

**How to apply:** Use an explicit database binding and remote file import after identity checks; verify schema afterward. Do not repeatedly run a non-idempotent ALTER TABLE migration.