# Chat website persistence and editing

Generated website HTML now links its owned conversation to a website project when a saved version exists. Clarification-only chat does not create an empty project. Publication returns the project/conversation IDs, and the publish result, Dashboard live sites and My Apps provide editing and Afro Auth setup handoffs.

Existing published sites can be recovered from Dashboard or the My Apps actions. Recovery uses owner-scoped publication metadata, not title matching. If exactly one owned conversation contains the published source, it is reused. Otherwise recovery creates a labelled conversation containing the surviving published HTML, rather than guessing which older project owns it. This cannot reconstruct CSS/assets/source that were never retained separately.

Source recovery merges the saved `index.html` into Files. It does not delete sibling files or overwrite a manually changed index that differs from retained generated snapshots. Failures leave the saved website snapshot intact and are reported separately. The Files panel provides an explicit source-sync action; retrying this operation does not invoke an AI provider.

Afro Auth handoff resolves the owned publication/project association before prefilling setup. Tenant creation still requires confirmation. Opening setup is not evidence that login has been installed in a generated website, that its domain has been verified, or that users have been migrated.

No new database is introduced. Project/conversation/version records use the existing PostgreSQL store; project files use the existing dedicated Cloudflare D1 file store. The workspace database identity and required migrations are checked using `npx tsx scripts/project-files-d1-preflight.ts --require-ready`. Workspace settings do not change the VPS environment.

## Release verification

- Full Vitest suite and production build.
- Owner checks, repeat recovery, conflicting source rejection and manual-source preservation tests.
- Temporary owner-scoped storage probe for concurrent project creation, real file merges, legacy recovery and cleanup.
- Desktop/mobile component fixtures, clearly distinguished from a signed-in live session.
- Public preview still requires authentication; no temporary auth bypass is introduced.

Pushing source is not a VPS deployment. Use the existing reviewed VPS release procedure, verify its environment/preflight, and then verify the signed-in customer flow on the live release.
