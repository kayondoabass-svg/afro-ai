---
name: Production publishing target
description: Distinguishing the Afro AI VPS from the separately published Replit copy
---

Do not assume publishing the Replit copy updates afroaigroup.com.

**Why:** The Replit deployment metadata describes a separate replit.app deployment,
while afroaigroup.com is served through the existing Caddy/VPS setup.
A successful Git push or green CI run makes source available to that VPS but
does not itself prove the VPS pulled, rebuilt and restarted.

**How to apply:** Verify the intended live domain and existing deployment runbook.
Keep the main Afro AI website repository separate from the public KEYO runner
repository. Report “source pushed” separately from “production deployed”, and
check the live domain after the VPS deployment before claiming it is updated.
Check the actual CI jobs, not just the overall success status: a passing run may
contain verification only, with no deployment job.

Verify the homepage and its frontend assets as well as API health and
server-rendered product pages.

**Why:** A live audit observed product pages and downloads responding while
the homepage failed temporarily. Availability of one serving path did not
establish availability of the others.

**How to apply:** Treat successful API health alone as insufficient deployment
verification. Check the actual page and bundle needed by the user; confirm
recovery rather than assuming a transient error is harmless.

Check the response type and authentication behavior of new feature endpoints,
not just whether they return HTTP 200.

**Why:** A missing live feature endpoint can return the SPA HTML fallback with
status 200. This is not evidence that the feature's backend was deployed.

**How to apply:** Compare the live frontend's feature references and the
endpoint's expected JSON/authentication response against the verified build
before recommending browser-cache clearing or rewriting working UI code.

Resolve the current origin through authoritative Cloudflare DNS metadata before
attempting authorized VPS SSH access; do not use a public proxied DNS address as
if it were the server.

**Why:** Public resolution of a proxied website returns Cloudflare edge addresses,
not the VPS. Missing an SSH hostname in the repository does not mean the existing
deployment credentials are unusable.

**How to apply:** Read the relevant zone's actual origin records without changing
DNS, confirm the remote checkout and service with read-only checks, then use the
existing deployment script. Never store the key or a fixed origin address in
source or memory.
