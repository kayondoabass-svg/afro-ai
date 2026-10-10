---
name: Production publishing target
description: Distinguishing the Afro AI VPS from the separately published Replit copy
---

Do not assume publishing the Replit copy updates afroaigroup.com.

**Why:** The Replit deployment metadata describes a separate replit.app deployment,
while afroaigroup.com is served through the existing Caddy/VPS setup.
A successful Git push makes source available to that VPS but does not itself
prove the VPS pulled, rebuilt and restarted.

**How to apply:** Verify the intended live domain and existing deployment runbook.
Keep the main Afro AI website repository separate from the public KEYO runner
repository. Report “source pushed” separately from “production deployed”, and
check the live domain after the VPS deployment before claiming it is updated.

Verify the homepage and its frontend assets as well as API health and
server-rendered product pages.

**Why:** A live audit observed product pages and downloads responding while
the homepage failed temporarily. Availability of one serving path did not
establish availability of the others.

**How to apply:** Treat successful API health alone as insufficient deployment
verification. Check the actual page and bundle needed by the user; confirm
recovery rather than assuming a transient error is harmless.
