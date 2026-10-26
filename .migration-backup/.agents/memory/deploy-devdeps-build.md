---
name: Droplet build fails "tsx: not found" after prod-only install
description: Why a droplet deploy can fail at build with missing dev tools, and the one-line fix.
---

# Deploy build fails with `tsx: not found` (exit 127)

The droplet build step is `tsx script/build.ts` and the bundler chain
(`tsx`, `esbuild`, `vite`) lives in **devDependencies**.

**The trap (two parts combine):**
1. A prod recovery / install that ran `npm ci` (or `npm install --production`)
   under `NODE_ENV=production` installs **prod-only** deps — no `tsx`.
2. `scripts/deploy.sh` only runs `npm ci` when `package.json`/`package-lock.json`
   changed in the pull **or** `node_modules` is absent. If the lockfile is
   unchanged and `node_modules` exists (prod-only), it logs
   "No package.json/package-lock.json changes — skipping npm ci" and goes
   straight to build → `sh: 1: tsx: not found` → exit 127 → emergency_recovery
   restores the old `dist` (site stays up on the OLD build, feature not live).

**The fix** — force deploy.sh to do a full reinstall by removing node_modules:
```
cd /opt/afro-ai && rm -rf node_modules && bash scripts/deploy.sh
```
deploy.sh then sees node_modules missing → runs
`npm ci --include=dev --registry=https://registry.npmjs.org/` (the `--include=dev`
overrides NODE_ENV=production so build tools land), chowns to `afro`, builds, restarts.

**Why:** `npm ci` honors `NODE_ENV=production` and drops devDeps unless
`--include=dev` is passed; deploy.sh's skip-when-unchanged logic means a
prod-only node_modules never gets upgraded on its own.

**How to apply:** if a droplet deploy logs "skipping npm ci" then fails the
build with `tsx`/`vite`/`esbuild` not found, wipe node_modules and redeploy.
Durable hardening (needs a pushed code change): have deploy.sh also reinstall
when a required build binary (e.g. `node_modules/.bin/tsx`) is missing, not just
when the lockfile changed.
