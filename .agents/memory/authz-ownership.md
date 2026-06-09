---
name: ownership / IDOR check conventions
description: How to scope resource access by user and the founder-bypass inconsistency to watch for
---

`req.user` shape (set by the Cloudflare auth bridge `cfBridge.ts`) is **`{ claims: { sub, email, ... } }` only — there is NO top-level `req.user.id`** (Passport's deserializeUser passes the same shape through). Read the caller id as `req.user.claims.sub` and the email as `req.user.claims.email`. Compare it against the row's `userId` before returning/mutating any per-user resource (logs, analytics by appId, conversations, zip-exports, secrets).

**`req.user.id` is a silent footgun.** `req.user.id` is `undefined` under cf-auth, so `storage.getUser(req.user.id)` returns undefined and any inline `if (!user?.isFounder) return 403` fails closed → the route 403s / returns empty for everyone. As of the affiliate-visibility fix, server/routes.ts still had ~46 `req.user.id` uses (blog, email marketing, marketplace, domains, api integrations, webhooks) vs ~15 correct `req.user.claims.sub` — the `req.user.id` ones are likely broken under cf-auth and are a high-urgency follow-up sweep. **Founder-only routes should use the `isFounder` middleware** (checks `req.user.claims.email === FOUNDER_EMAIL`), not a hand-rolled `getUser(req.user.id).isFounder` check — that inline pattern was the affiliate-applicants bug.

**Founder-bypass is inconsistent across route families** — watch for this:
- `assertConversationOwner` (server/routes.ts) allows founders via the `FOUNDER_EMAILS` array.
- Chat routes use a singular `FOUNDER_EMAIL`.
- Audio conversation routes grant **no** founder override (strictly owner-only).
This is stricter, not an IDOR, but it means founder/admin access to the same resource family behaves differently per route.

**Why:** an authz audit hardened these paths piecemeal; the founder policy was never unified.

**How to apply:** when touching conversation/audio/log access, prefer routing through one shared owner-check helper and one founder source rather than re-deriving the check inline; don't silently widen founder access when "fixing consistency" unless asked.
