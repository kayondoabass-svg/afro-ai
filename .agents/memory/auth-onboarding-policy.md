---
name: Auth onboarding policy
description: DNS proof, mailbox proof, storage isolation and non-breaking credential rollout.
---
Keep website ownership proof distinct from email-sending DNS and individual mailbox confirmation. Auth confirmation can use the platform sender; it must not force every customer to register a sending domain.

**Why:** The user wanted a complete project → domain → verification → API-key → private users flow; upstream sending-domain capacity was previously confused with auth setup.

**How to apply:** Explain the three checks separately. An upstream provider's domain quota is an operator capacity issue, not something a customer's Afro AI subscription necessarily fixes.

Preserve existing integrations during DNS-onboarding rollouts. Do not silently revoke legacy keys, retroactively disable established projects, or label legacy domains as verified without proof.

**Why:** DNS ownership requirements were introduced after customer integrations already existed.

**How to apply:** Gate new production projects and new key issuance while clearly distinguishing legacy activity from real DNS verification.

Prefer replacement-key overlap before explicit revocation, and a deliberate email-confirmation POST rather than activation from a GET link preview.

**Why:** Immediate regeneration can interrupt customer apps; automated email scanners can visit links without the mailbox owner's intent.

**How to apply:** Keep secrets one-time and server-only, explain deployment before revocation, and never equate accepted email delivery with verified ownership.

Cloudflare D1 query authorization and schema-import authorization can differ between connected tools.

**Why:** In this environment, a schema change through the connected MCP query API was denied while the approved project's Wrangler import applied the additive migration successfully.

**How to apply:** Verify permissions for the intended operation, use an authorized tool rather than changing credentials blindly, and inspect schema metadata before retrying a migration.

Customer API upgrades must be optional and preserve saved client accounts. The user explicitly objected to clients losing their customers merely because an API was updated.

**Why:** Customer continuity is a standing product requirement, not just a preference for this release.

**How to apply:** Prefer reusing the existing owned project and records when contracts share storage. Never silently create a replacement project, reset passwords, revoke sessions/keys, or delete users. Explain separately when a future genuinely breaking version needs a migration.
