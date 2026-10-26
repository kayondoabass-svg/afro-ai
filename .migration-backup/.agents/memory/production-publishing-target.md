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

Report a running release from identity embedded in the built executable, not
from the checkout or a mutable deployment marker.

**Why:** A deployment marker can remain stale after a direct build/restart, or
change independently of the process that is currently serving requests.

**How to apply:** Embed the source revision at build time. If a build has no
verified revision, show it as unavailable rather than substituting the current
Git checkout or the last deployment marker.

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

VPS application output may be appended directly to files rather than collected
in the systemd journal.

**Why:** The journal contained no startup errors, and systemctl reported only
the output mode, while the application error file held the deployment failure.

**How to apply:** When the journal is empty, inspect the running process's
standard-output/error file targets and read bounded, redacted log excerpts.
Do not interpret an empty journal as evidence that startup succeeded.

Treat a deploy-time health timeout separately from an application crash, and allow a bounded startup grace period before rollback.

**Why:** On the small production VPS, a healthy new process became ready just after the old five-probe window ended. The deployment script stopped it for rollback despite no crash or systemd restart.

**How to apply:** Correlate readiness timestamps with probe attempts and process exits. Keep the startup deadline, short bounded HTTP probes, automatic recovery and post-start stability checks; do not bypass health checks to make a release pass.
