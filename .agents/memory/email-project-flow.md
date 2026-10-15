---
name: Email API project flow
description: Project-scoped Email API onboarding and explicit safe key rotation/revocation
---

The user wants Email API organized like the working Afro Auth project flow:
each project contains its own domains, verification, API keys and integration
steps, rather than disconnected global Add domain and New API key buttons.
Include clear regenerate/rotate and revoke actions.

**Why:** The user says the Email API is disorganized and has no visible chance
to regenerate or revoke a key. Other working features must not be deleted.

**How to apply:** Preserve existing integrations and data during an additive
rollout. Replacement keys must overlap before explicit old-key revocation.
Keep website ownership separate from email-sending DNS verification; an Auth
TXT proof alone does not authorize a sending identity. Do not confuse the
displayed public identifier with the server secret or rotate keys merely
because a public identifier appears in a screenshot.

Run the legacy-resource import only once, not on every release.

**Why:** Repeating a domain-association backfill can silently restore a sending
permission the owner deliberately removed. A repeat deployment must preserve
revocation and unlink decisions, not merely preserve credential bytes.

**How to apply:** Test a removed grant across a repeat migration. Rotation must
also retain the original allowance rather than granting fresh usage. Never
display account-wide cached records as a selected project's loading fallback.

Cover legacy writes during the migration-to-restart window.

**Why:** The deployment prepares schemas while the previous server is still
serving requests. A one-time backfill alone misses keys or domains created
after it, leaving otherwise valid integrations without project metadata.

**How to apply:** Test old-style inserts after migration as well as managed
inserts from the new application. Compatibility handling must not create
unneeded legacy workspaces for new project flows or restore removed grants.
