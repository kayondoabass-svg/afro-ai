---
name: CI test boundaries
description: Keep routing and deployment state-machine tests isolated without weakening production safeguards.
---

Routing tests that are not about token capacity should use an explicit bounded
metering fixture, alongside separate rejection tests using the real budget
guard. Keep real tokenizer/bound calculations covered separately.

**Why:** Expanding trusted product guidance changed the token estimate for an
image fixture, so a search-routing test stopped at budget validation instead of
testing its intended behavior. Raising production allowances to repair a routing
test would hide the actual security/cost boundary.

**How to apply:** Mock only the unrelated estimate in the focused test, restore
spies between tests, and retain explicit assertions that rejected requests never
call a paid provider.

Deployment state-machine tests must simulate external release/storage operations,
and fail explicitly on unexpected external commands rather than allowing real
network activity.

**Why:** Adding production release-mirror verification made an existing simulated
deployment exit before reaching its cache-purge retry assertions.

**How to apply:** Keep narrow command stubs in test harnesses, assert which steps
ran, and do not remove production deployment checks to make tests pass.
