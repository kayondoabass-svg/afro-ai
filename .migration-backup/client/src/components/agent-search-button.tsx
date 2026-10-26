import { createContext, useContext, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChatSearchCard } from "./chat-search";
import type { ChatSearchActivity } from "@shared/chat-search";

export const AgentSearchContext = createContext<ChatSearchActivity[]>([]);
export function AgentSearchButton({ code = "", activities }: { code?: string; activities?: ChatSearchActivity[] }) {
  const conversationActivities = useContext(AgentSearchContext);
  const searches = activities ?? conversationActivities;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = query.trim() ? code.split("\n").map((text, i) => ({ text, line: i + 1 }))
    .filter(row => row.text.toLowerCase().includes(query.trim().toLowerCase())) : [];
  return <>
    <button type="button" aria-label="Search code and web sources" title="Search code and web sources"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
      onClick={() => setOpen(true)}><Search className="h-4 w-4" aria-hidden="true" /></button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogHeader><DialogTitle>Search code and web sources</DialogTitle>
          <DialogDescription>Find text in generated code. Web research runs automatically when needed; this panel shows actual results, not a search toggle.</DialogDescription>
        </DialogHeader>
        <label className="space-y-2 text-sm">Find in code
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a function, style, or phrase…"
            className="block w-full rounded-md border border-zinc-700 bg-zinc-900 p-2" />
        </label>
        {!code && <p className="text-sm text-zinc-400">No generated code is available yet.</p>}
        {code && query.trim() && <div aria-live="polite">
          <p className="text-sm text-zinc-400">{matches.length} matching lines{matches.length > 100 ? " (showing the first 100)" : ""}</p>
          <ul className="mt-2 space-y-2">{matches.slice(0, 100).map(row => <li key={row.line} className="rounded border border-zinc-800 p-2">
            <span className="text-xs text-violet-300">Line {row.line}</span><pre className="overflow-x-auto text-xs">{row.text}</pre>
          </li>)}</ul>
        </div>}
        <h3 className="font-medium">Conversation web sources</h3>
        {searches.length ? searches.map((activity, i) => <ChatSearchCard key={i} activity={activity} />)
          : <p className="text-sm text-zinc-400">No web searches have run in this conversation. Ask your question in chat; the assistant decides whether research is needed.</p>}
      </DialogContent>
    </Dialog>
  </>;
}