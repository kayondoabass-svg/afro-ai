---
name: Metering and existing customer prices
description: Budget protection is not permission to change the published customer tariff
---

Preserve the existing customer tariff when adding token budgets or credit reservations. Do not introduce separate charges for file reads, tool calls or each model round without explicit approval of a pricing change.

**Why:** The user requested protection against provider spending, not a new customer price structure. Supplier usage, customer credit reservations and final customer charges are different accounting concepts.

**How to apply:** Reserve the existing generation fee atomically, enforce bounded calls, disclose estimated provider usage separately, and reconcile uncertain outcomes instead of claiming provider refunds or silently charging twice.
