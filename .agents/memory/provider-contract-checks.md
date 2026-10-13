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
