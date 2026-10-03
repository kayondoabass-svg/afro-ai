---
name: Verification requirement
description: Product expectation for email confirmation and account activation.
---
Accounts must not gain application access before email confirmation, including already-signed-in but unverified accounts.

**Why:** The user reported eight verification messages from one signup and objected to the account being active before confirming the email.

**How to apply:** Keep session recognition distinct from permission to use protected features. Test concurrent first-page requests and explicit resend separately. Do not treat account age as evidence that a notification has not already been sent.