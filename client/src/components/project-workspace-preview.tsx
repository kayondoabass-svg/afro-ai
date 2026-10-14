import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Image as ImageIcon, Monitor, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export type WorkspacePreviewTarget =
  | { kind: "website" }
  | { kind: "file"; path: string; content?: string; encoding?: string }
  | { kind: "evidence"; id: string; label: string }
  | { kind: "proposal"; id: string; label: string }
  | null;

type PreviewData = {
  project: { id: number; name: string; type: string };
  hasContent: boolean;
  htmlContent: string;
  label: string | null;
  updatedAt: string | null;
  publishedUrl: string | null;
};

export function ProjectWorkspacePreview({
  conversationId, projectId, projectType, blocked = false, target, onTargetChange,
}: {
  conversationId: number | null;
  projectId: number | null;
  projectType?: string;
  blocked?: boolean;
  target: WorkspacePreviewTarget;
  onTargetChange: (target: WorkspacePreviewTarget) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [target?.kind, target && "id" in target ? target.id : ""]);
  const website = useQuery<PreviewData>({
    queryKey: ["/api/projects", projectId, "preview"],
    enabled: !!projectId && target?.kind === "website" && projectType !== "fullstack" && !blocked,
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/preview`, { credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || body.message || `Preview request failed (${response.status})`);
      }
      return response.json();
    },
  });

  const imageSrc = target?.kind === "evidence" && conversationId
    ? `/api/conversations/${conversationId}/workbench/evidence/${encodeURIComponent(target.id)}/image`
    : target?.kind === "proposal" && conversationId
      ? `/api/conversations/${conversationId}/workbench/proposals/${encodeURIComponent(target.id)}/image`
      : null;
  const title = target?.kind === "website" ? website.data?.project.name || "Website preview"
    : target?.kind === "file" ? target.path
    : target?.kind === "evidence" || target?.kind === "proposal" ? target.label : "Project preview";

  return <aside className="workspace-preview min-h-0 min-w-0 w-full flex flex-1 flex-col border-l border-zinc-800 bg-[#171923]" aria-label="Project preview pane" data-testid="workspace-preview">
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-3">
      <div className="flex min-w-0 items-center gap-2">
        <Monitor className="h-4 w-4 shrink-0 text-amber-300" />
        <div className="min-w-0">
          <h2 className="truncate text-xs font-semibold text-zinc-100">{title}</h2>
          <p className="text-[10px] text-zinc-500">{target?.kind === "website" ? "Saved project preview" : target?.kind === "file" ? "Current project file · not a historical revision" : target?.kind === "evidence" ? "Private screenshot evidence" : target?.kind === "proposal" ? "Saved design proposal" : "Select an item from the conversation"}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="icon" variant="ghost" aria-label="Show website preview" title="Website" disabled={!projectId || projectType === "fullstack" || blocked} className="h-8 w-8 text-zinc-400" onClick={() => onTargetChange({ kind: "website" })}><Monitor className="h-4 w-4" /></Button>
        {target?.kind === "website" && <Button size="icon" variant="ghost" aria-label="Refresh website preview" title="Refresh preview" className="h-8 w-8 text-zinc-400" onClick={() => void website.refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>}
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-auto bg-[#20212a] p-3">
      {target?.kind === "website" && projectType === "fullstack" && <div role="status" className="mx-auto mt-12 max-w-sm rounded-xl border border-amber-700/40 bg-amber-950/20 p-5 text-center">
        <AlertTriangle className="mx-auto h-5 w-5 text-amber-300" /><h3 className="mt-3 text-sm font-semibold text-zinc-100">Preview unavailable</h3>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">This source-only full-stack project has no runtime preview. Its source files remain available for review and export.</p>
      </div>}
      {target?.kind === "website" && blocked && projectType !== "fullstack" && <div role="status" className="mx-auto mt-12 max-w-sm rounded-xl border border-amber-700/40 bg-amber-950/20 p-5 text-center"><AlertTriangle className="mx-auto h-5 w-5 text-amber-300" /><h3 className="mt-3 text-sm font-semibold text-zinc-100">Preview paused</h3><p className="mt-2 text-xs leading-relaxed text-zinc-400">Project metadata or setup must be verified before its website preview can be loaded.</p></div>}
      {target?.kind === "website" && projectType !== "fullstack" && !projectId && <PreviewEmpty text="Open a website project to preview its saved version." />}
      {target?.kind === "website" && projectType !== "fullstack" && !blocked && projectId && website.isPending && <div role="status" aria-label="Loading website preview" className="mx-auto mt-8 max-w-xl space-y-3"><div className="h-56 animate-pulse rounded-lg bg-zinc-800" /><div className="h-4 w-2/3 animate-pulse rounded bg-zinc-800" /><div className="h-4 w-1/2 animate-pulse rounded bg-zinc-800" /></div>}
      {target?.kind === "website" && !blocked && website.isError && <div role="alert" className="mx-auto mt-8 max-w-sm rounded-xl border border-rose-900/50 bg-rose-950/20 p-4 text-sm text-rose-200"><p>Website preview could not load. {website.error.message}</p><Button variant="outline" size="sm" className="mt-3 border-rose-900" onClick={() => void website.refetch()}>Retry preview</Button></div>}
      {target?.kind === "website" && projectType !== "fullstack" && !blocked && website.data && (website.data.hasContent
        ? <div className="mx-auto h-full min-h-[420px] max-w-5xl overflow-hidden rounded-lg border border-zinc-700 bg-white shadow-xl">
          <iframe title={`Saved website preview${website.data.project.name ? `: ${website.data.project.name}` : ""}`} srcDoc={website.data.htmlContent} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" className="h-full min-h-[420px] w-full border-0" />
        </div>
        : <PreviewEmpty text="No saved website content yet. Build a page in this conversation and it will appear here." />)}
      {imageSrc && !imageFailed && <div className="flex min-h-full items-start justify-center">
        <img src={imageSrc} alt={title || "Private project image"} className="max-h-full max-w-full rounded-md border border-zinc-700 bg-zinc-950 object-contain shadow-lg" onError={() => setImageFailed(true)} />
      </div>}
      {imageSrc && imageFailed && <div role="alert" className="mx-auto mt-12 max-w-sm rounded-xl border border-amber-800/50 bg-amber-950/20 p-5 text-center text-sm text-amber-100"><AlertTriangle className="mx-auto h-5 w-5" /><p className="mt-3 font-medium">This saved image is unavailable</p><p className="mt-1 text-xs leading-relaxed text-zinc-400">The private image could not be retrieved for this conversation.</p></div>}
      {target?.kind === "file" && (target.encoding === "base64"
        ? <PreviewEmpty text="Binary project files cannot be read as text here. Use the project file download instead." />
        : target.content === undefined
          ? <PreviewEmpty text="This file's text could not be loaded. Reopen it from the project files panel." />
          : <pre className="max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-700 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200">{target.content}</pre>)}
      {!target && <PreviewEmpty text="Open a saved screenshot, design proposal, or website preview from the conversation feed." />}
      {target?.kind === "evidence" && !conversationId && <PreviewEmpty text="This evidence is not available without its saved conversation." />}
      {target?.kind === "proposal" && !conversationId && <PreviewEmpty text="This proposal is not available without its saved conversation." />}
      {target?.kind === "evidence" && !imageSrc && <PreviewEmpty text="No owned screenshot image is available for this activity." />}
    </div>
    {target?.kind !== "website" && target && <footer className="flex shrink-0 items-center justify-between border-t border-zinc-800 px-3 py-2 text-[10px] text-zinc-500"><span className="truncate">{target.kind === "file" ? target.path : target.label}</span><span className="inline-flex shrink-0 items-center gap-1"><ArrowUpRight className="h-3 w-3" />Conversation-owned</span></footer>}
  </aside>;
}

function PreviewEmpty({ text }: { text: string }) {
  return <div className="mx-auto mt-12 max-w-sm rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-6 text-center">
    <ImageIcon className="mx-auto h-5 w-5 text-zinc-500" />
    <p className="mt-3 text-xs leading-relaxed text-zinc-400">{text}</p>
  </div>;
}
