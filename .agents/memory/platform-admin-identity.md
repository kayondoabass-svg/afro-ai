---
name: Platform admin identity
description: Why Afro Auth management must use the dashboard's authoritative account check
---
Use the main server's authenticated, verified platform account as the authority for Afro Auth management, not an additional requirement for a Worker-issued login.

**Why:** The platform supports Passport sessions as well as Worker sessions. Requiring both lets a valid dashboard user reach an admin screen but prevents them from creating projects. Express can also reuse an older account ID when mirroring a Worker identity; changing ownership IDs without accounting for this hides existing projects.

**How to apply:** Preserve existing tenant ownership when reconciling verified platform identities. Never use customer-app tokens or the D1 verification mirror as proof of platform access. Keep session expiry, email verification, and upstream availability failures distinct and fail closed on ambiguity.