---
name: Parallel visual fixtures
description: Prevent misleading white captures when a Vite fixture and the main application run together
---

Give a parallel visual-test Vite server its own dependency cache in its ignored
generated-output directory.

**Why:** Sharing the main application's optimization cache caused an
`Outdated Optimize Dep` 504 and a white desktop capture when the main workflow
restarted, even though the same component loaded on the subsequent phone capture.

**How to apply:** Keep fixture caches separate from the app cache. Also use
inline layout styles or already-generated utility classes for ignored fixture
wrappers: Tailwind's source scan does not necessarily include their files.
The actual production component must still be imported and tested unchanged.
