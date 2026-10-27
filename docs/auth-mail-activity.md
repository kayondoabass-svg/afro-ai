# Auth mail timestamps and delivery evidence

Owner-authenticated endpoints:

- `GET /api/auth-projects/:id/branding`: `recentMail` combines tenant verification/
  recovery events and owned branding previews. No send or provider lookup occurs.
- `POST /api/auth-projects/:id/branding/mail-status/refresh`: checks up to four
  existing message IDs. It never sends mail. Requires the same owner, browser
  origin protection and private/no-store responses as branding settings.
- `GET /cf-auth/v1/admin/tenants/:id/mail-status` and its `POST .../refresh`
  counterpart provide Worker sender diagnostics and tenant mail events.

`created_at`, `updated_at`, `health.checkedAt`, and delivery-check `checkedAt`
are **ISO 8601 UTC strings** (for example `2026-10-27T03:00:00.000Z`), or
`null` when unavailable. Responses include `timestampFormat`.
Legacy Unix-second, Unix-millisecond and timezone-qualified ISO values are
normalized at the API boundary without rewriting stored event timestamps.
The browser formats the actual instant in the viewer's device timezone;
missing/invalid timestamps render **Time unavailable**, never the current time.

The original `outcome` remains the recorded submission outcome. Branding
activity's optional `delivery` object has `status`, `error`, and `checkedAt`.
Provider lookup results are saved as separate owner/project-scoped audit
snapshots; they do not rewrite original mail records. `checkedAt` is the lookup
time, **not** an invented send/delivery time.

Accepted, sent, queued and scheduled are not delivered. Delivered means the
provider reported delivery to the receiving mail server, not inbox placement,
ownership verification or a user opening the email. Lookup failures retain the
last recorded submission outcome and show a safe explanation. Worker refresh
can promote accepted events only upon a recognized provider delivery result.
Branding previews are inert and do not create real verification sessions.

Never log provider credentials, full provider responses, mail bodies,
confirmation links or reset tokens. Only fixed safe error messages and status/
message identifiers are returned; diagnostic refresh never retries a send.
