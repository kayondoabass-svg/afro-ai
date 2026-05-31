import { aiChatComplete, type UserTier } from "./ai-chat-provider";
import { retrieveKnowledge, type RetrievedChunk } from "./knowledge";

/**
 * Tool/function-calling layer. Exposes a small, SAFE set of tools the model can
 * call, and a loop that executes them and feeds results back until the model
 * produces a final answer. Tools are bound to a request context (the calling
 * user) so a tool can never read another user's data.
 */

export interface ToolContext {
  userId: string;
}

/** OpenAI-style tool definitions advertised to the model. */
export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description:
        "Search the user's own uploaded knowledge base (documents, notes, pasted text, fetched pages) for passages relevant to a question. Call this whenever the user asks about their own content, business, product, or documents.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "A focused natural-language search query describing what to find.",
          },
        },
        required: ["query"],
      },
    },
  },
];

export interface ToolRunResult {
  text: string;
  sources: RetrievedChunk[];
  rounds: number;
  usedTools: string[];
}

/**
 * Run a chat with tool calling. Loops up to maxRounds: ask the model (with
 * tools), execute any tool calls, append results, ask again. When the model
 * stops requesting tools, return its text. Sources retrieved via search_knowledge
 * are accumulated for citation in the UI.
 */
export async function runChatWithTools(opts: {
  messages: { role: string; content: string }[];
  tier?: UserTier;
  ctx: ToolContext;
  maxRounds?: number;
  maxTokens?: number;
}): Promise<ToolRunResult> {
  const maxRounds = opts.maxRounds ?? 4;
  const convo: any[] = [...opts.messages];
  const sources: RetrievedChunk[] = [];
  const usedTools: string[] = [];

  const handlers: Record<string, (args: any) => Promise<any>> = {
    search_knowledge: async (args: { query?: string }) => {
      const found = await retrieveKnowledge(opts.ctx.userId, String(args?.query || ""), 5);
      sources.push(...found);
      if (found.length === 0) return { results: [], note: "No matching passages in the user's knowledge base." };
      return {
        results: found.map((f, i) => ({ rank: i + 1, score: Number(f.score.toFixed(3)), content: f.content })),
      };
    },
  };

  let rounds = 0;
  for (; rounds < maxRounds; rounds++) {
    const res = await aiChatComplete({
      messages: convo,
      tier: opts.tier,
      tools: TOOL_DEFINITIONS,
      toolChoice: "auto",
      maxTokens: opts.maxTokens,
    });

    if (!res.toolCalls || res.toolCalls.length === 0) {
      return { text: res.text, sources: dedupeSources(sources), rounds: rounds + 1, usedTools };
    }

    // Record the assistant turn that requested the tools, then run them.
    convo.push({ role: "assistant", content: res.text || "", tool_calls: res.toolCalls });
    for (const call of res.toolCalls) {
      const name = call?.function?.name;
      usedTools.push(name);
      let parsed: any = {};
      try {
        parsed = JSON.parse(call?.function?.arguments || "{}");
      } catch {
        parsed = {};
      }
      let result: any;
      try {
        const handler = handlers[name];
        result = handler ? await handler(parsed) : { error: `Unknown tool: ${name}` };
      } catch (e: any) {
        result = { error: String(e?.message || e) };
      }
      convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  // Hit the round cap — ask once more WITHOUT tools to force a final answer.
  const final = await aiChatComplete({ messages: convo, tier: opts.tier, maxTokens: opts.maxTokens });
  return { text: final.text, sources: dedupeSources(sources), rounds, usedTools };
}

function dedupeSources(sources: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const out: RetrievedChunk[] = [];
  for (const s of sources.sort((a, b) => b.score - a.score)) {
    const key = `${s.documentId}:${s.content.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
