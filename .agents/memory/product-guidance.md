---
name: Product setup guidance
description: Afro AI must explain setup and use of KEYO and its other products when asked.
---

Afro AI should give setup and usage guidelines for KEYO Studio and all software
developed by the company when someone asks, not only describe capabilities.
For Afro Auth, this must cover end-to-end setup on apps built both inside Afro AI
and outside it, including new Auth capabilities as they become available.

**Why:** The user explicitly requested this so customers can ask the assistant
how to get started and use the products, including integrating Auth regardless of
where their app was built.
The user also requires the assistant to explain proper website/app generation
and image flow, setup, and where customers can download their own copies.

**How to apply:** Keep guidance grounded in implemented controls and current
documentation. Distinguish instructions from actions actually performed, and
verified release evidence from hardware certification or planned features.
For downloads, verify the current controls and distinguish optimized image
copies, source/local-runner bundles, chat transcripts and software installers.

Afro AI must not expose secrets and must explain how to upload secrets directly
to a VPS without exposure.

**Why:** The user explicitly requested these rules in Afro AI's memory.

**How to apply:** Keep this in the product's shared assistant guidance, not only
agent memory. Teach secure backend-only transfers from an approved secret store,
verified SSH host identity, values on encrypted standard input, protected atomic
configuration updates and safe verification. Do not add secret values to memory,
claim new execution capabilities, or treat guidance as production authorization.

Each website or app needs its own specific secret file.

**Why:** The user requested a review of the existing environment setup and
project-specific secret files.

**How to apply:** Keep project secret configuration separate from other projects
and platform credentials. Review existing storage and compatibility before
implementing; this requirement does not authorize arbitrary customer code to run
on the shared platform VPS.

Review the user's supplied research when planning Afro AI changes; do not ignore it.

**Why:** The user explicitly insisted that their research be reviewed.

**How to apply:** Explain what the supplied research contributes and what needs
adapting to the existing implementation before proposing changes.

## Customer API setup and isolation

When a user reaches the step where an API is needed, Afro AI must give proper
implementation guidance, explain how to save it, verify and connect the site to
its user, avoid using users' APIs itself, anticipate mismatches, and keep these
instructions well organized in its memory.

**Why:** The user explicitly requested this behavior for Afro AI.

**How to apply:** Keep ordered onboarding and mismatch checks in shared in-app
instructions, not just agent notes. Customer keys serve only the customer's own
backend, never Afro AI providers or internal services. Credential-dependent
checks belong on that backend; ownership/connection claims need real authorized
evidence. Explain current capability limits rather than claiming the planned
encrypted vault or site-connection tool already exists.
