import { useId, useState } from "react";
import { Check, Code2, Copy, Eye, Rocket } from "lucide-react";
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

export function AgentCodeBlock({ code, language, complete = true, previewBlocked = false, testId, onPublish }: {
  code: string; language: string; complete?: boolean; previewBlocked?: boolean; testId?: string; onPublish?: (html: string) => void;
}) {
  const sourceId = useId();
  const [codeOpen, setCodeOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const html = complete ? extractWebsiteHtml(code) : null;
  const website = (html !== null && /<!doctype|<(?:html|body|main|style|script|section|canvas)\b/i.test(html))
    || (!complete && /^(?:html|htm)$/i.test(language));
  const source = <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs font-mono text-zinc-200 whitespace-pre" data-testid={testId}>
    <code>{code.replace(/\n+$/, "")}</code>
  </pre>;
  const iconClass = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 disabled:opacity-40";
  const copyCode = async () => {
    setCopyStatus("copying");
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };
  return <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-zinc-400">{website ? complete ? "Generated HTML" : "Writing HTML…" : language || "Code"}</span>
      <div className="ml-auto flex items-center gap-1.5">
        {website && <button type="button" aria-label="Publish" title={previewBlocked ? "Publishing unavailable for this project" : !html || !onPublish ? "Publish is available when generation is complete" : "Publish this website"}
          disabled={!html || !onPublish || previewBlocked} onClick={() => { if (html) onPublish?.(html); }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-violet-600 px-2.5 text-xs text-zinc-100 hover:bg-violet-500 disabled:opacity-40">
          <Rocket className="h-3.5 w-3.5" aria-hidden="true" />Publish
        </button>}
        <button type="button" aria-label="Preview" disabled={!website || !html || previewBlocked}
          title={previewBlocked ? "Preview unavailable for this project" : !website ? "Preview is only available for HTML pages" : !html ? "Preview is available when the HTML is complete" : "Preview locally (not published)"}
          onClick={() => setPreviewOpen(true)} className={iconClass}>
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" aria-label={codeOpen ? "Hide Code" : "View Code"} title={codeOpen ? "Hide Code" : "View Code"}
          aria-expanded={codeOpen} aria-controls={sourceId} onClick={() => setCodeOpen(open => !open)} className={iconClass}>
          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" aria-label={copyStatus === "copied" ? "Copied code" : "Copy code"} title={copyStatus === "copied" ? "Copied" : "Copy code"}
          disabled={!code || copyStatus === "copying"} onClick={copyCode} className={iconClass}>
          {copyStatus === "copied" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      </div>
    </div>
    <div id={sourceId} hidden={!codeOpen}>{source}</div>
    {copyStatus === "copied" && <p role="status" className="text-xs text-zinc-400">Code copied.</p>}
    {copyStatus === "failed" && <p role="alert" className="text-xs text-amber-300">Could not copy code. Open Code and select it manually, or try again.</p>}
    <AgentHtmlPreview html={previewOpen && !previewBlocked ? html : null} onClose={() => setPreviewOpen(false)} />
  </div>;
}