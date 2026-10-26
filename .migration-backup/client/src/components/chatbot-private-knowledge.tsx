import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FolderLock, Loader2, Save, Trash2, Download } from "lucide-react";

type FileInfo = { path: string; version: number; bytes: number; updated_at: string };
type File = FileInfo & { content: string };
export function ChatbotPrivateKnowledge({ widgetId, draft, onDraftChange }: {
  widgetId: number; draft: string; onDraftChange: (text: string) => void;
}) {
  const { toast } = useToast();
  const base = `/api/chatbots/${widgetId}/knowledge-files`;
  const folder = useQuery<{ folder: string; backend: string; files: FileInfo[] }>({
    queryKey: [base], retry: false,
  });
  const [version, setVersion] = useState<number | null | undefined>();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (folder.data && version === undefined) setVersion(folder.data.files.find(f => f.path === "knowledge.md")?.version ?? null);
  }, [folder.data, version]);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [base] });
    queryClient.invalidateQueries({ queryKey: ["/api/chatbots"] });
  };
  const report = (error: unknown) => toast({
    title: "Knowledge operation failed", variant: "destructive",
    description: error instanceof Error ? error.message : "Please retry.",
  });
  const save = async (publish: boolean) => {
    const path = publish ? "knowledge.md" : file?.path;
    if (!path) return;
    setBusy(true);
    try {
      const r = await apiRequest("PUT", `${base}/${path}`, {
        content: publish ? draft : text, version: publish ? version : file?.version, publish,
      });
      const saved: File = await r.json();
      if (publish) setVersion(saved.version);
      if (file?.path === saved.path) { setFile(saved); setText(saved.content); }
      refresh();
      toast({
        title: publish ? "Knowledge saved and applied" : "File saved privately",
        description: publish ? "Saved in your private D1 folder and applied to this chatbot." : "This edit does not change visitor answers until you add it to the knowledge draft and apply it.",
      });
    } catch (e) { report(e); }
    finally { setBusy(false); }
  };
  const open = async (path: string) => {
    if (file && text !== file.content && !window.confirm("Discard unsaved changes in this source file?")) return;
    setBusy(true);
    try {
      const r = await apiRequest("GET", `${base}/${path}`);
      const selected: File = await r.json();
      setFile(selected); setText(selected.content);
    } catch (e) { report(e); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!file || !window.confirm("Delete this saved source file? Approved chatbot knowledge will remain unchanged.")) return;
    setBusy(true);
    try {
      await apiRequest("DELETE", `${base}/${file.path}?version=${file.version}`);
      setFile(null); setText(""); refresh();
    } catch (e) { report(e); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4" data-testid="private-knowledge-folder">
    <Button onClick={() => save(true)} disabled={busy || version === undefined || !!folder.error} className="w-full">
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
      Save Knowledge Base
    </Button>
    <section className="rounded-xl border p-4 space-y-3">
      <h3 className="font-semibold flex items-center gap-2"><FolderLock className="w-4 h-4" />Private knowledge folder</h3>
      <p className="text-xs text-muted-foreground">D1-backed · Only your account can browse, edit or download these files. Visitors can receive approved answers, not access this folder.</p>
      {folder.isLoading && <p className="text-sm">Loading your folder…</p>}
      {folder.error && <div role="alert" className="space-y-2">
        <p className="text-sm text-destructive">{folder.error instanceof Error ? folder.error.message : "Private storage unavailable"}</p>
        <Button variant="outline" size="sm" onClick={() => folder.refetch()}>Retry folder connection</Button>
      </div>}
      {folder.data && <>
        <p className="font-mono text-xs break-all">{folder.data.folder}</p>
        {!folder.data.files.length && <p className="text-sm text-muted-foreground">Save your knowledge draft or run Auto-Scan to create files in this folder.</p>}
        <div className="flex flex-wrap gap-2">
          {folder.data.files.map(f => <Button key={f.path} variant={file?.path === f.path ? "secondary" : "outline"} size="sm" disabled={busy} onClick={() => open(f.path)}>
            {f.path === "knowledge.md" ? f.path : `Website scan · ${f.path.slice(5, 13)}`}
          </Button>)}
        </div>
      </>}
      {file && <div className="space-y-2">
        <p className="text-xs font-mono break-all">{file.path} · version {file.version}</p>
        <Textarea aria-label="Saved knowledge file editor" value={text} onChange={e => setText(e.target.value)} className="min-h-[200px] font-mono text-xs" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || text === file.content} onClick={() => save(false)}>Save privately</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => {
            onDraftChange(file.path === "knowledge.md" ? text : [draft, text].filter(Boolean).join("\n\n"));
            if (file.path === "knowledge.md") setVersion(file.version);
            toast({ title: "Added to knowledge draft", description: "Review the draft, then Save Knowledge Base to apply it to visitor answers." });
          }}>Use in knowledge draft</Button>
          <Button size="sm" variant="outline" asChild><a href={`${base}/${file.path}?download=1`}><Download className="mr-1 w-3 h-3" />Download</a></Button>
          {file.path !== "knowledge.md" && <Button size="sm" variant="outline" disabled={busy} onClick={remove}><Trash2 className="mr-1 w-3 h-3" />Delete source</Button>}
        </div>
      </div>}
    </section>
  </div>;
}
