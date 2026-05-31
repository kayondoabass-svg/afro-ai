import OpenAI from "openai";

/**
 * Embeddings service for semantic RAG.
 *
 * Reuses the same Gemini-first / OpenAI-fallback strategy as ai-chat-provider.ts
 * so no new API key is required. IMPORTANT: a vector store can only compare
 * embeddings produced by the SAME model (different models live in different
 * vector spaces and have different dimensionalities). We therefore pin a single
 * active embedding model per provider and persist the model name alongside each
 * stored vector, so retrieval can skip/repair any vectors from a different model.
 */

type Provider = "gemini" | "openai";

// Gemini text-embedding-004 => 768 dims. OpenAI text-embedding-3-small => 1536.
const GEMINI_EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "text-embedding-004";
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API;
}

function openaiKey(): string | undefined {
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key || key.includes("_DUMMY_") || key.includes("dummy")) return undefined;
  return key;
}

function activeProvider(): Provider | null {
  const primary = (process.env.AI_PRIMARY_PROVIDER || "gemini").toLowerCase();
  if (primary === "openai") {
    if (openaiKey()) return "openai";
    if (geminiKey()) return "gemini";
  } else {
    if (geminiKey()) return "gemini";
    if (openaiKey()) return "openai";
  }
  return null;
}

/** The model id whose vectors are currently being written. Used to tag chunks. */
export function activeEmbeddingModel(): string {
  const p = activeProvider();
  if (p === "openai") return `openai:${OPENAI_EMBED_MODEL}`;
  return `gemini:${GEMINI_EMBED_MODEL}`;
}

export function hasEmbeddingProvider(): boolean {
  return activeProvider() !== null;
}

function makeClient(provider: Provider): { client: OpenAI; model: string } {
  if (provider === "openai") {
    return {
      client: new OpenAI({
        apiKey: openaiKey(),
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
      }),
      model: OPENAI_EMBED_MODEL,
    };
  }
  return {
    client: new OpenAI({
      apiKey: geminiKey(),
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    }),
    model: GEMINI_EMBED_MODEL,
  };
}

/** Embed a batch of texts. Returns one vector per input, in order. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const provider = activeProvider();
  if (!provider) {
    throw new Error("No embedding provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY.");
  }
  const { client, model } = makeClient(provider);
  // Trim each input to a safe size (~8k chars) to stay well under token limits.
  const inputs = texts.map((t) => (t.length > 8000 ? t.slice(0, 8000) : t));
  const res = await client.embeddings.create({ model, input: inputs });
  // OpenAI SDK guarantees data is index-aligned with input order.
  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding as number[]);
}

/** Embed a single text. */
export async function embedText(text: string): Promise<number[]> {
  const [v] = await embedBatch([text]);
  return v;
}

/** Cosine similarity between two equal-length vectors. Returns 0 on mismatch. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
