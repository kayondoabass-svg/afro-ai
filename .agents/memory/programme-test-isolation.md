---
name: Programme financial and notification test isolation
description: Why programme acceptance checks must not create ordinary development applications or payments.
---

Use session-local PostgreSQL temporary tables and a mocked mail sender for
end-to-end programme accounting and notification checks, not ordinary fixtures
in the application's development tables.

**Why:** Application and completed-payment records are consumed by background
email and commission workers. A seemingly harmless fixture in the ordinary
database can therefore become a real queued notification or financial record.

**How to apply:** Keep the full acceptance flow on one dedicated connection,
shadow every table it accesses, and replace inherited serial defaults with
temporary sequences so even public sequence counters remain unchanged.
Do not start production workers or send provider messages from these checks.
