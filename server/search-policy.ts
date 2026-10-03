import { fullstackAccess } from "./fullstack-access";
import { searchWeb, webSearchConfigured } from "./web-search";

export class SearchAccessError extends Error {
  constructor(public code: "SEARCH_UNAVAILABLE", message: string) { super(message); }
}

/** Trusted billing eligibility; trials, client flags and founder bypasses do not grant Tavily. */
export async function searchAccess(userId: string) {
  if (!userId) throw new Error("Authentication required for search.");
  const paid = (await fullstackAccess(userId)).allowed;
  const providers = (paid ? ["jina", "tavily"] as const : ["jina"] as const).filter(p => webSearchConfigured(p));
  return { paid, providers, available: providers.length > 0 };
}

export async function searchAccountWeb(userId: string, query: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const access = await searchAccess(userId);
  if (!access.available) throw new SearchAccessError("SEARCH_UNAVAILABLE", "Your plan's search provider is not configured.");
  signal?.throwIfAborted();
  // No per-account concurrency allowance. Existing abuse controls and per-reply
  // tool budgets remain. Both configured providers participate for paying users.
  const groups = await Promise.all(access.providers.map(p => searchWeb(query, signal, p)));
  signal?.throwIfAborted();
  const merged = [];
  const seen = new Set<string>();
  for (let rank = 0; rank < 5; rank++) {
    for (const group of groups) {
      const source = group[rank];
      if (source && !seen.has(source.url)) { seen.add(source.url); merged.push(source); }
      if (merged.length === 5) return merged;
    }
  }
  return merged;
}