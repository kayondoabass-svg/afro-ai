# Afro AI feature inventory — weekly item 2

Scope: read-only source audit. No provider requests, paid generation, production changes, or load tests were performed. “Implemented” means code was found, not that current deployment behavior was verified. This is not a security certification.

| Capability | Status | Evidence and gaps |
|---|---|---|
| Text providers | Implemented; runtime unverified | `server/ai-chat-provider.ts`: Gemini with OpenAI fallback. Reuse this abstraction. |
| Streaming chat | Implemented; runtime unverified | Provider streaming, `server/replit_integrations/chat/routes.ts`, and `client/src/pages/ai-chat.tsx` SSE handling are present. |
| Afro AI SLM provider | Not integrated | No HF/vLLM provider implementation found. Prior standalone endpoint test does not constitute app integration. |
| Knowledge retrieval | Implemented with UI limitations | `server/knowledge.ts`, `server/embeddings.ts`, `client/src/pages/knowledge.tsx`: text/URL ingestion, user-scoped vector retrieval, citations. Knowledge UI lacks a file-upload ingestion path. |
| Tool calling | Partial | `server/ai-tools.ts`: bounded knowledge-search tool loop. No general tool suite. |
| Web access | Partial | URL retrieval in `server/url-scrape.ts` and knowledge ingestion, with SSRF controls; no model-callable web-search/browser tool found. |
| Calculator tool | Not found | Add a restricted calculator; do not confuse app-generated calculators with a model-callable tool. |
| Code execution | Partial, different use case | `client/src/pages/playground.tsx` has browser Pyodide/Sandpack. No isolated server-side model execution tool found. |
| Image generation | Backend present; incomplete end-to-end | `server/replit_integrations/image/routes.ts`, `server/imagen.ts`: Imagen/OpenAI path returns base64. Generation UI wiring and persistent generated assets were not found. |
| Voice/STT/TTS | Substantial implementation; runtime unverified | `server/replit_integrations/audio/routes.ts` and client audio integration: transcription and streamed voice conversation. Dedicated transcription/TTS workflows, downloads, cancellation, and output retention need review/completion. |
| Music/sound generation | Not found | No dedicated generation provider/route found. |
| Video generation | Backend present; incomplete end-to-end | `server/veo.ts` polls a long operation inside the request. No durable media jobs, status API, retry deduplication, or generation UI wiring found. |
| Storage | Partial | `server/r2.ts` and file routes reuse R2/local uploads and user records. Generated output persistence and private retrieval need implementation/verification. |
| Auth and ownership | Controls present; not comprehensively tested | Media authentication, conversation ownership, and user-scoped file routes exist. Add explicit generated-job/asset ownership. |
| Quotas | Controls present; concurrency gap | `server/replit_integrations/quota.ts`: plan/burst/daily controls; check-then-record flow may permit concurrent overspend. Usage is recorded after success. |
| Background work | Present outside media | Existing autoscan/retention jobs are not a durable image/audio/video job system. |

## Recommended reuse

- Existing provider abstraction, chat SSE protocol, authentication, and UI.
- Existing user-scoped knowledge retrieval and embedding implementation; do not replace its database merely for the pilot.
- R2 helpers, user-file patterns, and quota UI/logic, with stronger reservation and ownership handling.
- Existing image, audio, and video adapters, subject to runtime testing.

## Priority gap list

1. Add the SLM as an internal test provider without changing the global default.
2. Establish baseline end-to-end tests for current features before adding new providers.
3. Add missing image/video generation UI and durable, user-owned media jobs/assets.
4. Enforce atomic budget reservations, concurrency caps, and idempotent retries.
5. Extend knowledge tool use with a calculator and guarded web search; defer arbitrary code execution.
6. Scope dedicated STT/TTS, music, and sound workflows separately.
7. Benchmark actual load before promising simultaneous-user capacity.

## Scope choices still to confirm

Suggested first text jobs: business writing, document-based customer support, and general assistance. Target African languages and acceptance thresholds have not been chosen by the user. Runtime verification and those choices remain open; the code inventory itself is complete.