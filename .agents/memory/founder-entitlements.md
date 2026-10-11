---
name: Founder entitlements
description: Full founder access is separate from customer quotas and provider capacity.
---
The user explicitly requires full access as founder. Do not require the founder to buy an Afro AI customer subscription to use platform features.

**Why:** The user said, “As founder I need full access,” after customer pricing and provider quota messages were conflated.

**How to apply:** Resolve founder status from the server-controlled identity and trusted account owner, including when a request authenticates with a customer-project/API key. Exempt customer subscription quotas without widening tenant ownership, bypassing verification, reactivating revoked keys, or removing anti-abuse controls. External provider capacity and charges remain separate operator responsibilities; never suggest a customer subscription can remove them.

Public email API keys must remain limited even when owned by the founder. The founder email-send exemption requires a validated server-side secret key.

**Why:** Customer-access exemptions must not turn a publicly embedded key into unlimited founder-funded sending authority.

**How to apply:** Preserve public-key limits and keep secrets server-side; use the stored key owner's identity only after the required authentication level is proven.
