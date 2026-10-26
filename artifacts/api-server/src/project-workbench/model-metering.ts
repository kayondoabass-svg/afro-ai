import type { ChatCompleteOptions } from "../ai-chat-provider";
import { getEncoding } from "js-tiktoken";

// Local encoders avoid another provider request just to estimate the prompt.
const encodings = [getEncoding("cl100k_base"), getEncoding("o200k_base")];

export function modelInputBound(opts: Pick<ChatCompleteOptions, "messages" | "tools">) {
  let images = 0;
  const serialized = JSON.stringify(opts, (key, value) => {
    if (key === "image_url") { images++; return { url: "[image]", detail: "high" }; }
    return value;
  });
  // Bytes are NOT tokens: the existing builder prompt alone is ~69 KB.
  // Reserve the larger text-token count, a cross-model safety margin and
  // framing allowance. This is still an estimate, not a provider invoice.
  // Treat special-token-looking customer text as ordinary text.
  // Bound BPE work on long repeated strings (code, CJK, pasted data). Encoding
  // chunks independently also errs upward at boundaries rather than assuming
  // one character or byte is a token. Cache repeats only within this call.
  const chunks: string[] = [];
  for (let start = 0; start < serialized.length;) {
    let end = Math.min(start + 256, serialized.length);
    const tail = serialized.charCodeAt(end - 1), next = serialized.charCodeAt(end);
    if (tail >= 0xd800 && tail <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end++;
    chunks.push(serialized.slice(start, end));
    start = end;
  }
  const cache = new Map<string, number>();
  let textTokens = 0;
  for (const chunk of chunks) {
    let count = cache.get(chunk);
    if (count === undefined) {
      count = Math.max(...encodings.map(e => e.encode(chunk, [], []).length));
      cache.set(chunk, count);
    }
    textTokens += count;
  }
  return Math.ceil(textTokens * 1.2) + 1024 + images * 20000;
}

export function measuredUsage(result: { promptTokens?: number; completionTokens?: number; usageEstimated?: boolean }, input: number, output: number) {
  const actual = !result.usageEstimated && Number.isSafeInteger(result.promptTokens) && Number.isSafeInteger(result.completionTokens)
    && result.promptTokens! >= 0 && result.completionTokens! >= 0;
  return { tokens: actual ? result.promptTokens! + result.completionTokens! : input + output, estimated: !actual };
}
