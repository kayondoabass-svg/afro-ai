---
name: Cloudflare purge permissions
description: Separate cache purge authorization from working production D1 credentials.
---

Use a dedicated single-zone cache-purge token; do not replace working D1 credentials to fix CDN authorization.

**Why:** The existing token could verify as active and read the production zone while cache purge still returned Cloudflare error 10000. Neither token validity nor D1 access proves purge permission.

**How to apply:** Confirm zone identity with authorized read access, grant only Zone Cache Purge on that zone to the dedicated token, and verify an actual purge succeeds. Do not change authentication or project-files database bindings.