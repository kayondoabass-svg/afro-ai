# Full-stack database setup and Stage C hosting

## Existing services remain separate

Afro AI's PostgreSQL stores project metadata and owner-bound infrastructure records.
Its existing D1 file store holds source files. A managed project D1 database holds
that project's business data only. Existing website publishing is unchanged.

Apply `migrations/000_project_infrastructure.sql` to the existing PostgreSQL database
before enabling database setup. Do not run this migration against D1. Requests never
create PostgreSQL tables.

The server uses `CLOUDFLARE_ACCOUNT_ID` (or existing `R2_ACCOUNT_ID`) and
`CLOUDFLARE_PROJECTS_API_TOKEN` (preferred restricted token), falling back to the
existing server-only `CLOUDFLARE_API_TOKEN`. A configured token is not proof of
permission: Cloudflare must authorize the operation. Never pass these credentials
to project files, a browser, a user Worker or a build.

## Current database controls

- Authenticated owner checks; no founder bypass; unknown/foreign IDs return 404.
- Exact management-origin checks on mutations, in addition to authentication.
- No browser-supplied database ID, SQL, destination, account or secret.
- Two retained database setups per user; five setup attempts per UTC day.
- Setup attempts, readiness and deletion are recorded without query contents.
- Persistent random resource names and identity verification before changes.
- A create attempt is recorded *before* Cloudflare is called. After an ambiguous
  response, retry discovers the same resource. If none can be confirmed, automatic
  creation stops for administrator reconciliation instead of risking a duplicate.
- Only the fixed, audited, idempotent starter migration runs automatically.
  Custom schema changes need a future reviewed migration flow.
- Configuration updates preserve unrelated edits and use stale-write protection.
- Setup failure retains source files and any partially created database.
- Expired paid access blocks setup and paid source editing, but not owner-requested
  resource deletion or viewing setup status.
- Database deletion requires the exact project name and permanently removes its
  business data. There is no automatic deletion on subscription expiry.
- Project deletion is blocked until its database deletion is confirmed. PostgreSQL
  uses a restrictive foreign key, and the same project lock covers setup/deletion.
- Deleted database records are not automatically recreated. Start a new project.

An operator reconciling an ambiguous creation must check the exact recorded resource
name in the configured Cloudflare account. Never clear `create_attempted` merely
because a request timed out. Match ownership and identity before any correction.

## Stage C: intentionally NOT activated

Database-ready is not app-live. No customer build scripts or application code are
executed by Afro AI's server in this stage. Static HTML publishing is not a Worker
deployment. API settings cannot enable hosting.

For multi-tenant execution, use Cloudflare Workers for Platforms sandboxed user
Workers, not the platform's own privileged Worker. Each user Worker gets its own D1
binding only. Never bind Afro AI's PostgreSQL, authentication storage, source-file
store, service credentials, dispatch namespace or management services.

Required before activation:

1. An isolated build service with immutable source snapshots, pinned dependencies,
   no platform credentials, controlled network access, time/resource limits and no
   access to Afro AI's source tree. Do not execute user package scripts on the app server.
2. A distinct customer-app registrable domain, separate from the management login
   site and cookies. A sibling subdomain is insufficient where parent-domain
   cookies are used. Review CORS, cookie scope, CSRF and OAuth redirects together.
3. An authenticated dispatch/control plane, owner-only deployment records, binding
   allowlists, outbound-fetch policy, and no customer-supplied account/resource IDs.
4. Separate preview and production databases; preview must not mutate live data.
5. Enforced per-project request/CPU/build limits, emergency suspension, and periodic
   usage reconciliation. Billing alerts are not hard spend caps.
6. Health checks before activating a release, safe rollback of code, and explicit
   approval for destructive schema changes. Rolling code back does not restore data.
7. An authorized live pilot, cross-tenant penetration tests and a billing review.

Suggested pilot values (PROPOSED, NOT ENFORCED hosting guarantees): one live app per
paid user, 10 builds per day, 100,000 requests per month per app, and 50 ms CPU per
request. Confirm feasibility, plan economics and abuse controls before activation.

## Published provider pricing checked 2026-10-03

Workers for Platforms:
- $25/month platform subscription.
- Includes 20 million requests, 60 million CPU milliseconds and 1,000 scripts/month.
- Additional usage: $0.30/million requests, $0.02/million CPU milliseconds,
  $0.02/additional script.

D1 on Workers Paid:
- First 25 billion rows read/month included; then $0.001/million rows read.
- First 50 million rows written/month included; then $1/million rows written.
- First 5 GB storage included; then $0.75/GB-month.

Allowances are shared at account/product level, not multiplied by each project.
Existing Afro AI workloads may consume D1 allowances. An idle database still uses
a small amount of storage. D1 costs depend on scanned rows and indexes, not only
HTTP request counts. Builds, asset storage, additional products, taxes and domains
are not included in the $25 figure. Confirm the account's actual subscriptions
before estimating the total bill.

Sources:
- https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/

No Cloudflare plan purchase, customer database creation, Worker deployment or live
customer execution is authorized merely by this document.