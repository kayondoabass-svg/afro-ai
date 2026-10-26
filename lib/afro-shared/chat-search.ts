export interface ChatSearchSource {
  title: string;
  url: string;
  snippet: string;
  retrievedAt: string;
}

export interface ChatSearchActivity {
  type: "web-search";
  status: "searching" | "success" | "empty" | "unavailable" | "failed" | "cancelled" | "needs-context";
  query: string;
  sources: ChatSearchSource[];
}

export const CHAT_SEARCH_LABELS: Record<ChatSearchActivity["status"], string> = {
  "needs-context": "Describe or name the subject to search. Image upload is not reverse image search.",
  searching: "Searching the web…",
  success: "Web sources found",
  empty: "No web results found. Try a more specific question.",
  unavailable: "Web search is not configured. No search was performed.",
  failed: "Web search failed. Please try again.",
  cancelled: "Web search cancelled.",
};