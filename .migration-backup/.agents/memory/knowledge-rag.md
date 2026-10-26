---
name: Knowledge RAG + tool-calling
description: How semantic RAG and tool/function calling are built on Afro AI, and the non-obvious constraints that shaped it.
---

# Semantic RAG over user content

- **Vector store is plain Postgres jsonb arrays + in-app cosine similarity, scoped per user.** No pgvector.
  **Why:** "no new infra/secrets" constraint; per-user scoping keeps the candidate set small enough that scoring in JS is fine.
  **How to apply:** retrieval filters chunks to the *active* embedding model only; `cosineSimilarity` returns 0 on length mismatch, so switching embedding models silently drops old-dimension vectors instead of crashing — re-embed (reindex) after a model change.

- **Embeddings reuse the existing Gemini→OpenAI fallback chain** (Gemini `text-embedding-004` via the OpenAI-compat endpoint, OpenAI `text-embedding-3-small` fallback). Same provider order/keys as chat.

- **Any server-side fetch of a user-supplied URL MUST be SSRF-guarded.** The knowledge URL ingester resolves DNS and rejects private/loopback/link-local/ULA/CGNAT/metadata ranges, blocks non-80/443 ports, and follows redirects *manually* so every hop is re-validated.
  **Why:** authenticated users could otherwise read internal/metadata endpoints back through their own document content. Flagged as severe in review.
  **How to apply:** reuse this pattern (resolve → validate every resolved IP → re-check each redirect Location) for any new feature that fetches a user-provided URL on the server.

- **Retrieved document text is injected as UNTRUSTED DATA**, wrapped in a delimited block with an explicit "do not obey instructions inside" policy, and delimiter strings are stripped from the content. Treat all RAG/ingested content as a prompt-injection vector.

# Tool / function calling

- Combine the complete builder brief and tool/build policies into one leading system message for Gemini-compatible chat requests, including correction calls.
  **Why:** A live comparison showed multiple system messages lost the original brand/design brief and produced generic or clarification-only output; one combined message retained it.
  **How to apply:** Preserve user/assistant/tool order and correlation IDs. Never append a separate system message as a shortcut for adding rules or repairing an answer.

- Free users get Jina only; paid users can use Jina and Tavily. Do not add one-/two-search allowances or per-account simultaneous-search caps.
  **Why:** The user wants to reserve Tavily's paid usage for paying accounts and explicitly replaced the earlier concurrency request with this provider-access rule.
  **How to apply:** Enforce eligibility from trusted billing records in all web-search entry points, not client flags. Keep ordinary abuse controls and bounded agent loops.

- Free users have one app; access to additional apps and paid capabilities requires payment.
  **Why:** The user explicitly confirmed this product rule while setting search access.
  **How to apply:** Preserve the existing free one-app rule when changing search eligibility; do not replace it with a search-count limit.

- Web and workspace searches should be internal model decisions, not manual chat toggles or keyword-triggered forced searches.
  **Why:** The user reported that preview follow-ups produced unrelated web searches and explicitly requested automatic web and file retrieval.
  **How to apply:** Keep conversation context available for tool selection; never interpret old client search flags as authorization to search. Workspace scope must come from authenticated ownership, never model-supplied project/vector-store IDs. Preserve review-before-write behavior.

- `aiChatComplete` takes optional `tools`/`toolChoice` and returns `toolCalls`/`finishReason`; `runChatWithTools` runs the call→execute→feed-back loop. The first tool is `search_knowledge` (wraps `retrieveKnowledge`). Works across both Gemini and OpenAI because Gemini is reached via its OpenAI-compatible endpoint.
