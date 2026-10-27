---
name: Migration install parity
description: Why frontend preview success alone does not establish a safe package-layout migration.
---

# Deployment runner transitions

Run the new deployment script when changing package managers, without advancing
the production checkout before it records the previous revision.

**Why:** A running Bash script keeps its old implementation after `git pull`;
an npm-era runner can pull pnpm sources and still execute `npm ci`. Pulling
before starting the new runner can instead hide the dependency change.

**How to apply:** Fetch the authorized revision, extract its deployment script
to a temporary file, and run that script against the unchanged checkout. Verify
the fetched revision first and retain normal locking, health and rollback checks.

Check a clean dependency install, backend cold start and the full legacy release
pipeline before accepting a package-layout migration.

**Why:** npm hoisting concealed undeclared direct imports, and compatibility
symlinks resolved differently in the dev server, TypeScript and production
bundler. A correctly rendered frontend did not establish backend/build parity.

**How to apply:** retain existing dependency versions, declare formerly implicit
imports, and exercise server startup, production bundling and source exports
separately. Do not infer all three from a working Vite preview.

Inventory custom WebSocket/Socket.IO transport paths separately from Express
routes, and verify an actual gateway upgrade with the browser's real origin.
**Why:** route inventories and isolated transport tests can both pass while a
custom transport path is still sent to the SPA instead of its API handler.
