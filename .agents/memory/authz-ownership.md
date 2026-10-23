---
name: ownership / IDOR check conventions
description: How to scope resource access by user and the founder-bypass inconsistency to watch for
---

Users must only have access to their own content.

**Why:** The user explicitly required: "users only have access to their content only."

**How to apply:** Customer-facing management routes must derive ownership from
the authenticated identity, never a request-body owner, supplied project ID,
subscription tier, or UI visibility. Test direct cross-account reads and writes
as well as nested-resource swaps. Keep explicit administrator functions
separate from customer ownership checks; a quota exemption is not permission
to read another customer's private content.

Private payment data and caches must match the particular signed-in customer;
one client's information must not appear for another client.

**Why:** The user explicitly requested account-matched payment information and
said, "let cache not expose things of one client to another."

**How to apply:** Treat browser query caches, persisted checkout state, account
switches, shared devices and intermediary caches as part of the ownership
boundary, not just database queries. Preserve explicit founder oversight through
separate authorized administration views, never through customer-cache fallbacks.

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
