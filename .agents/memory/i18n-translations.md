---
name: i18n translation waves
description: How the t()/translations.ts i18n system works and the gotchas when adding keys
---

# Afro AI i18n system

The app i18n lives in `client/src/lib/translations.ts` (one object per language: en sw ar zu hi es fr lg yo ha tw pt zh gu ta — 15 total) and `client/src/hooks/use-language.tsx` exposes `t(key, params?)`.

- `t()` interpolates any `{name}` placeholder via `params`, and supports plural via `params.count` → it auto-resolves `key+"_one"` / `key+"_other"`. Missing key falls back to `translations.en[key]`, then to the raw key string.
- Full translation is being rolled out in **waves, one screen at a time** (the user chose "everything, ~112 screens"). As of the /chat wave, only a minority of pages call `t()`; the rest are still hardcoded English. Next waves: dashboard, overview, landing, then the rest.

**Why / How to apply — adding keys:**
- Before adding a new `chat.*` (or any) key, grep the target language block for the key name. Duplicate object properties cause `TS1117` (multiple properties with same name) and the build fails. This bit twice (`chat.suggestion1/2/3`, `chat.newChat`/`chat.noConversations` already existed for the classic ai-chat page) — resolve by renaming the new one (e.g. `agentNewChat`).
- Sub-components defined outside the page component (e.g. `ProgressSteps`, `MessageBlock`, `ActionChipsRow` in `agent.tsx`) each need their own `const { t } = useLanguage();`. Module-level plain functions (e.g. `timeAgo`) can't use the hook — pass `t` in as a parameter.
- Conversation/session **display titles** that get stored in the DB (e.g. "New chat", "{name} session", "Agent Session") ARE localized at creation time via `t()` — they are user-visible labels, not semantic data. This freezes the title in the creator's current language, which is acceptable. Truly semantic backend payloads stay untranslated.
- Use a node/python script to inject the same key set into all 15 blocks at once (insert after each `  <lang>: {` line). If the script aborts on a "miss", it may skip the file write — verify the file actually changed afterward.
