---
name: Cloudflare purge permissions
description: Separate cache purge authorization from working production D1 credentials.
---

Use a dedicated single-zone cache-purge token; do not replace working D1 credentials to fix CDN authorization.

**Why:** The existing token could verify as active and read the production zone while cache purge still returned Cloudflare error 10000. Neither token validity nor D1 access proves purge permission.

**How to apply:** Confirm zone identity with authorized read access, grant only Zone Cache Purge on that zone to the dedicated token, and verify an actual purge succeeds. Do not change authentication or project-files database bindings.

Validate DNS authorization separately from token validity and cache-purge access.

**Why:** Production credentials verified as active but an exact-host DNS lookup returned HTTP 403 / Cloudflare code 10000. The available MCP connection also lacked zone access; reconnecting with only user/account read scopes would not establish DNS permissions.

**How to apply:** Check the specific zone and operation before retrying pending cleanup. DNS reads, DNS changes and cache purges need their respective grants. Preserve working D1 credentials, and do not treat an authorization failure as missing customer files or permission to delete saved work.

Do not reject a DNS credential solely because `/user/tokens/verify` rejects it; verify the actual required zone and DNS operations.

**Why:** A replacement credential returned HTTP 401 from user-token verification while successfully reading the exact production zone and its DNS records. A generic token-verification endpoint is not authoritative for every credential type.

**How to apply:** Test exact-zone reads independently before asking the owner to rotate a credential. Report read access separately from untested DNS writes and cache purges.