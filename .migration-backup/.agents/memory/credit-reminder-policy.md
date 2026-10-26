---
name: Free-tier preservation and credit reminders
description: Preserve daily free resets and use a USD-equivalent paid-wallet warning threshold.
---
Keep the existing free tier and its midnight reset. Do not change free allowances as part of paid-credit reminder work.

**Why:** The user said, “Maintain the free tier that resets at midnight.”

**How to apply:** Preserve the established reset schedule unless the user explicitly requests a timezone or allowance change.

Paid-wallet low-credit reminders use US$5-equivalent, regardless of payment currency—not five units of each local currency.

**Why:** The user requested a client reminder “especially if it is left with $5. Regardless of the currency.”

**How to apply:** Compare against the USD base wallet and present a genuine conversion where supported. Label approximate conversions and disclose USD fallback rather than relabeling dollars as local money.

When offering purchases after the free cap, preserve a one-time purchase option. For automatic renewal, the user chose low-balance auto-top-up, not scheduled monthly purchases.

**Why:** The user explicitly selected “Low-balance auto-top-up.”

**How to apply:** Require verified provider support and explicit customer authorization for balance-triggered repeat charges. Do not substitute a scheduled subscription or silently turn an automatic request into a one-time purchase.

Keep Pesapal for this project. Do not suggest Stripe or Whop again unless the user asks.

**Why:** The user said these providers are unsuitable for the project's Ugandan payment needs and asked us to stop pushing them.

**How to apply:** Preserve existing payment integrations. Leave unsupported automatic charging disabled rather than repeatedly proposing these alternatives.

Prioritize direct one-time credit purchases, including mobile money where Pesapal offers it and supported cards otherwise. Automatic renewal must not replace the direct purchase option.

**Why:** The user said we focused on auto-renewal and skipped the option of buying credits directly, and asked for mobile-money purchase reminders.

**How to apply:** Make the direct purchase action clear in cap and low-balance reminders. Let provider checkout determine available payment networks rather than equating its operating countries with mobile-money coverage.

Keep customer checkout within the Afro AI interface, with Afro AI calling Pesapal behind the scenes and supporting other founder-approved providers later. Build on the existing payment flow rather than replacing working parts.

**Why:** The user requested an interface where customers interact with afroaigroup, while afroaigroup calls Pesapal or future providers.

**How to apply:** Reuse existing payment records, verification, wallet accounting and receipts. Prefer provider-approved embedded checkout; explain any unavoidable bank/wallet authentication steps and never collect raw card details, CVVs or mobile-money PINs in Afro AI's own forms.

Future payment providers must use one settlement boundary for purchased access and final payment completion. Do not automatically send an uncertain payment to another provider.

**Why:** Payment notifications, browser returns and status checks can arrive concurrently; independent fulfillment paths can double-credit purchases or mark customers paid before their access is activated.

**How to apply:** Verify the saved order against the provider's server-side result, commit fulfillment and completion together, and send customer receipts only after that commit.
