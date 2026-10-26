---
name: Full-stack starter scope
description: User-approved restrictions on automatic starter creation and paid access
---

Automatically create starter files for full-stack projects only, not every new project. Full-stack access must be restricted to paying users.

The user selected Cloudflare Workers + D1 for generated full-stack projects, not Express + PostgreSQL. This does not replace Afro AI's own PostgreSQL database or its dedicated D1 source-file store.

**Why:** The user selected “Full-stack projects only” and explicitly added “make sure only those who pay can use it.”

**How to apply:** Enforce eligibility on the server, not just the project-type selector. Preserve existing projects. Finish automatic file creation and owner-scoped storage before expanding into app runtimes or database provisioning.

Use actual completed, positive platform payments together with current eligible plan status; funded PAYG counts. Do not grant access from a trial flag, client-supplied plan, unrelated-product payment, or founder status alone.

**Why:** The user explicitly restricted this feature to people who pay. Existing plan labels can also be assigned manually and are not proof of payment.

**How to apply:** Keep UI eligibility advisory and repeat authorization server-side. Source creation does not provision a Worker or per-project business-data database.