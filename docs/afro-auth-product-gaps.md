# Afro Auth product: source-code review

Scope: customer-facing `/cf-auth/t/:slug/*` and `/cf-auth/v1/*` in the current Worker. This is not a production penetration test or a claim that a live exploit occurred.

## Present foundations

Tenant-scoped users and user lookups; hashed passwords; hashed tenant secret keys; API-key creation and revocation; login throttling; JWT signature/expiration checks; tenant-ID checks on session verification; and a project-management UI.

## Priority gaps

1. **Tenant session lifecycle:** tenant JWTs last 30 days and verification checks token claims, not a revocable tenant session record. No tenant logout/revocation, refresh-token rotation, or “logout all devices” flow was found. Platform device management does not fix this.
2. **Tenant recovery and verification:** tenant signup returns a usable token with `email_verified: 0`. Tenant-specific email-confirmation and forgotten-password/reset routes are missing. Existing platform reset endpoints query only the platform tenant.
3. **Signing trust and rotation:** platform, tenant, and OAuth-state tokens share a signing secret. The tenant verifier does not enforce a configured issuer/audience as the new platform verifier does. There is no versioned key rotation/JWKS service or public-key verification setup.
4. **Origin configuration defect:** management writes `allowed_origins` as JSON, while CORS reads it by splitting on commas/whitespace. Configured origins can fail to match. An empty list allows all origins. CORS is not authorization and does not protect against non-browser clients.
5. **Tenant OAuth flow:** OAuth state accepts a tenant, but callbacks use the platform session-issuance path rather than a complete tenant session handoff. The updated platform issuer rejects non-platform accounts; this must not be advertised as working tenant social login until a separate, tested flow exists.
6. **Platform boundary:** the platform cookie is shared across subdomains that may host customer content. Host-only cookies and coordinated apex/www routing, or separate hosting domains, need a careful rollout. CORS does not prevent a server on a customer subdomain from receiving a domain-scoped cookie.

## Additional improvements

- MFA/passkeys, recovery codes, and step-up authentication for sensitive account actions.
- Stronger password policy and compromised-password checks; current tenant signup allows six characters.
- Security audit events, suspicious-login notifications, and customer-visible session history.
- Tests proving cross-tenant isolation for API keys, OAuth, recovery links, and every management endpoint.
- Customer SDK documentation that clearly separates public keys, server-only secret keys, and user tokens; integration/contract tests and a versioned API schema.
- Consistent abuse controls and resource limits on all tenant and management routes; operational monitoring for auth failures.

## Suggested order

First complete tenant verification/recovery/session revocation and correct origin parsing. Then isolate signing keys and add a tested rotation design. Address customer-domain cookie isolation before treating the combined hosting/auth platform as hardened.