# Workspace migration verification

This is a preservation-only port. Android implementation, inference-engine
upgrades, GitHub/Hugging Face releases and production deployment are separate.

## Verified

- The existing website runs in the web artifact, with the original CSS,
  fonts and branding. Desktop and phone previews were checked.
- The existing Express server runs in the API artifact. The gateway preserves
  API, Socket.IO, uploads, public documentation and KEYO download routes.
- The existing `/shell-ws` transport is explicitly routed to the API. Its
  Engine.IO WebSocket upgrade was checked through the shared gateway. The
  configured workspace HTTPS origin is accepted in development only; unrelated
  nested domains are rejected. Founder/session/key checks are unchanged.
  Nine focused transport/security/gateway tests pass. The real workspace-origin
  WebSocket request receives HTTP 101 and an Engine.IO handshake; an unrelated
  origin is denied. The shell namespace correctly reports `Sandbox unavailable`
  in this environment, so interactive Docker execution is not certified.
- Public health, Auth documentation, OpenAPI and KEYO release endpoints return
  HTTP 200. The anonymous account endpoint returns HTTP 401.
- The complete legacy VPS release build and the web artifact build pass.
  Compiled backend and workspace entry-point syntax checks pass.
- KEYO's existing 44 engine/package tests pass. Its source remains unchanged
  at `0.1.0-alpha.5`; all five generated release-asset checksums match.
- The full application run passed 184 suites and 1,559 tests, with one skipped
  test. The missing legacy voice folder was then restored, and its two tests
  passed in a targeted rerun.
- Shared workspace library type checks pass.
- Post-merge setup succeeds with a frozen pnpm install, transport security
  checks and parse5/jsdom smoke checks. It does not push database schemas.

## Existing failures and verification limits

- One deployment timeout assertion failed: the test expects a particular
  two-second curl request, while the existing function uses up to five seconds
  and reduces the timeout near its deadline. The health-check implementation
  is byte-for-byte unchanged by the migration; it still enforces 60 seconds.
- The legacy full application type check is not clean. Its existing strictness
  and declaration issues are not repaired by this source-layout migration.
  CI retains the prior non-blocking legacy type-check policy.
- An earlier Pesapal startup authentication check returned HTTP 520; the final
  restart verified the configured credentials successfully. No payment was
  attempted, so live payment acceptance is not verified.
- The terminal sandbox cannot start without its Docker environment. Production
  terminal infrastructure was not changed or certified here.
- Signed-in founder/customer pages were not verified in a browser. Existing
  authentication, tenant-isolation and payment tests ran, but real Cloudflare
  cookie/provider flows still need the owner's parity check.
- PostCSS/chunk-size warnings remain; builds succeed. The external development
  preview also logs React development warnings; the captured desktop and phone
  views rendered successfully.

## Release compatibility

Use the managed web/API workflows for workspace development. Root `client`,
`server` and `shared` paths are compatibility links for established tools.
The full external VPS release command remains:

```sh
pnpm exec tsx script/build.ts
```

It produces the existing `dist/index.cjs`, `dist/public` and
`dist/keyo-studio` outputs. The deploy script and GitHub CI install the frozen
pnpm lockfile rather than relying on the removed npm lockfile.

No production database migration, VPS deployment or Cloudflare Worker
deployment was performed as part of this port.
