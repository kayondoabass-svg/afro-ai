# Production cache purge

The production site uses the active Cloudflare zone `afroaigroup.com`,
zone ID `054b9e09ddbce13503c356da74184d9c`. Zone identity was confirmed
with Cloudflare's zone API. An active token with zone-read or D1 access
does not necessarily have cache-purge access.

Create a dedicated custom Cloudflare API token with:

- Permission: **Zone → Cache Purge → Purge**.
- Zone resources: **Include → Specific zone → afroaigroup.com** only.
- No D1, Workers, DNS, account-write, or token-management permissions.

Store it as `CLOUDFLARE_PURGE_TOKEN` in the production shared environment
(`/srv/afro-ai/shared/.env`) through a secure administrator session.
Keep `CLOUDFLARE_ZONE_ID` set to the ID above. Do not replace
`CLOUDFLARE_API_TOKEN`, change D1 bindings, or modify either database.
Token verification alone is not proof of purge permission; the actual
purge must return HTTP success, `success: true`, and a purge result ID.

To retry only the cache purge, without pulling code, rebuilding, restarting,
or touching databases, run on the droplet:

```bash
(
  set +x
  set -a
  source /srv/afro-ai/shared/.env
  set +a
  node /opt/afro-ai/scripts/purge-cloudflare.mjs
)
```

Never enable shell tracing while loading credentials or print provider
responses. The helper logs only a fixed success/failure message, HTTP
status, and numeric error codes, and does not retry requests automatically.

A failed purge makes deployment exit nonzero **after** the existing health
and stability checks. The healthy release remains running; cache failure
does not trigger application rollback. A missing dedicated token is an
error, not a successful skipped purge.

Rerunning deployment at the same commit skips rebuilding but still checks
health/stability and performs the purge. A prior purge failure cannot be
mistaken for a successful no-op deployment.