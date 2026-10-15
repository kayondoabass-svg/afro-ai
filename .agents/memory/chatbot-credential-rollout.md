---
name: Chatbot credential rollout
description: Non-breaking transition from public widget IDs to private programmatic API keys
---

Browser embed IDs stay public. Server-to-server access uses separate private
credentials for new chatbots; existing integrations retain compatibility until
the owner explicitly enables private-only API access after deploying a key.

**Why:** The user approved separating private API credentials but explicitly
said not to delete other working things. Automatically disabling existing
public-ID integrations would interrupt customers.

**How to apply:** Keep origin restrictions and DNS ownership separate from
server authentication. Do not fall back to public-ID authentication after a
private token fails. Replacement credentials overlap until explicit revocation;
never put private secrets in browser embeds, URLs, logs or persistent client
storage. API entitlement and usage checks still apply independently.
