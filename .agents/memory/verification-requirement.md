---
name: Verification requirement
description: Product expectation for email confirmation and account activation.
---
Accounts must not gain application access before email confirmation, including already-signed-in but unverified accounts.

**Why:** The user reported eight verification messages from one signup and objected to the account being active before confirming the email.

**How to apply:** Keep session recognition distinct from permission to use protected features. Test concurrent first-page requests and explicit resend separately. Do not treat account age as evidence that a notification has not already been sent.

The user wants to keep and improve the current authentication without Clerk. Settings must let users inspect and revoke devices; a successful password reset must revoke the account's other sessions.

**Why:** The user explicitly chose improving their existing platform and login API rather than migrating to Clerk.

**How to apply:** Keep platform-account fixes distinct from the customer-facing tenant auth product; report tenant gaps rather than claiming platform protections automatically cover customer apps.

Customer-app password recovery requires a fresh explicit login after reset; it must not create an Afro AI platform cookie or silently activate an unverified customer account.

**Why:** The reset browser cannot safely be assumed to be the original integrating app. Platform login and customer-app credentials are distinct trust boundaries.

**How to apply:** Customer integrations handle their own post-reset navigation/login. When verified OAuth links an unverified account, discard any pre-existing password to prevent pre-registration account takeover.