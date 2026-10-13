---
name: Provider contract checks
description: Separate tool execution from whether the test prompt requests a final answer
---

A tool-round-trip test must explicitly request the final explanation after
supplying the tool result. An initial instruction saying “call the tool, do not
answer directly” can legitimately produce an empty final answer.

**Why:** A live Gemini smoke check initially reported a false contract failure
even though the requested tool call was valid; its prompt did not clearly ask
for a final response.

**How to apply:** Check provider identity and structured tool arguments first,
then append a clear final-answer request and check the result. Mocked tests do
not establish live provider availability; a fallback is not proof the requested
provider worked. Use bounded requests without customer content.

Production verification must exercise the actual paid/founder model tier, not
just the starter model or the development credentials.

**Why:** The starter Gemini smoke test passed while production Business traffic
selected Gemini 2.5 Pro, which returned 404 through both Google endpoints. Flash
worked with the same production key; the OpenAI fallback separately had no
credits. A Google payment could not resolve either model availability or the
separate OpenAI balance.

**How to apply:** Probe the actual production tier and preserve returned model
identity. Model listing alone does not prove generation works. A known-model
404 can use one disclosed, cheaper-model fallback; do not repeat an ambiguous
timeout, cancellation, quota rejection or partially streamed answer that way.
