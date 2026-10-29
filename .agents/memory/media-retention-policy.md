---
name: Generated media retention
description: The founder's 72-hour retention scope and its relationship to financial records
---

Ordinary generated images and videos are stored for 72 hours after generation completes.

**Why:** The founder explicitly requested “stored for 72hrs only after generation.”

**How to apply:** Expire access at the completion-based deadline and remove generated payloads from active storage. Keep financial records and minimal idempotency identities separate so expiry cannot cause a duplicate paid generation or erase accounting evidence. Do not describe 72-hour storage expiry as a limit on provider spending.

Images explicitly selected for permanent use on a customer's website are independent permanent project copies. The original generated-media job still expires normally.

**Why:** The founder requested permanent storage for images used on websites while retaining the existing treatment of the others.

**How to apply:** Do not extend the original media job's lifetime or automatically retain every generated image. Retain only an explicitly selected, owned copy for its exact project.
