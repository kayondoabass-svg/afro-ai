# Customer-app authentication release

This is custom Afro Auth on the existing auth D1 database, not Clerk. Do not confuse the auth database with project-files D1. Signing-key rotation and platform cookie-domain changes are separate work.

## Breaking integration changes

- Signup returns `{verificationRequired:true,user}` without a token. It sends one email with a POST confirmation form; merely fetching a link does not activate the account.
- Unverified accounts cannot log in. Existing accounts need confirmation through `/send-verification`.
- Tenant JWTs now expire after 24 hours and require a live session record. All legacy stateless JWTs are rejected. Integrators must handle a new login; refresh-token rotation is not part of this release.
- New/reset passwords must have 12–128 characters. Existing passwords still work after email verification.
- Empty allowed origins deny cross-origin browser calls. Configure exact origins in the project dashboard before switching clients. HTTPS only except HTTP localhost/127.0.0.1. Legacy comma-separated settings remain readable.
- Email reset invalidates the user's sessions and outstanding recovery/authorization links in this tenant only. It does not log the user into their customer app automatically; they sign in again.

## Release order

1. Update customer integrations for the new signup response and expired-session handling.
2. From the current checkout, apply the additive migration to the EXISTING auth database:
   ```
   cd cloudflare
   npx wrangler d1 execute afro-ai-auth --remote --file=./migrations/0007_tenant_auth.sql
   ```
   Fresh databases need schema.sql followed by this migration. Existing platform rollout also needs migration 0006.
   The migration preserves customer accounts and moves existing tenant OAuth links into a tenant-scoped table, removing only legacy links confirmed copied. This prevents a tenant provider identity from blocking platform login.
3. Ensure the Worker has its existing Resend sender/key and OAuth provider credentials. Never run setup.sh against production; it can replace signing secrets.
4. Publish the updated Worker through the existing release process. Release the frontend documentation changes on the droplet.
5. Exercise signup → email confirmation → login → logout; reset across two sessions; and both configured OAuth providers on real customer origins.

Do not roll back only the session verifier to stateless JWT validation: that would restore acceptance of revoked credentials.

## Customer API

All routes are under `/cf-auth/t/:slug`.

| Method | Route | Input |
|---|---|---|
| POST | `/signup` | email, password, optional firstName/lastName |
| POST | `/login` | email, password |
| POST | `/send-verification` | email |
| POST | `/forgot-password` | email |
| GET/POST | `/verify-email` | hosted form; JSON POST accepts token |
| GET/POST | `/reset-password` | hosted form; JSON POST accepts token and password |
| GET | `/me` | Bearer user token |
| GET | `/sessions` | Bearer user token |
| DELETE | `/sessions/:id` | Bearer user token; owned session only |
| POST | `/logout` or `/logout-all` | Bearer user token and `{}` |
| POST | `/oauth/exchange` | code, code_verifier, redirect_uri |

Recovery requests use generic responses to avoid account discovery; they do not guarantee delivery. Email failures are logged without credentials. Signup explicitly reports delivery failure, while retaining the account for a later resend. Issuance has a one-minute account cooldown and IP/email rate limits.

## OAuth

Generate a high-entropy PKCE verifier in the integrating client, keep it in that browser session, and derive its SHA-256 base64url challenge. Navigate to `/cf-auth/google/start` or `/cf-auth/github/start` with tenant slug, exact redirect_uri, and code_challenge. The callback origin must be registered. The provider flow is bound to an HttpOnly state cookie.

After the provider callback, the customer receives a single-use code, valid for 60 seconds, not a JWT in the URL. Remove the code from the browser URL, then exchange it with the original verifier and identical redirect_uri. Never substitute a verifier received from another browser. Verification comes from Google’s verified-email claim or GitHub’s verified email list.

Server integrations must call `/cf-auth/v1/sessions/verify` with their server-only secret key and user token on every protected operation. Offline JWT verification alone cannot enforce session revocation.

## Verification limits

SQLite-backed tests exercise real SQL and JWTs with mocked email/OAuth network calls. No production migration, real email delivery, or real provider consent flow is performed by the test suite. Follow post-release checks before advertising live availability.