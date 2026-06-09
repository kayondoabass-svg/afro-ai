---
name: ownership / IDOR check conventions
description: How to scope resource access by user and the founder-bypass inconsistency to watch for
---

`req.user` shape (set by the Cloudflare auth bridge, `server/replit_integrations/auth/cfBridge.ts`) is `{ claims: { sub, email, ... } }` only — there is **NO** top-level `req.user.id` (it is always `undefined`; Passport's deserializeUser passes the same shape through). Always read the caller id as `req.user.claims.sub` and the email as `req.user.claims.email`.

**`req.user.id` is a silent footgun.** Reading it yields `undefined`, so `storage.getUser(req.user.id)` returns undefined and any inline `if (!user?.isFounder) return 403` fails closed → the route 403s / returns empty for everyone. A guardrail test (`server/__tests__/no-req-user-id.test.ts`) now fails CI if `req.user.id` / `req.user?.id` reappears in `server/routes.ts`. Compare the id against the row's `userId` before returning/mutating any per-user resource (logs, analytics by appId, conversations, zip-exports, secrets).

**Founder routes:** gate truly founder-only routes with the `isFounder` middleware (checks `req.user.claims.email === FOUNDER_EMAIL`). But routes where founders are merely *exempt from a limit* (e.g. USSD app / chatbot subscription caps) must stay `isAuthenticated` + an inline `FOUNDER_EMAILS.includes(email)` exemption — converting them to `isFounder` would lock out normal users. Don't use a hand-rolled `getUser(req.user.id).isFounder` check — that inline pattern was the affiliate-applicants bug.

**Founder-bypass is inconsistent across route families** — watch for this:
- `assertConversationOwner` (server/routes.ts) allows founders via the `FOUNDER_EMAILS` array.
- Chat routes use a singular `FOUNDER_EMAIL`.
- Audio conversation routes grant **no** founder override (strictly owner-only).
This is stricter, not an IDOR, but it means founder/admin access to the same resource family behaves differently per route.

**Why:** an authz audit hardened these paths piecemeal; the founder policy was never unified.

**How to apply:** when touching conversation/audio/log access, prefer routing through one shared owner-check helper and one founder source rather than re-deriving the check inline; don't silently widen founder access when "fixing consistency" unless asked.
