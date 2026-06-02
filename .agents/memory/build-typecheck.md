---
name: build vs typecheck reality
description: Why tsc is not a gate in this project and what CI must do about it
---

The production build (`npm run build` = `tsx script/build.ts`) bundles with esbuild, which does **not** type-check. So the app builds and ships even though `npm run check` (tsc) reports a backlog of ~60 pre-existing errors (e.g. `req.params.id` typed `string | string[]`, `Set`/`Map` iteration needing a newer target, missing `aws4` types, several `IStorage`-vs-impl mismatches).

**Why:** tsc has effectively been decorative here; nobody runs it as a gate. A green app run / passing build says nothing about tsc cleanliness.

**How to apply:**
- Don't claim "tsc clean" after editing — run `npx tsc --noEmit` and **diff against the baseline** (filter to your files); never assume the whole repo is clean.
- The GitHub Actions CI typecheck step is intentionally `continue-on-error: true` (informational). Keep it non-blocking until someone clears the baseline, or CI goes permanently red. Tests + build are the real gates.
