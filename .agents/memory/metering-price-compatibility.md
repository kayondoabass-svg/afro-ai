---
name: Metering and existing customer prices
description: Budget protection is not permission to change the published customer tariff
---

Preserve the existing customer tariff when adding token budgets or credit reservations. Do not introduce separate charges for file reads, tool calls or each model round without explicit approval of a pricing change.

**Why:** The user requested protection against provider spending, not a new customer price structure. Supplier usage, customer credit reservations and final customer charges are different accounting concepts.

**How to apply:** Reserve the existing generation fee atomically, enforce bounded calls, disclose estimated provider usage separately, and reconcile uncertain outcomes instead of claiming provider refunds or silently charging twice.

Preserve charge-after-usable-result semantics: a completed supplier response that cannot be validated or saved must release the customer fee while retaining its supplier usage record. A customer's wallet refund is not a supplier refund.

**Why:** Moving the debit before dispatch for concurrency safety must not silently make customers pay for failed edits that the previous flow did not charge.

Validate budgets against the real application prompts for every plan, not just
mocked short messages. Bytes and model tokens are different units; keep
cross-provider estimates explicitly approximate and actual usage authoritative.
Fit a requested output ceiling to the remaining allowance before dispatch,
rather than rejecting a small greeting because its plan allows a large output.

**Why:** Byte-as-token budgeting rejected ordinary chat before contacting the
provider when combined with the large legacy builder instructions. Route tests
that mocked the budget check did not detect the regression.

**How to apply:** Exercise real prompt estimation and allowance logic in route
tests, include multilingual and image inputs, and bound tokenizer work on
repeated text so budget checks cannot block the server for long periods.
