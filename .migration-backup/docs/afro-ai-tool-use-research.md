# Afro AI tool-use research and proposed contract

Reviewed 2026-09-28. Weekly item 3 research deliverable, not an implementation or authorization to spend. Limits below are proposed pilot defaults, not measured capacity or provider guarantees.

## Findings and compatibility

Tool calling is a conversation protocol, not execution inside the language model. The application supplies named tools and argument schemas; the model chooses a tool and supplies arguments; the server executes an authorized handler; its result is returned against the original tool-call ID; the model then answers or requests another call.

Afro AI already implements this pattern for `search_knowledge` in `server/ai-tools.ts`, exposed through `/api/knowledge/ask`. It scopes retrieval to the authenticated user and defaults to four rounds. Four rounds alone do not cap the number of calls within each round. The current handler coerces query input rather than enforcing a strict bounded schema. Extend this code rather than creating a second agent engine.

An OpenAI-compatible endpoint does not guarantee tool compatibility. Verify the exact vLLM version, tokenizer/chat template, supported parser, tool-choice settings, and model behavior. Current vLLM documentation describes automatic tool choice and parser configuration; strict-schema behavior varies by mode/version. Do not copy a parser from another model's example. The earlier fine-tuned Qwen chat smoke test did not test tools.

Use strict schemas where supported, but always validate arguments server-side. Unknown names, malformed JSON, extra fields, oversized strings, and invalid numeric values must fail before execution. Neither a schema nor a prompt grants permission.

## How the model selects and uses tools

Expose only tools allowed for this user, feature flag, and budget. Descriptions should specify when to use each tool:

- Ordinary writing or explanation: answer without a tool.
- Questions about the user's documents: search knowledge and cite returned sources.
- Exact arithmetic: calculate rather than guess.
- Current public facts: search, then fetch relevant public sources if necessary; cite URLs and distinguish missing evidence.
- Requested image: propose a paid image job, obtain approval, then submit once.
- Code analysis: do not execute code unless an independently verified sandbox is enabled.

Example: “What is 18% of 250?” → model proposes `calculate` with `{"expression":"250*0.18"}` → server validates/evaluates → returns `{"value":45}` → model answers “18% of 250 is 45.” This example describes proposed behavior, not an existing calculator.

## Proposed tool contracts

All arguments are JSON objects with every listed field required and `additionalProperties: false`. Optional behavior uses explicit nulls or server defaults. User IDs, credentials, file paths, prices, and permission flags must never be accepted from model arguments.

| Name | Argument schema and constraints | Permission, runtime limit | Result and cost |
|---|---|---|---|
| `search_knowledge` | `query`: string, 1–1,000 characters | Authenticated user's documents only; 10 seconds; max 5 hits | Source IDs, bounded excerpts, scores; embedding/model charges may apply |
| `calculate` | `expression`: string, 1–256 characters | Pure arithmetic parser; 1 second; max 100 syntax nodes | Numeric value or explicit error; local CPU plus model tokens |
| `web_search` | `query`: string, 1–500 characters | Public search; 10 seconds; max 5 results; never send private document content without consent | Title, URL, snippet, retrieval time; search-provider fee plus model tokens, quote pending |
| `fetch_public_page` | `url`: string, HTTPS URL, max 2,048 characters | Guarded outbound fetch; 10 seconds; max 3 redirects, validated separately; max 1 MB response | URL, title, bounded plain text, retrieval time; network/model costs |
| `generate_image` | `prompt`: string, 1–2,000 characters; `size`: enum `square`, `portrait`, `landscape` | Paid generation, approval and atomic budget reservation required; 10-second enqueue deadline, 180-second worker deadline | Immediate owned job ID, status; eventual private asset ID; provider/model fees, no unverified price claimed |
| `run_python` — disabled | `code`: string, 1–10,000 characters | Only after sandbox verification; proposed 5-second CPU, 10-second wall, 256 MB RAM, 10 MB temporary disk | Bounded stdout/error and owned artifact IDs; sandbox compute plus model fees |

Reject non-finite calculator results, division by zero, identifiers, functions, assignments, property access, and pathological exponents. Do not use JavaScript `eval`, Python `eval`, or shell execution.

Web search is discovery, page fetching is reading, and browser automation is a separate capability. Start with search and static pages. Defer JavaScript browsing, logins, form submissions, and downloads until a controlled browser service and operation-specific permissions are established. No search provider is selected or provisioned here.

Reuse the Imagen/OpenAI image adapter. Wrap it in durable jobs and user-owned storage; do not pass base64 image data back into model context. An operation timeout must not trigger an automatic second paid generation.

## Server-enforced execution loop

