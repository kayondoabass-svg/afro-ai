---
name: attached_assets are gitignored — image imports break CI / fresh builds
description: Why @assets image imports can pass locally but fail on GitHub CI and any fresh checkout
---

`@assets` aliases to `attached_assets/` (see vite.config.ts + vitest.config.ts). That whole folder is gitignored; only a hand-picked allowlist of images is meant to be tracked via `!` negations in `.gitignore`.

**The trap:** an image file can exist on the Replit box (and on the droplet, as a leftover from a past deploy) yet **not be tracked in git**. It then works locally and in production, but is missing from any *fresh* checkout — so GitHub Actions fails: the test file that imports it fails to *load* (0 tests run for that file, not 60 failures), and the build step fails to resolve the import. Production survives only because the droplet's working tree still has the old copy; a clean clone would break.

**Two-part fix when adding any new `@assets/<image>` import:**
1. `.gitignore` must use `attached_assets/*` (NOT `attached_assets/`). Git cannot re-include a file whose **parent directory** is excluded, so the trailing-slash directory form silently neuters every `!attached_assets/foo.png` negation below it. The `/*` form excludes contents while still letting git descend and honor negations.
2. Add a matching `!attached_assets/<image>` negation line, then commit the actual binary. Verify with `git ls-files attached_assets/` (must list it) — `git check-ignore -v` is misleading here (it prints the negation line and still exits 0).

**Why:** the main logo `IMG_5719_1771852498362.png` is imported by ~20 pages and landing.tsx pulls hero-bg.jpg/workspace.jpg/africa-tech.jpg; all were untracked, which is what turned CI red after the DATABASE_URL test fix.
