---
name: CI vitest/tsx "not found" despite correct lockfile
description: GitHub Actions npm-run-script fails to find a dep bin even when npm ci exits 0 and the lockfile is healthy; use npx in CI. Also: don't "regenerate" an all-platform lock against a single-platform node_modules.
---

# Symptom
GitHub Actions CI step `npm run test` (script = `vitest run`) fails with
`sh: 1: vitest: not found` (exit 127), while the *previous* `Install dependencies`
(`npm ci`) step is GREEN. Same pattern can hit `npm run build` (tsx) or `npm run check` (tsc).

# What it is NOT (ruled out exhaustively)
- Lockfile corruption from `npm audit fix --force`. The committed lock was healthy.
- dev-deps omitted. vitest was `dev=true` in both the broken and the prior-green lock,
  and prior-green runs installed+ran it, so CI does NOT `--omit=dev`.
- Cold npm cache / optional-deps pruning (npm#4828). A clean `npm ci` of the exact
  committed lock — warm AND cold cache, on Linux, with python+make+gcc on PATH —
  reliably creates `node_modules/.bin/vitest`, exit 0.

# Root cause / fix
The failure is an environment-specific `node_modules/.bin` symlink-linking issue on the
GitHub runner. `npm run <script>` relies on the bare bin symlink in `node_modules/.bin`;
`npx <tool>` resolves the package's `bin` entry from `node_modules/<pkg>` directly and does
not depend on that symlink.
**Fix (edit on GitHub web — Replit OAuth lacks the `workflow` scope so pushing .github/workflows/* is rejected):**
change CI steps to the npx form, matching the locally-green `test` workflow:
`npx vitest run`, `npx tsx script/build.ts`, `npx tsc`.

# Trap discovered while debugging
Do NOT "regenerate" a lockfile with `npm install --package-lock-only` when `node_modules`
only has the current platform installed: it PRUNES the other-platform optional deps
(all the non-linux `@esbuild/*`, `@rollup/rollup-*`, etc.), shrinking the lock (~911→785 pkgs
here) and making it non-portable. The all-platforms lock that `npm audit fix` produced was
the CORRECT, portable one.

**Why:** confirmed by reproduction — `npm ci` of the committed lock created the bin every
time locally, so the bug lives in the runner's reify/bin-link, not the repo. npx sidesteps it.

**How to apply:** when a CI "<bin>: not found" appears but local `npm ci` creates the bin,
switch the CI invocation from `npm run X` to `npx <bin>` rather than churning the lockfile.
