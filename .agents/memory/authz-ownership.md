---
name: ownership / IDOR check conventions
description: How to scope resource access by user and the founder-bypass inconsistency to watch for
---

`req.user` shape (set by the Cloudflare auth bridge) is `{ id: claims.sub, claims: { sub, email, ... } }`. Read the caller id as `req.user?.claims?.sub` (fall back to `req.user?.id`). Compare it against the row's `userId` before returning/mutating any per-user resource (logs, analytics by appId, conversations, zip-exports, secrets).

**Founder-bypass is inconsistent across route families** — watch for this:
- `assertConversationOwner` (server/routes.ts) allows founders via the `FOUNDER_EMAILS` array.
- Chat routes use a singular `FOUNDER_EMAIL`.
- Audio conversation routes grant **no** founder override (strictly owner-only).
This is stricter, not an IDOR, but it means founder/admin access to the same resource family behaves differently per route.

**Why:** an authz audit hardened these paths piecemeal; the founder policy was never unified.

**How to apply:** when touching conversation/audio/log access, prefer routing through one shared owner-check helper and one founder source rather than re-deriving the check inline; don't silently widen founder access when "fixing consistency" unless asked.
