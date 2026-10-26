---
name: SSH key line wrapping
description: Distinguish malformed line wrapping from invalid SSH credentials.
---

Distinguish local private-key parsing failures from authentication rejection by the remote server before requesting replacement credentials.

**Why:** A valid saved key was repeatedly misclassified as unusable because earlier attempts normalized literal newline escapes but did not restore missing line breaks.

**How to apply:** Validate formatting privately before concluding a saved key is invalid or unauthorized. Never expose key contents in logs or persist them in source or memory.