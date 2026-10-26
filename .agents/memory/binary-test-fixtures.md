---
name: Binary transfer fixture integrity
description: Use validated, licensed binary fixtures rather than package-internal assets
---

Use checked-in, licensed font fixtures with validated headers for binary transfer tests, not incidental files bundled inside dependencies.

**Why:** Sandpack's installed font assets contained UTF-8 replacement bytes and did not match their declared WOFF lengths. A round-trip can preserve corrupt source bytes perfectly and still fail to demonstrate valid font transfer.

**How to apply:** Check font signatures and declared byte lengths locally before using fixtures in a live transfer. Keep the license with the fixtures.