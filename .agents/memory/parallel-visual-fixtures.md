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

When a Tailwind 4 artifact lives beneath a Tailwind 3 app, explicitly isolate its
PostCSS configuration as well as its dependency cache.

**Why:** Vite can discover the parent PostCSS config and load Tailwind 3 despite
the child installing Tailwind 4, breaking an otherwise valid isolated build.

**How to apply:** Confirm which PostCSS config is discovered before changing
Tailwind packages or rewriting the stylesheet.
