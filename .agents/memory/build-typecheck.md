---
name: build vs typecheck reality
description: Why tsc is not a gate in this project and what CI must do about it
---

The production build (`tsx script/build.ts`) bundles with esbuild, which does **not** type-check. So the app can build and ship while the legacy typecheck reports a substantial pre-existing backlog. Do not rely on historical diagnostic counts; capture the current baseline for each change.

**Why:** tsc has effectively been decorative here; nobody runs it as a gate. A green app run / passing build says nothing about tsc cleanliness.

**How to apply:**
- Don't claim "tsc clean" after editing — run `npx tsc --noEmit` and **diff against the baseline** (filter to your files); never assume the whole repo is clean.
- The GitHub Actions CI typecheck step is intentionally `continue-on-error: true` (informational). Keep it non-blocking until someone clears the baseline, or CI goes permanently red. Tests + build are the real gates.

**CI test gotcha — import-only database placeholder:** Legacy Vitest setup sets a dummy `DATABASE_URL` when CI has none, so server modules can be imported without connecting. DB-backed acceptance tests must not mistake that placeholder for a real PostgreSQL service. A guard on `DATABASE_URL` alone is insufficient: use the CI/non-CI distinction (or an explicit available-service signal) before connecting. To reproduce GitHub's no-database runner, unset `DATABASE_URL` and set `CI=true`; without CI, the dummy placeholder can make SQL tests attempt a refused connection.
