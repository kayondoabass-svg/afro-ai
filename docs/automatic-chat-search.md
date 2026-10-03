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

Tavily is selected when `TAVILY_API_KEY` is configured. Otherwise the existing `JINA_API_KEY` provider remains selected. Provider failure does **not** silently retry against another paid search service. Configure the chosen key in the actual deployed server environment, not browser code. No database migration or Worker update is required for these changes.

Tavily integration is covered by mocked API contract tests; real Tavily requests require the key.

## Workspace retrieval

This release uses a **local text index**, not hosted vector stores or semantic embeddings. Saved text files are chunked and indexed after a successful save. A bounded process cache is rebuilt after restarts and invalidated by a fingerprint of the current owned file snapshot. Every search rechecks ownership and current data, including edits/deletions from other processes.

Results include paths, line ranges and snippets. Binary and secret files are excluded; detected credentials are redacted. Large workspaces/results are bounded and report truncation. No workspace content is uploaded to a new embedding/search service. Existing user knowledge retrieval remains in place.

Local tests verify tool routing, synthesis, privacy rejection, cancellation, provider failures, current-file retrieval and frontend queue behavior. They do not prove real LLM selection, production search-provider availability, or rendered signed-in UI behavior.