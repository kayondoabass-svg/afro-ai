---
name: i18n translations
description: Durable conventions for the t()/translations.ts i18n system — how to add keys safely.
---

# i18n conventions

- Translations live in `client/src/lib/translations.ts`; `t()` comes from `useLanguage()`.
- Supports `{name}`-style interpolation for any variable name. **Avoid naming an interpolation var `count`** unless you intend plural behavior — `count` triggers `_one`/`_other` key-suffix lookup. (Knowledge page uses `{chunks}`/`{chars}` for this reason.)
- **Grep for an existing key before adding it.** Duplicate object keys raise TS1117 at build time.
- Missing keys fall back to the English (`en`) block, so shipping en-only for a new feature is acceptable; other languages degrade gracefully. **But this silently leaves non-English users seeing English** — a recurring complaint ("UI still in English everywhere"). When you add keys, add them to ALL 15 language blocks, not just `en`.
- **The 15 blocks drift apart over time.** Audit by counting keys per block (parse `  code: {` headers, collect `"key":` lines). If `en` has more keys than the others, those extras fall back to English. All blocks must have identical key sets.
- **Bulk-filling missing translations:** machine-translate via the Replit-managed OpenAI integration (`AI_INTEGRATIONS_OPENAI_API_KEY` + `_BASE_URL`, model `gpt-4.1-mini`) so it doesn't touch the user's own AI billing. Run languages in PARALLEL with per-language file caching (sequential calls time out past ~6 langs). Instruct the model to preserve `{placeholders}` exactly and keep brand/technical terms untranslated (Afro AI, API, Google, GitHub, USSD, SEO, PWA, etc.); validate placeholders post-hoc and revert to EN if they broke.
- Insert new keys programmatically after each block's `"footer.product":` line (a stable anchor present in every block), skipping keys already present, to avoid TS1117 duplicate-key errors.
- **Hardcoded JSX/toast strings** (not going through `t()`) are the other half of the problem — `login.tsx` had its whole form + toasts hardcoded despite importing `useLanguage`. Grep pages for literal capitalized strings in JSX/`toast({title/description})` and wrap them.
- **Parity is necessary but NOT sufficient — also scan for value-equals-English.** Machine translation sometimes returns the English string verbatim (or your placeholder-drift guard reverts a key to EN), so a key can exist in every block yet still render English. After bulk-translating, scan each non-`en` block for `value === en[value]` on the newly added non-brand keys and hand-patch the stragglers.
- **Plural keys need BOTH `_one` and `_other` in every block.** When wrapping a `live site${n>1?"s":""}` ternary, emit `key_one`/`key_other` and call `t(key,{count,...})`. The placeholder-drift guard tends to revert plural strings (they carry two placeholders like `{count}`+`{list}`), so re-check plurals specifically after a bulk run.
