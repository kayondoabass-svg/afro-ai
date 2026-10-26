---
name: Crypto test environments
description: JWT integration tests and browser-global cleanup interactions.
---
Run real JOSE signing and verification integration tests in the Node test environment rather than jsdom.

**Why:** jsdom and Node TextEncoder/Uint8Array realms can differ, making valid byte buffers fail JOSE's instance checks. This looks like an application crypto defect but is a test-environment mismatch.

**How to apply:** Keep actual signing, verification, and Worker integration tests in Node. Ensure the shared test cleanup tolerates absent browser storage globals, or supply test-only storage stubs. Use browser component tests separately for UI.