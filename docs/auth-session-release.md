# Authentication session release

This change keeps Afro AI's current Cloudflare + Express authentication. It does not use Clerk.

## Deployment prerequisites and order

1. Apply `cloudflare/migrations/0006_device_sessions.sql` to the existing **afro-ai-auth** D1 database, not the project-files database or PostgreSQL:
   ```
   cd cloudflare
   npx wrangler d1 execute afro-ai-auth --remote --file=./migrations/0006_device_sessions.sql
   ```
2. Confirm the Express Cloudflare API credential can read and update this auth database. Device-session checks fail closed if that access fails. The auth database identity matches `cloudflare/wrangler.toml`.
3. Coordinate deployment of the Worker (`cloudflare/`) and Express/frontend release. Both must have the same existing JWT signing secret. No signing secret is changed by this patch.
4. Confirm both releases completed. A GitHub push alone does not update the droplet or Worker.

**Impact:** legacy JWTs and Passport sessions do not have revocable session records. Users must sign in again. Accounts, projects and passwords are not deleted. During mixed-version deployment logins may fail; schedule a short coordinated release window. Do not deploy one side and leave the other unchanged.

**Rollback:** reverting only one side is not safe. Reverting both to the old stateless authentication removes revocation enforcement and could reaccept old JWTs. Treat a rollback as a security decision, not just a visual restore; prefer a forward fix.

## Acceptance checks after release

- Signup sends one verification message. Unverified users cannot access protected features.
- Both old frontend verification links and new backend verification links complete confirmation.
- Log in on two devices; Settings → Account security → Logged-in devices lists both. Locations are approximate at sign-in; Passport/TikTok may display “Location unavailable.”
- Revoke device B from A. B's next protected request is rejected. Its UI rechecks identity periodically and on focus.
- Request a reset from Settings; use the emailed link; set a new password. Both former sessions are revoked and only a newly created session remains on the reset device.
- Reusing or using an expired reset link fails. Other users are unaffected.
- Log out and verify that replaying the former cookie fails.

## Verification boundaries

Local automated tests use temporary SQLite databases and mocked email transport. They do not send real emails, exercise production permissions, or establish deliverability. Protected Settings is component-tested; the signed-in production UI needs post-release verification.

The customer-facing tenant authentication API is distinct from platform login. It has not acquired platform session revocation, reset flows, or verification enforcement from these changes. Automatic signing-key rotation is not implemented.