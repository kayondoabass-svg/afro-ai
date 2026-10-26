import type { ChatSearchActivity } from "@shared/chat-search";
import { CHAT_SEARCH_LABELS } from "@shared/chat-search";
import { Globe, Loader2 } from "lucide-react";

export function parseSearchActivity(value: unknown): ChatSearchActivity | null {
  try {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    if (!data || data.type !== "web-search" || !Object.hasOwn(CHAT_SEARCH_LABELS, data.status)
      || typeof data.query !== "string" || !Array.isArray(data.sources)) return null;
    return {
      ...data, query: data.query.slice(0, 500),
      sources: data.sources.slice(0, 5).filter((source: any) => {
        try {
          const url = new URL(source.url);
          return url.protocol === "https:" && !url.username && !url.password
            && typeof source.title === "string";
        } catch { return false; }
      }),
    };
  } catch { return null; }
}

export function ChatSearchCard({ activity }: { activity: ChatSearchActivity }) {
  return (
    <section aria-label="Web search activity" aria-live="polite"
      className="min-w-0 max-w-full rounded-lg border p-3 text-sm space-y-2" data-testid="chat-search-activity">
      <p className="flex items-center gap-2">
        {activity.status === "searching" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Globe className="h-4 w-4 shrink-0" />}
        {CHAT_SEARCH_LABELS[activity.status]}
      </p>
      {activity.query && <p className="break-words text-xs text-muted-foreground">{activity.query}</p>}
      {activity.sources.length > 0 && <ul className="space-y-2">
        {activity.sources.map((source, index) => (
          <li key={`${source.url}-${index}`} className="min-w-0">
            <a href={source.url} target="_blank" rel="noopener noreferrer"
              className="text-primary underline break-words [overflow-wrap:anywhere]">{index + 1}. {source.title}</a>
          </li>
        ))}
      </ul>}
    </section>
  );
}
