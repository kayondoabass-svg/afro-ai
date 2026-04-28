import OpenAI from "openai";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompleteOptions {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: "json_object" } | { type: "text" };
}

export interface ChatCompleteResult {
  text: string;
  provider: "openai" | "gemini";
  model: string;
}

type Provider = "openai" | "gemini";

function geminiKey(): string | undefined {
  // Accept either env name. GOOGLE_API_KEY is the modern name in
  // Google AI Studio; GEMINI_API_KEY is the legacy alias still used
  // throughout the codebase.
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

function isAvailable(provider: Provider): boolean {
  if (provider === "openai") {
    const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    return Boolean(key && !key.includes("_DUMMY_") && !key.includes("dummy"));
  }
  return Boolean(geminiKey());
}

function makeClient(provider: Provider): { client: OpenAI; model: string } {
  if (provider === "openai") {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;
    return {
      client: new OpenAI({ apiKey, baseURL }),
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    };
  }
  return {
    client: new OpenAI({
      apiKey: geminiKey(),
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    }),
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  };
}

function isFatalAuthOrQuotaError(err: any): boolean {
  const status = err?.status || err?.response?.status;
  if (status === 401 || status === 402 || status === 403 || status === 429) return true;
  const code = String(err?.code || err?.error?.code || "").toLowerCase();
  if (
    code.includes("insufficient_quota") ||
    code.includes("invalid_api_key") ||
    code.includes("billing") ||
    code.includes("quota")
  ) {
    return true;
  }
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("insufficient_quota") ||
    msg.includes("exceeded your current quota") ||
    msg.includes("invalid api key") ||
    msg.includes("incorrect api key") ||
    msg.includes("billing")
  );
}

function getProviderOrder(): Provider[] {
  const primary = (process.env.AI_PRIMARY_PROVIDER || "openai").toLowerCase() as Provider;
  const secondary: Provider = primary === "openai" ? "gemini" : "openai";
  const order: Provider[] = [];
  if (isAvailable(primary)) order.push(primary);
  if (isAvailable(secondary)) order.push(secondary);
  return order;
}

export async function aiChatComplete(opts: ChatCompleteOptions): Promise<ChatCompleteResult> {
  const order = getProviderOrder();
  if (order.length === 0) {
    throw new Error("No AI provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY.");
  }

  let lastErr: any = null;
  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    try {
      const { client, model } = makeClient(provider);
      const completion = await client.chat.completions.create({
        model,
        messages: opts.messages as any,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature ?? 0.4,
        ...(opts.responseFormat ? { response_format: opts.responseFormat as any } : {}),
      });
      const text = completion.choices?.[0]?.message?.content?.trim() || "";
      return { text, provider, model };
    } catch (err: any) {
      lastErr = err;
      const fatal = isFatalAuthOrQuotaError(err);
      const hasFallback = i < order.length - 1;
      console.warn(
        `[ai-chat] ${provider} failed (${err?.status || err?.code || "?"}): ${err?.message || err}. ${
          fatal && hasFallback ? "Falling back to next provider." : hasFallback ? "Trying next provider." : "No more providers."
        }`,
      );
      if (!fatal && !hasFallback) break;
      continue;
    }
  }
  throw lastErr || new Error("AI request failed across all providers.");
}

export function hasAnyAiProvider(): boolean {
  return getProviderOrder().length > 0;
}

export interface ChatStreamOptions {
  messages: any[]; // allows rich content (vision parts, etc.)
  maxTokens?: number;
  temperature?: number;
  onChunk: (text: string) => void;
}

export interface ChatStreamResult {
  fullText: string;
  provider: Provider;
  model: string;
  completionTokens: number;
}

/**
 * Streaming chat completion with automatic OpenAI <-> Gemini fallback.
 * - Tries the primary provider first (configured via AI_PRIMARY_PROVIDER).
 * - If the primary fails BEFORE sending any chunks (auth/quota/network),
 *   transparently falls back to the secondary provider.
 * - If the primary fails AFTER sending chunks, the error is re-thrown
 *   (we cannot safely splice two providers' output mid-stream).
 */
export async function aiChatCompleteStream(opts: ChatStreamOptions): Promise<ChatStreamResult> {
  const order = getProviderOrder();
  if (order.length === 0) {
    throw new Error("No AI provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY.");
  }

  let lastErr: any = null;
  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    let receivedAnyChunk = false;
    try {
      const { client, model } = makeClient(provider);
      const stream = await client.chat.completions.create({
        model,
        messages: opts.messages,
        stream: true,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature ?? 0.4,
      } as any);

      let fullText = "";
      let completionTokens = 0;
      for await (const chunk of stream as any) {
        const content = chunk.choices?.[0]?.delta?.content || "";
        if (content) {
          fullText += content;
          receivedAnyChunk = true;
          opts.onChunk(content);
        }
        if (chunk.usage?.completion_tokens) {
          completionTokens = chunk.usage.completion_tokens;
        }
      }
      if (!completionTokens) completionTokens = Math.ceil(fullText.length / 4);
      return { fullText, provider, model, completionTokens };
    } catch (err: any) {
      lastErr = err;
      // If we already streamed bytes to the client, we can't fall back cleanly.
      if (receivedAnyChunk) throw err;

      const fatal = isFatalAuthOrQuotaError(err);
      const hasFallback = i < order.length - 1;
      console.warn(
        `[ai-chat-stream] ${provider} failed (${err?.status || err?.code || "?"}): ${err?.message || err}. ${
          fatal && hasFallback ? "Falling back to next provider." : hasFallback ? "Trying next provider." : "No more providers."
        }`,
      );
      if (!fatal && !hasFallback) break;
      continue;
    }
  }
  throw lastErr || new Error("AI streaming request failed across all providers.");
}
