---
name: Paid provider uncertainty
description: Retry and accounting policy when generation may have already been billed
---

Do not automatically resubmit paid AI, visual-review, audio or media work after a timeout, disconnect, or worker crash with an unknown provider outcome.

**Why:** Cancelling the local request does not prove that the provider stopped generation or billing. Automatic retries can duplicate charges. The pilot conservatively retains reservations for dispatched work and requires reconciliation rather than claiming a refund or successful cancellation.

**How to apply:** Preserve idempotency and explicit uncertain-outcome errors. Refund undispatched queued cancellations safely. Add provider-operation reconciliation before relaxing this policy; make customer-facing accounting behavior clear.

Apply the same rule to outbound email: provider acceptance can occur before the
connection or local logging fails. Keep uncertain-send reservations and replay
the same request ID without resubmitting. Release allowance only after a
definitive provider rejection.

**Why:** Reporting accepted mail as failed invites duplicate sends and charges
when a customer retries; a local database failure is not evidence of rejection.