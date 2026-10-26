---
name: Terminal transport dependency updates
description: Why terminal security updates must cover nested dependencies and preserve privileged access checks.
---

Verify every installed and locked Socket.IO transport dependency, not just the direct parent package. Keep compatible patched-version requirements when the latest parent release still permits older vulnerable versions.

**Why:** A parent-only update retained the affected nested Engine.IO, parser, adapter and WebSocket packages. Privileged-session checks do not replace patching lower-level connection/message handling.

**How to apply:** Review the full dependency tree and a fresh production-dependency audit. Preserve founder-session, separate shell-key, origin and sandbox restrictions. Exercise real loopback WebSocket connections with synthetic sessions; do not execute customer commands or use live credentials in transport tests.

When verifying the full suite without database access, use its CI configuration, not only an unset database variable.

**Why:** Test setup supplies a dummy database URL, which otherwise makes database-dependent tests try to connect to a nonexistent local database.

**How to apply:** Run the isolated suite in CI mode and disclose skipped database checks separately from passed transport tests.
