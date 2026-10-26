---
name: Customer-facing agent labels
description: Numbered agent names in Afro AI chat instead of provider branding
---

The user requested: “Instead of putting the word Gemini in front of the users.
Just use the agent 1 or agent 2 or agent 3.”

**Why:** The customer-visible fallback notice displayed Gemini and a raw model
identifier.

**How to apply:** Use numbered agent aliases in customer-facing chat routing
notices and operational labels. Keep the fallback explanation truthful and
retain actual provider/model identities privately for diagnostics and billing.
This is display naming, not permission to create additional autonomous agents.

Provider/model availability alerts should go to the founder and team members
the founder appoints, rather than exposing provider diagnostics to customers.

**Why:** The user says provider availability does not concern clients and
requests founder/team notifications instead of putting it in customers' faces.

**How to apply:** Keep customer-facing failures understandable and truthful.
Do not claim an operation succeeded when it did not, and do not silently retry
ambiguous paid operations. Keep technical routing details in authorized
operational notifications.
