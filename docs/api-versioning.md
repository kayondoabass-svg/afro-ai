# Afro AI API compatibility policy

## Scope and status

v1 is the only supported major version. This release adds explicit version
aliases; it does not introduce v2, change credentials, duplicate databases or
retire legacy routes. The live catalog is `/api/versions` and the public guide is
`/docs/api/versioning`.

Routes are explicitly allowlisted in `shared/api-version-policy.ts`. Do not
replace this with an unrestricted `/api/v1/*` → `/api/*` rewrite. Internal,
founder, database-console and platform-auth routes are intentionally excluded.
Management aliases retain their existing session authentication; they are not
new public API-key endpoints.

## Contract baseline

Every alias uses its existing handler, preserving its method, input fields,
validation, authentication, ownership, quotas, response body, status codes and
content type. The only additional response metadata is
`X-Afro-API-Version: v1` and CORS exposure of that header.

Specific public contracts to preserve:

| Surface | Existing contract |
| --- | --- |
| `POST /api/v1/chatbot/message` | Bearer chatbot API key; JSON `message`, optional `sessionId` and `history`; JSON response `reply` and `sessionId`; existing subscription and quota rules |
| `POST /api/widget-chat/:apiKey` | Existing public widget message contract, including structured support response fields; alias `/api/v1/widget-chat/:apiKey` |
| `POST /api/email-api/send` | Existing email credentials, JSON request and delivery response; alias `/api/v1/email/send`; no internal second send or automatic fallback/retry |
| `/api/ussd/gateway/:appKey` | Existing provider inputs and text protocol, including `CON`/`END` prefixes; alias `/api/v1/ussd/gateway/:appKey` |
| `/cf-auth/t/:slug/*` | Auth contracts recorded in `/openapi.json`; aliases `/cf-auth/v1/t/:slug/*` share the exact operation definitions |

Public widget/USSD preflights must reach their existing endpoint CORS handlers.
Tenant Auth aliases must be normalised **before Hono dispatch** so the tenant
origin allowlist still applies, rather than the generic management CORS branch.
Auth aliases keep their original case sensitivity; Express aliases retain
Express's existing case-insensitive and trailing-slash behaviour.

## Future changes

- Freeze v1's required inputs, field names/types, status meanings and documented
  behaviour. A changed model implementation is not itself a new API version.
- Make compatible additions and bug fixes within v1 when safe; strict clients
  may need consideration even for added fields.
- Do not preserve security vulnerabilities for compatibility.
- Before a breaking change, introduce a separate v2 adapter over the shared
  business service and add contract tests for both versions. Do not just modify
  the common handler and assume v1 remains compatible.
- Do not automatically select the newest version or fall back to another URL
  after an ambiguous paid/destructive request.
- OAuth/provider callback URLs and webhook payloads remain unchanged. A future
  incompatible webhook format needs its own explicit subscription-version
  decision; this release adds no webhook-version selector.
- SDK package versions and MCP protocol versions are independent. Existing and
  future clients/tools should explicitly pin their underlying API contract.
- Before retirement, measure consumer usage, publish a migration guide, notify
  affected customers and announce a date. There is no current retirement date
  and no current `Deprecation` or `Sunset` header.

## Checks and deployment

Run the versioning, Auth versioning and public Auth docs tests. The main
production build does not bundle the Auth Worker; verify that separately too.

Deploy the Express/VPS app for `/api/v1/*` aliases and docs. Deploy the updated
Cloudflare Auth Worker for `/cf-auth/v1/t/*` aliases. Updating one service does
not update the other. No database migration or new secret is required.

Representative post-deployment checks, without paid operations:

```sh
curl -i https://afroaigroup.com/api/versions
curl -i https://afroaigroup.com/api/v1/health
curl -i https://afroaigroup.com/api/v2/health
curl -i https://afroaigroup.com/api/v1/projects
curl -i -X OPTIONS https://afroaigroup.com/api/v1/widget-chat/check-only \
  -H 'Origin: https://customer.example' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type'
```

Expect v1 discovery/health, a JSON unsupported-version 404, an authentication
failure on private projects, and a public widget preflight. Test Auth origins
with an actual configured tenant, never by weakening its origin allowlist.
