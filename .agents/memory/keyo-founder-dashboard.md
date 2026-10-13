---
name: KEYO founder dashboard scope
description: Requested private runner dashboard, invited-email access and viewer counters
---

The user requested a dashboard named “KEYO Studio runner studio” under Command
Center, after the runner work. It is accessible only to the founder and users
whose emails the founder explicitly authorizes.

**Why:** The user wants private founder oversight, with a way to grant another
user access and see a live count of people who can view it.

**How to apply:** Enforce access on server routes, not just sidebar visibility.
Keep invite management founder-only; default invited users to viewing rather
than release/access administration. Distinguish authorized users from currently
viewing users so the counter does not imply offline desktop users are tracked.
Keep this management dashboard in the platform, not the public runner export.

Completion must include discoverable public product links and the actual private
management UI, not just a public product page or sitemap entry.

**Why:** The user reported missing founder navigation and footer links after
the public page and sitemap were available. Those checks alone did not
establish that the requested platform integration was finished.

**How to apply:** Check each requested entry point and permission path
separately. Distinguish code pushed to GitHub from the VPS actually running it.

The user also requires visible download numbers separated by Afro AI, GitHub
and Hugging Face. Never substitute studio presence, page views or link clicks
for completed downloads, and do not invent historical counts.

**Why:** The founder could see authorized/active viewers but no download
numbers. GitHub exposes release-asset counters, while the public Hugging Face
Space response did not expose a download count.

**How to apply:** Keep source-specific definitions and timestamps visible.
Distinguish missing upstream statistics from a genuine zero; label tracked
outbound clicks separately. Account for older releases, not just the newest
release. Do not describe download counts as unique customers or installations.

Download accounting requires a full public production transfer and a persisted
counter increase as verification, not only mocked response flags or HEAD checks.

**Why:** Healthy deployment and passing mock tests still missed actual transfers;
the public download succeeded while its counter remained unchanged.

**How to apply:** Verify the real serving path through the proxy and compare
stored totals before/after a small complete archive transfer. Label verification
traffic honestly; it is not a customer installation.
