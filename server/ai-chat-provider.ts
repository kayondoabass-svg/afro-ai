import OpenAI from "openai";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type UserTier = "starter" | "pro" | "business" | "payg";

export interface ChatCompleteOptions {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: "json_object" } | { type: "text" };
  /**
   * The plan/tier of the user making the request. Drives which Gemini model
   * is selected so paying users get higher-quality output and free users get
   * cost-controlled output. Falls back to "starter" if omitted.
   */
  tier?: UserTier;
}

// Gemini model selection per plan. Free tier uses the cheapest model so a
// runaway free user can't burn $50 of credits in an afternoon. Business gets
// the flagship model for code-generation quality.
const GEMINI_MODEL_BY_TIER: Record<UserTier, string> = {
  starter:  "gemini-2.5-flash-lite", // ~$0.10 / 1M input — cheapest current model
  pro:      "gemini-2.5-flash",      // ~$0.30 / 1M input
  business: "gemini-2.5-pro",        // ~$1.25 / 1M input — best quality
  payg:     "gemini-2.5-pro",        // PAYG users metered per token, give them best
};

// Hard ceiling on output tokens per reply, by tier. Stops a single chat from
// producing a 50,000-token response that costs more than the user's plan.
export const MAX_OUTPUT_TOKENS_BY_TIER: Record<UserTier, number> = {
  starter:  8_000,   // raised from 2k — 2k truncates HTML code-gen mid-build
  pro:      16_000,  // raised from 8k for the same reason on bigger pages
  business: 32_000,
  payg:     64_000,
};

export function geminiModelForTier(tier?: UserTier): string {
  return GEMINI_MODEL_BY_TIER[tier || "starter"];
}

export function maxOutputTokensForTier(tier?: UserTier): number {
  return MAX_OUTPUT_TOKENS_BY_TIER[tier || "starter"];
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
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API;
}

function isAvailable(provider: Provider): boolean {
  if (provider === "openai") {
    const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    return Boolean(key && !key.includes("_DUMMY_") && !key.includes("dummy"));
  }
  return Boolean(geminiKey());
}

function makeClient(provider: Provider, tier?: UserTier): { client: OpenAI; model: string } {
  if (provider === "openai") {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;
    return {
      client: new OpenAI({ apiKey, baseURL }),
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    };
  }
  // Gemini via Google's official OpenAI-compatible endpoint.
  // GEMINI_MODEL env var still wins if explicitly set (lets ops pin a model
  // during incidents), otherwise we pick by user tier.
  return {
    client: new OpenAI({
      apiKey: geminiKey(),
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    }),
    model: process.env.GEMINI_MODEL || geminiModelForTier(tier),
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
  // Default: Gemini primary, OpenAI fallback. Gemini Flash is ~10x cheaper
  // than GPT-4.1-mini and the per-tier model picker still gives Business
  // users 2.5-pro quality.
  const primary = (process.env.AI_PRIMARY_PROVIDER || "gemini").toLowerCase() as Provider;
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

  // Cap output tokens at the tier ceiling — even if a caller asks for more,
  // never exceed what the user's plan allows.
  const tierCap = maxOutputTokensForTier(opts.tier);
  const effectiveMax = opts.maxTokens
    ? Math.min(opts.maxTokens, tierCap)
    : tierCap;

  let lastErr: any = null;
  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    try {
      const { client, model } = makeClient(provider, opts.tier);
      const completion = await client.chat.completions.create({
        model,
        messages: opts.messages as any,
        max_tokens: effectiveMax,
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
  tier?: UserTier;
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

  const tierCap = maxOutputTokensForTier(opts.tier);
  const effectiveMax = opts.maxTokens
    ? Math.min(opts.maxTokens, tierCap)
    : tierCap;

  let lastErr: any = null;
  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    let receivedAnyChunk = false;
    try {
      const { client, model } = makeClient(provider, opts.tier);
      const stream = await client.chat.completions.create({
        model,
        messages: opts.messages,
        stream: true,
        max_tokens: effectiveMax,
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
