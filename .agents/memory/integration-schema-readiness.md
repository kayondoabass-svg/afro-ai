---
name: Integration schema readiness
description: Prevent healthy-looking releases with missing email-project or chatbot verification metadata
---

Check integration schema readiness during application startup, not only in
the VPS deploy script, before allowing the application-ready signal.

**Why:** The live site was running the new code but lacked the email-project
and chatbot ownership tables. A build and service restart had not performed
the deploy script's prerequisite setup. Authentication and basic health still
worked while both signed-in feature pages failed.

**How to apply:** Confirm the database used by the actual running service,
not merely the database configured in the development workspace or an
interactive shell. Check tables, legacy import completion, and compatibility
triggers. Apply only the tested additive setup when missing, then verify
readiness; do not replace the database or reset existing credentials. Prepared
installations use read-only checks without requiring runtime DDL privileges.
Verify production feature reads and preservation of existing resources, not
just an unauthenticated 401 or generic health response. Do not bypass sign-in
to claim a rendered signed-in UI check.

Upgrade checks must also cover installations where an older feature was never
initialized, rather than assuming all legacy feature tables already exist.

**Why:** The programme upgrade attempted to alter an absent legacy affiliate
table. Startup stayed unready, and deployment recovered the previous build.
Tests that pre-created all legacy tables had not represented that installation.

**How to apply:** Test the complete prerequisite chain from partial legacy
schemas before treating an additive upgrade as production-ready. Preserve
existing applications and financial history; do not replace missing setup with
fabricated commissions or replay old payments.
