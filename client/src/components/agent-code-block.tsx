import { useState } from "react";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { extractWebsiteHtml } from "@shared/html-extraction";

export function AgentHtmlPreview({ html, onClose }: { html: string | null; onClose: () => void }) {
  return <Dialog open={html !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="flex h-[85dvh] w-[calc(100%_-_2rem)] max-w-5xl flex-col border-zinc-800 bg-zinc-950 text-zinc-100">
      <DialogHeader>
        <DialogTitle>Website preview</DialogTitle>
        <DialogDescription className="text-zinc-400">This generated page runs in an isolated preview. It is not published.</DialogDescription>
      </DialogHeader>
      {html !== null && <iframe title="Generated website preview" srcDoc={html} sandbox="allow-scripts"
        referrerPolicy="no-referrer" className="min-h-0 w-full flex-1 rounded-lg border border-zinc-800 bg-zinc-100" />}
    </DialogContent>
  </Dialog>;
}

export function AgentCodeBlock({ code, language, complete = true, previewBlocked = false, testId }: {
  code: string; language: string; complete?: boolean; previewBlocked?: boolean; testId?: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const html = complete ? extractWebsiteHtml(code) : null;
  const website = (html !== null && /<!doctype|<(?:html|body|main|style|script|section|canvas)\b/i.test(html))
    || (!complete && /^(?:html|htm)$/i.test(language));
  const source = <pre className={`${website ? "max-h-96 overflow-auto" : "overflow-x-auto"} rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs font-mono text-zinc-200 whitespace-pre`} data-testid={testId}>
    <code>{code.replace(/\n+$/, "")}</code>
  </pre>;
  if (!website) return source;
  return <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-zinc-400">{complete ? "Generated HTML" : "Writing HTML…"}</span>
      <button type="button" disabled={!html || previewBlocked}
        title={previewBlocked ? "Preview unavailable for this project" : !html ? "Preview is available when the HTML is complete" : "Open isolated website preview"}
        onClick={() => setPreviewOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">
        <Eye className="h-3.5 w-3.5" />Preview
      </button>
    </div>
    <details>
      <summary className="cursor-pointer rounded-md py-1 text-xs font-medium text-violet-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">View Code</summary>
      <div className="pt-2">{source}</div>
    </details>
    <AgentHtmlPreview html={previewOpen && !previewBlocked ? html : null} onClose={() => setPreviewOpen(false)} />
  </div>;
}