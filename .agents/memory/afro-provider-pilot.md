---
name: Afro AI provider pilot
description: Why the trained model must remain opt-in until broader evaluation
---

Treat the trained Afro AI model as a restricted pilot, not an automatic replacement for all text and media providers.

**Why:** Training was a three-example LoRA smoke test and the earlier endpoint check proved serving, not production quality or structured tool-call compatibility. The user approved stages one and two of an incremental integration, not a global provider migration.

**How to apply:** Verify current configuration and permissions in code. Evaluate real model tool calls, language quality, and failure behavior before broad rollout. Text-model integration does not replace image, speech, or video generation services.

Public model announcements should say Afro AI fine-tuned its own language model, without publishing parameter counts, model size, private repository names, or serving identifiers.

**Why:** The user explicitly requested keeping model size and parameters confidential while announcing the milestone. Fine-tuning is supported by the training history; training from scratch and universal production use are not.

**How to apply:** Preserve this distinction in About Us, marketing copy, and assistant self-descriptions. Do not treat a paused training Space, an available model repository, and a live inference endpoint as equivalent states.