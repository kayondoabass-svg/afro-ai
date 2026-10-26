---
name: Customer chatbot scope
description: Chatbot fixes must apply to all customers, not one demonstration website.
---

Chatbot fixes must serve all customers well, not refer to BrightBoard only.

**Why:** The user explicitly said, "REMEMBER. THIS SHOULDN'T REFER TO Brightboard only. we need to fix the chatbot to serve customer well."

**How to apply:** Use tenant-scoped, site-independent fixes and regression tests. Do not hard-code one customer's website, answers, credentials, or identity into platform behavior.

The Save option for chatbot knowledge and website scans needs a folder backed by R2 or D1, a chance to edit, and access only by the owning user. This folder is for knowledge/scans, not generated documents.

**Why:** The user explicitly requested this saved-folder behavior and asked that it be remembered.

**How to apply:** Keep the folder and its editor private. Check the authenticated owner's access on every listing, read, write, delete and download; a public object URL or UI-only restriction is insufficient.

Add website ownership verification to Chatbots, following the working Afro Auth
onboarding pattern, without disturbing the other working chatbot features or
changing Afro Auth.

**Why:** The user says Afro Auth's ownership setup works well and requests the
missing domain verification in Chatbots.

**How to apply:** Keep ownership proof, installation detection and successful
visitor replies distinct. Domain ownership must be verified server-side rather
than inferred from a website URL, an enabled toggle or copied embed code.
