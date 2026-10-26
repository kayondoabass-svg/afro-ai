Auth branding is a paid product capability for all customers, not a Brightboard-only
customisation. Keep Auth subscriptions distinct from app-builder plans, credit
purchases and Email API quotas. Preserve the advertised Starter/Builder/Business/
Scale prices rather than inventing a new billing catalogue.

**Why:** The founder approved package-dependent branding and supplied screenshots
of the existing Auth prices. Their own Business account must retain full access
without a customer payment.

**How to apply:** Security and callback/session exchange stay available on every
tier. Expiry must fall back to working standard confirmation/recovery mail,
retain saved branding, and never delete customer accounts, keys or sessions.
Auth access applies owner-wide to the package's app allowance; do not market
prepaid access as automatic recurring billing.

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

Investigate tenant-auth email delivery in the deployed authentication Worker separately from mail sent by the main application.

**Why:** The Worker's mail credential was rejected with HTTP 401 while the workspace credential and sender domain worked. These deployments have independent secrets. A saved unverified account or token was not delivery evidence.

**How to apply:** Correlate the failed tenant request with Worker logs and provider acceptance/delivery events. A bound secret name proves presence, not validity; a working workspace credential does not prove the Worker uses it. Preserve existing test accounts and do not repeatedly resend or rotate customer keys to diagnose an outbound-mail failure.

Keep platform sessions host-only and use the site's canonical apex routing
instead of sharing sessions with every customer-controlled subdomain. Migrate
valid legacy cookies without revoking the underlying session; logout clears
both scopes. Credentialed platform CORS must use exact trusted origins.

**Why:** Parent-domain sessions and wildcard credentialed CORS can expose a
platform account to customer-controlled hosts. Earlier mobile host-flip issues
must be handled by canonical routing, not by widening session-cookie scope.

Hosted confirmation/reset forms must preserve their same-host POST Origin.
Do not apply `Referrer-Policy: no-referrer` to these form pages; use
`same-origin` to suppress external referrers without making form submissions
opaque. Never solve this by trusting arbitrary `Origin: null` requests.

**Why:** A real-browser reproduction showed navigation form POSTs under
`no-referrer` sending `Origin: null`, although equivalent JSON API tests passed.

**How to apply:** Test browser-style URL-encoded submissions on legacy and
versioned routes as well as JSON API calls; retain cross-project token checks.

Customer-facing Auth pages must clearly identify the customer's project and
provide a route back to that app, including when a link was already used.
Never send customers to the platform dashboard. Legacy integrations remain
manual; automatic verified-session creation belongs to the configured customer
backend handoff, not a cross-domain platform cookie.

**Why:** The user found hosted error pages stranded their customers on Afro AI
and made the integration appear to belong to the wrong product.

**How to apply:** Use saved, validated project origins for return links; never
forward action tokens or trust a return destination from an email URL.

Backend-managed confirmation and session rotation must be available per project
for all customers, not hard-coded to Brightboard. Initial sign-in is pending
only; confirmation consumes that pending transaction and a one-use backend
exchange creates a fresh verified session. Replace any explicitly identified
previous session without logging out unrelated customers or devices.

**Why:** The user explicitly requested backend-only setup, no customer-facing
iframe, a fresh session after confirmation, and a platform-wide solution.

**How to apply:** Keep API secrets on each customer's backend, validate exact
verified callbacks, bind exchanges to state and PKCE, and require a first-party
cookie from the customer's own server. Preserve existing integrations until
owners enable and install the new handoff.
