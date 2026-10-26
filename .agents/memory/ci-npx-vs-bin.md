---
name: CI vitest/tsx "not found" — dev-deps skipped on GitHub runner
description: GitHub Actions Test step fails "vitest: not found" (exit 127) even though npm ci is green; real cause was dev-dependencies not installed on the runner. Fix = npm ci --include=dev (plus npx for the tool steps as a safety net).
---

# Symptom
GitHub Actions `verify` job: `Install dependencies` (`npm ci`) shows GREEN, then the
Test step (`vitest run`, whether via `npm run test` or `npx vitest run`) fails with
`sh: 1: vitest: not found`, exit 127. Same risk for the Build (`tsx script/build.ts`)
and Typecheck (`tsc`) steps — vitest, tsx, vite, esbuild, typescript are ALL devDependencies.

# Root cause (confirmed)
The runner's `npm ci` was NOT installing devDependencies, so the bins never existed in
`node_modules/.bin`. A green install step does not prove devDeps were installed. Switching
the invocation to `npx` alone did NOT fix it (npx can't run a package that isn't installed).

# Fix
Change the install step to force devDeps:
`npm ci` → `npm ci --include=dev`
and use npx for the tool steps as a belt-and-suspenders against bin-link quirks:
`npx vitest run`, `npx tsx script/build.ts`, `npx tsc`.
Both changes together cover the two possible causes (missing devDeps + unlinked bins).

**Editing constraint:** Replit's GitHub OAuth lacks the `workflow` scope, so pushing any
change to `.github/workflows/*` from Replit is rejected. The user must edit ci.yml on the
GitHub website directly. Do NOT edit the local copy (a local diff that can't be pushed will
block the user's normal Replit→GitHub pushes).

# What it is NOT (ruled out exhaustively)
- Lockfile corruption from `npm audit fix --force`. The committed lock was healthy and
  portable (all-platform optional deps present).
- A bare-bin-vs-npx problem on its own. npx did not fix it; the package wasn't installed.
- Reproducible locally: a clean `npm ci` (warm AND cold cache, Linux) reliably installs
  vitest and runs 79/79; `npx tsx script/build.ts` builds clean. The failure is runner-only.

# Trap discovered while debugging
Do NOT "regenerate" a lockfile with `npm install --package-lock-only` when `node_modules`
only has the current platform installed: it PRUNES other-platform optional deps
(non-linux `@esbuild/*`, `@rollup/rollup-*`, etc.), shrinking the lock (~911→785 pkgs here)
and making it non-portable. The all-platforms lock that `npm audit fix` produced is correct.

**How to apply:** for a CI "<bin>: not found" where local `npm ci` works, first suspect
devDeps being omitted on the runner (NODE_ENV=production repo var, omit=dev, etc.) — fix with
`npm ci --include=dev` — before churning the lockfile or only swapping in npx.

# Follow-up: after the 127 was fixed, exit 1 appeared (slow-runner test timeout)
Once the Test step actually RAN (error went 127 → exit 1/2), the remaining failure was
NOT environmental config — it was the heavy component test (`lock-screen-translations`,
60 page renders across 15 locales) tripping Testing-Library's default 1s `waitFor`/`findBy`
timeout and vitest's default 5s per-test timeout on GitHub's cold 2-core runner. Passes in
~8s locally, times out on the slow runner.
Fix (pure code, pushable normally — NOT a workflow file):
- `vitest.config.ts` test block: `testTimeout: 30000`, `hookTimeout: 30000`.
- `client/src/__tests__/setup.ts`: `import { configure } from "@testing-library/react"` then
  `configure({ asyncUtilTimeout: 10000 })` (raises waitFor/findBy from 1s).
Lesson: exit 127 = tool/dep not found (install/bin problem); exit 1 from a vitest step =
tests actually ran and one FAILED — treat as a real/flaky test, not an install issue.
