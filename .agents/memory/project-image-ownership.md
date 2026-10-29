---
name: Project image ownership
description: The founder's sole-owner and exact-project restriction for private projects and assets
---

The founder requires: “each assets belong to only a particular project” and “a project/s only accessible to their sole owner.”

**Why:** The user explicitly required project isolation and sole-owner access.

**How to apply:** Every private image operation must check both the signed-in owner and exact project. Reusing identical bytes in another project requires a separate project-owned copy, not a shared private asset identity. Do not add founder cross-owner access or shared client caches. Publishing selected website images must not publish the private project or its original storage.