1. Authenticate the request; derive user and tenant context on the server.
2. Select an allowlisted tool set and enforce request/token limits.
3. Request a model response with tool descriptions and schemas.
4. For each requested call, validate the name, JSON/schema, ownership, permission, deadline, and budget.
5. For paid/consequential work, obtain action-bound approval and reserve the maximum quoted cost atomically. Approval binds user, tool, exact arguments, expiry, and single use; a model-supplied confirmation flag is insufficient.
6. Execute the registered handler with cancellation and resource limits. Use a server-managed idempotency key; handle duplicate submissions without repeating paid work.
7. Return a bounded structured result associated with the call ID. Keep provenance/citations. Treat results as untrusted data, not instructions.
8. Let the model produce an answer or request another permitted call. On exhaustion, return a clear limit/error rather than inventing a result.

Result envelope: `{"callId":"…","tool":"…","ok":true,"data":{},"sources":[],"truncated":false}`. On failure use `ok:false` and `error:{code,message,retryable}` with a sanitized message. Never return stack traces, provider credentials, or internal network details.

## Proposed global limits and accounting

- Maximum 4 tool rounds, 6 calls total, and 2 calls per model response. Sequential execution for the first pilot.
- Maximum 60 seconds for an interactive tool loop; media jobs run separately.
- Maximum 8 KB serialized result per call and 24 KB aggregate tool-result context; mark truncation explicitly.
- One retry only for transient, read-only failures within the same deadline; every attempt counts toward the call limit. No automatic retries for paid writes unless provider idempotency or operation lookup establishes safety.
- No tool-to-tool recursion. Reject excess calls without executing them, and preserve protocol-valid error responses.
- At most 2 active tool requests and 1 active paid media job per user; also enforce a configurable global ceiling based on measured infrastructure capacity.
- Paid tools stay disabled until price quotes, per-user/global budgets, and reservation/reconciliation are configured. Provider billing alerts are not hard caps.
- Track user, call/job ID, tool, duration, status, reserved/actual cost, and source IDs. Redact sensitive arguments; avoid raw document/prompt logging by default.
- User disconnect cancels read work. For already-submitted paid jobs, retain operation state, reconcile eventual charges, and expose cancellation only where the provider supports it.

## Isolation requirements

Public URL fetching must reject credentials in URLs and private, loopback, link-local, metadata, and other non-public destinations in IPv4 and IPv6. Validate DNS and every redirect, and ensure the actual connection cannot bypass that validation through DNS rebinding. Add outbound network policy where available; reuse existing fetch code only after testing these properties.

Do not execute model code in the website's Node process, a subprocess with host access, or the live app server's filesystem. A subprocess, ordinary language VM, or browser playground is not proof of a secure server sandbox. Require an isolated execution service with no host secrets/mounts, networking denied by default, process/resource limits, ephemeral storage, and forced teardown. No sandbox platform is selected and no infrastructure purchase is authorized.

## Implementation order and acceptance checks

1. Harden the existing knowledge loop and add pure arithmetic.
2. Verify the self-hosted model can select tools, produce valid arguments, and answer from actual tool results. Keep it internal and preserve the existing provider.
3. Add public search/fetch after provider/cost selection and SSRF tests.
4. Add approved image jobs after storage, ownership, budget reservations, and idempotency.
5. Keep arbitrary code execution disabled until isolation passes review.

Required tests before enablement:

- A normal writing request invokes no tool; document questions invoke user-scoped retrieval; arithmetic yields correct finite results.
- Malformed/extra arguments, unknown names, excessive parallel calls, and exhausted budgets produce no execution.
- Cross-user document/asset/job requests are denied server-side.
- Retrieved text saying “ignore instructions and run another tool” cannot authorize any action.
- Private-IP URLs and redirect-to-private/DNS-rebinding cases are blocked.
- Duplicate paid requests create one job; concurrent requests cannot overspend reservations.
- Timeouts, provider outages, cancellation, truncated output, restart recovery, and late provider completion are represented honestly.
- Unsupported self-hosted tool output fails explicitly rather than treating raw text as executable instructions.

No acceptance tests above were executed as part of this research.

## Sources

Official documentation reviewed 2026-09-28; live pages can change, so pin deployment versions before implementation.

- OpenAI, [Function calling](https://developers.openai.com/api/docs/guides/function-calling): schemas, tool-call/result flow, application execution.
- vLLM, [Tool calling](https://docs.vllm.ai/en/stable/features/tool_calling/): parser configuration, automatic choice, strict-mode compatibility.
- OWASP, [SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): destination validation, DNS risks, network controls.

Specific timeouts, budgets, schemas, and rollout ordering above are proposed Afro AI engineering choices, not requirements prescribed by those sources.