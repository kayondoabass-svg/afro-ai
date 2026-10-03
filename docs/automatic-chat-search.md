# Automatic chat search

The main conversation route offers `search_web` and `search_workspace_files` with automatic tool selection. Chat UIs no longer send search flags. An old client flag cannot force a search.

The model gets conversation history, then selects tools only when needed. Calls are executed internally with a result matching each call ID before final synthesis. Intermediate model/tool-call text is not streamed as the answer. Existing credential and customer-branding checks run on the final response.

## Bounds and privacy

- Two tool-request rounds, at most four executions, followed by final-answer-only synthesis.
- 110-second overall deadline, request-disconnect cancellation, bounded provider response sizes.
- Reject malformed calls and unsafe public queries. Never use retrieved instructions as authority.
- Web sources retain their real URLs and truthful success/empty/failure status in conversation history.
- Workspace identity comes from the authenticated, owned conversation—not model arguments or a supplied vector-store ID.
- Existing project-agent edits still require explicit review; search grants no write or execution capability.

## Search providers

Free users use Jina only. Verified paying accounts can use both Jina and Tavily: a search queries both configured providers and merges/deduplicates their sources. Access uses the existing paid-account billing check, not browser flags or trials. Missing Jina configuration never sends free traffic to Tavily. A failed provider causes an explicit search failure rather than an automatic paid retry.

There is no one-search allowance or per-account simultaneous-search cap. Existing abuse controls and per-response tool budgets remain. When both providers are configured, each paid web-tool execution makes one request to each provider. Configure keys on the actual deployed server, not in browser code. No database migration or Worker update is required.

Tavily integration is covered by mocked API contract tests; real Tavily requests require the key.

## Workspace retrieval

This release uses a **local text index**, not hosted vector stores or semantic embeddings. Saved text files are chunked and indexed after a successful save. A bounded process cache is rebuilt after restarts and invalidated by a fingerprint of the current owned file snapshot. Every search rechecks ownership and current data, including edits/deletions from other processes.

Results include paths, line ranges and snippets. Binary and secret files are excluded; detected credentials are redacted. Large workspaces/results are bounded and report truncation. No workspace content is uploaded to a new embedding/search service. Existing user knowledge retrieval remains in place.

Local tests verify tool routing, synthesis, privacy rejection, cancellation, provider failures, current-file retrieval and frontend queue behavior. They do not prove real LLM selection, production search-provider availability, or rendered signed-in UI behavior.