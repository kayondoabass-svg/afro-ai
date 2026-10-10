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
