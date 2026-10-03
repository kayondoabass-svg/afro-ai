---
name: Generated website boundary
description: Keep assistant narration out of client websites, including previously stored polluted responses.
---

Treat assistant responses and publishable website HTML as different outputs. Enforce extraction at preview, storage, publishing, and serving boundaries rather than relying on prompt compliance.

**Why:** Users repeatedly saw build-plan blocks, French/English explanations, and Markdown fences above their client sites. A chat-only presentation fix did not prevent the entire response from becoming a website.

**How to apply:** Preserve scripts, styles, and legitimate content inside the document. Repair recognizable legacy contamination when reading or serving it; do not bulk rewrite customer records without approval. Test the actual routed Agent screen as well as legacy builder surfaces.

Build replies must contain real output, not background promises or placeholder links. Recommend Publish then preview the actual live URL after successful saving; retain optional local Preview. Do not require repeated "build now" commands once the brief is approved.

**Why:** The user showed a repeated confirmation loop with "[Link to your website]" while Publish reported nothing built, and explicitly requested automatic building and a publish recommendation.

**How to apply:** Honor the current turn's Plan setting (not historical markers), preserve customer identity and project-agent review requirements, and validate generated output before treating a build as successful.

Code must be hidden by default behind compact Preview (eye), Code (`</>`), and Copy icons, connected to existing preview/publish/version functionality.

**Why:** The user supplied this exact action-bar reference and repeated that the icons were missing. They explicitly requested Publish before live preview, without deleting existing functionality.

**How to apply:** Reuse existing controls and callbacks rather than adding disconnected replacements; distinguish local preview from opening a confirmed published URL.