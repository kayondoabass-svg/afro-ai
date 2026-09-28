---
name: Paid provider uncertainty
description: Retry and accounting policy when generation may have already been billed
---

Do not automatically resubmit paid audio or media work after a timeout, disconnect, or worker crash with an unknown provider outcome.

**Why:** Cancelling the local request does not prove that the provider stopped generation or billing. Automatic retries can duplicate charges. The pilot conservatively retains reservations for dispatched work and requires reconciliation rather than claiming a refund or successful cancellation.

**How to apply:** Preserve idempotency and explicit uncertain-outcome errors. Refund undispatched queued cancellations safely. Add provider-operation reconciliation before relaxing this policy; make customer-facing accounting behavior clear.