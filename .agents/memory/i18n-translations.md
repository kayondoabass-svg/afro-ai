---
name: i18n translations
description: Durable conventions for the t()/translations.ts i18n system — how to add keys safely.
---

# i18n conventions

- Translations live in `client/src/lib/translations.ts`; `t()` comes from `useLanguage()`.
- Supports `{name}`-style interpolation for any variable name. **Avoid naming an interpolation var `count`** unless you intend plural behavior — `count` triggers `_one`/`_other` key-suffix lookup. (Knowledge page uses `{chunks}`/`{chars}` for this reason.)
- **Grep for an existing key before adding it.** Duplicate object keys raise TS1117 at build time.
- Missing keys fall back to the English (`en`) block, so shipping en-only for a new feature is acceptable; other languages degrade gracefully.
