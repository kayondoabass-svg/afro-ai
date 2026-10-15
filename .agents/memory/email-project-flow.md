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
