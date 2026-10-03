---
name: Platform admin identity
description: Why Afro Auth management must use the dashboard's authoritative account check
---
Use the main server's authenticated, verified platform account as the authority for Afro Auth management, not an additional requirement for a Worker-issued login.

**Why:** The platform supports Passport sessions as well as Worker sessions. Requiring both lets a valid dashboard user reach an admin screen but prevents them from creating projects. Express can also reuse an older account ID when mirroring a Worker identity; changing ownership IDs without accounting for this hides existing projects.

**How to apply:** Preserve existing tenant ownership when reconciling verified platform identities. Never use customer-app tokens or the D1 verification mirror as proof of platform access. Keep session expiry, email verification, and upstream availability failures distinct and fail closed on ambiguity.

Cloudflare's workerd runtime rejects `fetch(..., { redirect: "error" })` before sending the request. Use `manual` and reject non-success statuses without following redirects.

**Why:** Node-based mocked tests and a successful Worker build missed this incompatibility; live account checks returned 503 even for deliberately invalid sessions that should return 401.

**How to apply:** Validate Worker fetch behavior in workerd/Miniflare, not just Node. Do not switch to automatic redirects when forwarding session cookies.

Validate Worker installation from its own manifest and lockfile in a clean directory before giving VPS update instructions.

**Why:** A successful build using existing dependencies hid an incomplete Worker lockfile, causing the user's `npm ci` to stop during publishing.

**How to apply:** Check a clean install with development dependencies included (Wrangler is a build/deployment tool), not only a build from the existing workspace.