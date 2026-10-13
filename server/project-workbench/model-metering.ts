import type { ChatCompleteOptions } from "../ai-chat-provider";

export function modelInputBound(opts: Pick<ChatCompleteOptions, "messages" | "tools">) {
  let images = 0;
  const serialized = JSON.stringify(opts, (key, value) => {
    if (key === "image_url") { images++; return { url: "[image]", detail: "high" }; }
    return value;
  });
  // Count UTF-8 bytes conservatively, not characters or output alone.
  // Image encodings aren't text tokens; reserve a separate bounded allowance.
  return Buffer.byteLength(serialized, "utf8") + 4096 + images * 20000;
}

export function measuredUsage(result: { promptTokens?: number; completionTokens?: number; usageEstimated?: boolean }, input: number, output: number) {
  const actual = !result.usageEstimated && Number.isSafeInteger(result.promptTokens) && Number.isSafeInteger(result.completionTokens)
    && result.promptTokens! >= 0 && result.completionTokens! >= 0;
  return { tokens: actual ? result.promptTokens! + result.completionTokens! : input + output, estimated: !actual };
}
