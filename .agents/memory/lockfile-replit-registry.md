---
name: Replit lockfile registry URLs break npm ci off-Replit
description: Why package-lock.json generated inside Replit fails npm ci on droplets/CI, and the safe fix.
---

# package-firewall.replit.local in package-lock.json

`package-lock.json` generated inside Replit bakes the Replit-internal registry
host into each package's `resolved` field, e.g.
`http://package-firewall.replit.local/npm/<pkg>/-/<file>.tgz`.

That host resolves **only inside Replit**. Anywhere else (DigitalOcean droplet,
GitHub Actions) those fetches fail with `EAI_AGAIN`.

**The trap:** `npm ci` obeys the lockfile's `resolved` URLs *verbatim*. Passing
`--registry=https://registry.npmjs.org/` or `npm config set registry ...` does
**NOT** override `resolved` for `npm ci`. So npm keeps hitting the unreachable
firewall host, the install crashes (often `npm error Exit handler never called!`),
and leaves a **partial `node_modules`** — a *different* transitive module missing
each run (e.g. `@smithy/types`). The app then crash-loops with `MODULE_NOT_FOUND`.
A warm npm cache can mask this (installs half-succeed) until the cache is cleared.

**The fix** — rewrite the resolved host in the lockfile, then `npm ci`:
```
sed -i 's|http://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json
```
Safe because only the `resolved` host changes — `integrity` hashes and versions
are untouched (identical tarball content on both mirrors), so `npm ci` stays in
sync with package.json.

**Why this matters:** caused a multi-hour production outage on the droplet; the
`--registry` flag looked like it should fix it but silently didn't for `npm ci`.

**How to apply:** if a deploy or CI fails with `EAI_AGAIN` to
`package-firewall.replit.local`, an `Exit handler never called!` npm crash, or a
missing transitive module after install — grep `package-lock.json` for
`package-firewall.replit.local` first.

**Guards now in place:** `scripts/deploy.sh` aborts before `npm ci` if the
lockfile contains the firewall host, and `.github/workflows/ci.yml` fails fast on
the same check — so a future `npm install` inside Replit that re-introduces the
URLs can't silently reach prod.
