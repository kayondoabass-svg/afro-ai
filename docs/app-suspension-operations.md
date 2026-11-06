# App suspension and hosting expiry

This extends the existing published-app lifecycle. It does not delete apps,
projects, source files, assets, payments or existing records.

## Hosting versus daily usage

- Starter hosting uses the existing 30-day window from the publication record's
  original `created_at`. The existing scheduler checks at startup and every six
  hours; this is not a promise of second-accurate expiry.
- After expiry public serving is blocked. Saved work remains in the owner's
  account. Existing daily free limits, midnight reset and credit-purchase flow
  are unchanged. A daily reset does not renew public hosting.
- Founder identity is exempt from free-hosting expiry.
- Public offline responses have `Cache-Control: no-store`. Private reasons
  belong in owner/founder views and email, not the public offline page.

## Status changes and notification evidence

Startup adds `app_status_events` before routes become ready. New administrator
and expiry transitions write status, reason, actor, timestamp and pending
notification together in one PostgreSQL transaction. No existing history is
invented or backfilled, and existing suspended apps are not bulk emailed.

The worker claims pending suspension events once and uses the existing email
provider and a stable idempotency key. Provider acceptance is `accepted`, never
`delivered`. For Resend, safe provider retrieval updates the recorded result.
SES acceptance alone is explicitly unconfirmed.

Failed or uncertain notifications remain visible for review; ambiguous sends
are not automatically retried. No credentials, message bodies, verification
links or reset tokens are written to logs. An email failure cannot reactivate
a suspended app or delete saved work.

Hosting-plan payment and account-level restoration only clear the exact
existing free-hosting-expiry reason. Administrative suspensions, unknown
reasons, customer unpublishing and pending removal require separate review.

## Founder details

`GET /api/admin/published-apps/:id/details` uses the existing founder guard
and `Cache-Control: private, no-store`. Dates returned from PostgreSQL are
serialized as ISO 8601 strings in UTC; the client renders in the viewer's
timezone. Missing dates are not replaced with the current time.

The response explicitly projects app metadata, owner metadata, verified
project associations, recent owner payments, owner USSD subscriptions and
gateway metadata, and new status/notification history. HTML, API keys,
passwords, session secrets and provider payloads are excluded.

Owner payments and USSD records are labeled owner-level, not assumed to be
app-specific. Unavailable related queries are `null` and named in
`unavailableSections`, not represented as successful empty results.

## Verification

Lifecycle database tests use unique temporary PostgreSQL schemas, mock email
sending and provider retrieval, and drop only their own test schema.
No customer suspension or live notification is needed to run them.
