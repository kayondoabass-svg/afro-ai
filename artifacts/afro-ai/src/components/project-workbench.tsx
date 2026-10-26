import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, ChevronDown, Download, FileUp, FlaskConical, RotateCcw, ShieldCheck, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type WorkbenchFile = { path: string; content: string; language: string; encoding?: string };
type Operation = { kind: "patch" | "rename" | "delete"; path: string; find?: string; replace?: string; to?: string; changes?: { path: string; kind: string }[] };
type Checkpoint = { id: string; createdAt: string; reason: string };
type WorkbenchReport = {
  id: string; createdAt: string; status: string;
  checks: { name: string; status: string; detail: string }[];
  fingerprint: string; source: string;
};
type Pending = { id: string; operations: Operation[]; expires: string | number };
type Workbench = {
  workspaceId: string;
  files: WorkbenchFile[];
  plan: { requirements: string; checks: string[]; revision: number };
  inputs: { id: string; name: string; text: string; status: string }[];
  checkpoints: Checkpoint[];
  reports: WorkbenchReport[];
  fingerprint: string;
  repairs: number;
  pending: Pending | null;
  execution: string;
  legacyWorkspaces: { conversationId: string; files: number }[];
  job?: { id: string; status: string; updatedAt: string; detail?: string };
};

const workbenchKey = (id: number) => ["project-workbench", id];
const filesKey = (id: number) => ["/api/d1/project-files", id];
const explainError = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  return body.error || body.message || `Request failed (${response.status})`;
};

function ContextPreview({ operation, files }: { operation: Operation; files: WorkbenchFile[] }) {
  if (operation.changes) return <div className="mt-2 max-h-40 overflow-auto text-xs">{operation.changes.map(change => <p key={change.path}>{change.kind}: <code>{change.path}</code></p>)}</div>;
  const file = files.find(item => item.path === operation.path);
  if (operation.kind === "rename") return <p className="mt-1 text-xs text-muted-foreground">Rename <code>{operation.path}</code> to <code>{operation.to || "—"}</code></p>;
  if (operation.kind === "delete") return <p className="mt-1 text-xs text-muted-foreground">Delete this file{file ? ` (${file.content.length.toLocaleString()} characters)` : ""}.</p>;
  if (!file || typeof operation.find !== "string") return <p className="mt-1 text-xs text-muted-foreground">Patch preview unavailable for this path.</p>;
  const index = file.content.indexOf(operation.find);
  const before = index >= 0 ? file.content.slice(Math.max(0, index - 90), index + operation.find.length + 90) : "(matching text not present in current file)";
  return (
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 min-w-0">
      <div><span className="text-[11px] text-muted-foreground">Before context</span><pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 font-mono text-[11px]">{before}</pre></div>
      <div><span className="text-[11px] text-muted-foreground">Replacement</span><pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 font-mono text-[11px]">{operation.replace || "(empty)"}</pre></div>
    </div>
  );
}

export function ProjectWorkbench({ conversationId, onRepair }: { conversationId: number; onRepair: (request: string) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const reportInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const [requirements, setRequirements] = useState<string | null>(null);
  const [checks, setChecks] = useState<string | null>(null);
  const [inputName, setInputName] = useState("");
  const [inputText, setInputText] = useState("");
  const [reason, setReason] = useState("");
  const [operations, setOperations] = useState<Operation[]>([]);
  const [confirmApply, setConfirmApply] = useState(false);

  const query = useQuery<Workbench>({
    queryKey: workbenchKey(conversationId),
    enabled: !!conversationId,
    queryFn: async () => {
      const response = await fetch(`/api/conversations/${conversationId}/workbench`, { credentials: "include" });
      if (!response.ok) throw new Error(await explainError(response));
      return response.json();
    },
  });
  const data = query.data;
  const invalidate = async (proposal = false) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: workbenchKey(conversationId) }),
      qc.invalidateQueries({ queryKey: ["project-workbench-evidence", conversationId] }),
      qc.invalidateQueries({ queryKey: filesKey(conversationId) }),
      ...(proposal ? [qc.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "project-proposal"] })] : []),
    ]);
  };
  const mutation = useMutation({
    mutationFn: async ({ endpoint, body }: { endpoint: string; body: unknown }) => {
      const response = await fetch(`/api/conversations/${conversationId}/workbench${endpoint}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        const message = await explainError(response);
        if (endpoint === "/legacy" && response.status === 409) {
          throw new Error(`Import proposal was not created because one or more destination paths collide. The original legacy workspace remains unchanged. ${message}`);
        }
        throw new Error(message);
      }
      return response.status === 204 ? null : response.json();
    },
    onSuccess: async (_result, variables) => {
      await invalidate(variables.endpoint === "/review" && (variables.body as { cancel?: boolean }).cancel === false);
    },
    onError: error => toast({ title: "Workbench action failed", description: error.message, variant: "destructive" }),
  });
  const run = (endpoint: string, body: unknown, success?: (result: any) => void, title?: string) =>
    mutation.mutate({ endpoint, body }, {
      onSuccess: result => { success?.(result); if (title) toast({ title }); },
    });
  const files = data?.files || [];
  const pending = mutation.isPending;
  const savePlan = () => data && run("/plan", {
    requirements: requirements ?? data.plan.requirements,
    checks: (checks ?? data.plan.checks.join("\n")).split("\n").map(line => line.trim()).filter(Boolean),
    revision: data.plan.revision,
  }, () => { setRequirements(null); setChecks(null); }, "Plan saved");
  const addOperation = (kind: Operation["kind"]) => setOperations(current => [...current, { kind, path: "", ...(kind === "patch" ? { find: "", replace: "" } : kind === "rename" ? { to: "" } : {}) }]);

  const downloadBundle = async () => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/workbench/bundle`, { credentials: "include" });
      if (!response.ok) throw new Error(await explainError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `afro-workspace-${conversationId}.zip`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Local runner bundle downloaded" });
    } catch (error) {
      toast({ title: "Could not download bundle", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };
  const downloadLegacy = async (legacyId: string) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/workbench/legacy/${encodeURIComponent(legacyId)}`, { credentials: "include" });
      if (!response.ok) throw new Error(await explainError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `legacy-workspace-${legacyId}.zip`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Original legacy ZIP downloaded" });
    } catch (error) {
      toast({ title: "Could not download original workspace", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };
  const importReport = async (file?: File) => {
    if (!file) return;
    try {
      const report = JSON.parse(await file.text());
      run("/report", { report }, () => { if (reportInput.current) reportInput.current.value = ""; }, "Customer-reported validation report imported");
    } catch {
      toast({ title: "Report file is not valid JSON", description: "Choose a local validation report in JSON format.", variant: "destructive" });
    }
  };
  const importText = async (file?: File) => {
    if (!file) return;
    if (file.size > 1_000_000) {
      toast({ title: "Text file is too large", description: "Choose a text file under 1 MB.", variant: "destructive" });
      return;
    }
    try {
      const text = await file.text();
      if (text.includes("\0")) throw new Error("Binary files are not supported.");
      setInputName(file.name);
      setInputText(text.slice(0, 100_000));
      if (text.length > 100_000) toast({ title: "Text shortened to fit", description: "Only the first 100,000 characters will be attached." });
    } catch (error) {
      toast({ title: "Could not read text file", description: error instanceof Error ? error.message : "Choose a supported text file.", variant: "destructive" });
    } finally {
      if (textInput.current) textInput.current.value = "";
    }
  };
  const review = (cancel: boolean) => {
    if (!data?.pending) return;
    run("/review", { id: data.pending.id, cancel }, () => setConfirmApply(false), cancel ? "Proposal cancelled" : "Reviewed changes applied");
  };

  return (
    <details className="rounded-lg border border-border bg-card/70 text-sm" data-testid="project-workbench">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-3 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0"><strong className="block truncate text-sm">Project workbench</strong><span className="block text-xs text-muted-foreground">Plan, review file edits, and validate locally</span></span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {data?.pending && <Badge variant="secondary">Review needed</Badge>}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </span>
      </summary>
      <div className="space-y-4 border-t px-3 py-3">
        {mutation.error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{mutation.error.message}</p>}
        {query.isPending && <div aria-label="Loading workbench" className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-20 w-full" /></div>}
        {query.isError && <div role="alert" className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-destructive">Could not load this project workbench. {query.error.message}</p>
          <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry</Button>
        </div>}
        {data && <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/35 p-2 text-xs">
            <span><strong>{data.files.length}</strong> workbench files <span className="text-muted-foreground">· revision {data.plan.revision}</span></span>
            <span className="font-mono text-muted-foreground">Fingerprint {data.fingerprint.slice(0, 12)}</span>
          </div>

          <section className="space-y-2" aria-label="Project plan">
            <h3 className="font-semibold">Project plan</h3>
            <Textarea aria-label="Requirements" value={requirements ?? data.plan.requirements} onChange={event => setRequirements(event.target.value)} placeholder="What should this project do?" className="min-h-20 text-xs" />
            <Textarea aria-label="Validation checks" value={checks ?? data.plan.checks.join("\n")} onChange={event => setChecks(event.target.value)} placeholder="One expected check per line" className="min-h-16 text-xs" />
            <Button size="sm" disabled={pending} onClick={savePlan}>Save plan</Button>
          </section>

          <section className="space-y-2 border-t pt-3" aria-label="Text inputs">
            <h3 className="font-semibold">Add reference text</h3>
            <Input value={inputName} onChange={event => setInputName(event.target.value)} placeholder="Source name" aria-label="Reference name" />
            <Textarea value={inputText} maxLength={100_000} onChange={event => setInputText(event.target.value)} placeholder="Paste supported text to attach to this workspace" aria-label="Reference text" className="min-h-20 text-xs" />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={pending || !inputName.trim() || !inputText.trim()} onClick={() => run("/input", { name: inputName.trim(), text: inputText }, () => { setInputName(""); setInputText(""); }, "Reference text attached")}>Attach text</Button>
              <input ref={textInput} className="hidden" type="file" accept=".txt,.md,.csv,.json,.html,.css,.js,.ts,.tsx,.jsx,text/*,application/json" aria-label="Choose text reference file" onChange={event => void importText(event.target.files?.[0])} />
              <Button size="sm" variant="outline" disabled={pending} onClick={() => textInput.current?.click()}><FileUp className="mr-1 h-3.5 w-3.5" />Import text file</Button>
              <span className="text-xs text-muted-foreground">{inputText.length.toLocaleString()} / 100,000 characters</span>
            </div>
            {data.inputs.length > 0 && <ul className="space-y-1 text-xs">{data.inputs.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-2 rounded bg-muted/30 px-2 py-1.5"><span className="break-all">{item.name}</span><Badge variant="outline">{item.status}</Badge></li>)}</ul>}
          </section>

          <section className="space-y-2 border-t pt-3" aria-label="Propose file operations">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Propose file changes</h3><div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => addOperation("patch")}>Add patch</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => addOperation("rename")}>Rename</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => addOperation("delete")}>Delete</Button>
            </div></div>
            {operations.length === 0 ? <p className="text-xs text-muted-foreground">Changes remain proposals until you review and apply them.</p> : <>
              {operations.map((operation, index) => <div key={index} className="space-y-2 rounded-md border p-2">
                <div className="flex items-center justify-between gap-2"><Badge variant="outline">{operation.kind}</Badge><Button size="sm" variant="ghost" disabled={pending} onClick={() => setOperations(current => current.filter((_, i) => i !== index))}>Remove</Button></div>
                <Input value={operation.path} onChange={event => setOperations(current => current.map((item, i) => i === index ? { ...item, path: event.target.value } : item))} placeholder="Relative file path" aria-label={`Operation ${index + 1} path`} />
                {operation.kind === "patch" && <>
                  <Textarea value={operation.find || ""} onChange={event => setOperations(current => current.map((item, i) => i === index ? { ...item, find: event.target.value } : item))} placeholder="Exact text to find" aria-label={`Operation ${index + 1} text to find`} className="min-h-16 font-mono text-xs" />
                  <Textarea value={operation.replace || ""} onChange={event => setOperations(current => current.map((item, i) => i === index ? { ...item, replace: event.target.value } : item))} placeholder="Replacement text" aria-label={`Operation ${index + 1} replacement`} className="min-h-16 font-mono text-xs" />
                </>}
                {operation.kind === "rename" && <Input value={operation.to || ""} onChange={event => setOperations(current => current.map((item, i) => i === index ? { ...item, to: event.target.value } : item))} placeholder="New relative path" aria-label={`Operation ${index + 1} new path`} />}
                <ContextPreview operation={operation} files={files} />
              </div>)}
              <Button size="sm" disabled={pending || operations.some(operation => !operation.path.trim() || (operation.kind === "patch" && !operation.find) || (operation.kind === "rename" && !operation.to?.trim()))}
                onClick={() => run("/operations", { operations }, () => setOperations([]), "Review proposal created")}>Create review proposal</Button>
            </>}
          </section>

          {data.pending && <section className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3" aria-label="Pending workbench review">
            <h3 className="font-semibold">Review before applying</h3>
            <p className="text-xs text-muted-foreground">Applying changes updates project files. A stale proposal is rejected; re-check the current files before proposing again. Expires {new Date(data.pending.expires).toLocaleString()}.</p>
            {data.pending.operations.map((operation, index) => <div key={`${operation.path}-${index}`} className="rounded border bg-background/60 p-2 text-xs"><strong>{operation.kind}: {operation.path}</strong><ContextPreview operation={operation} files={files} /></div>)}
            {!confirmApply ? <Button size="sm" disabled={pending} onClick={() => setConfirmApply(true)}>Review apply confirmation</Button> : <div className="space-y-2 rounded border border-amber-500/30 p-2">
              <p className="text-xs">Confirm that you reviewed each listed operation and want these changes applied to the customer-owned project.</p>
              <div className="flex flex-wrap gap-2"><Button size="sm" disabled={pending} onClick={() => review(false)}><Check className="mr-1 h-3.5 w-3.5" />Apply reviewed changes</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => review(true)}>Cancel proposal</Button></div>
            </div>}
          </section>}

          <section className="space-y-2 border-t pt-3" aria-label="Checkpoints">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Checkpoints</h3><Badge variant="outline">{data.checkpoints.length}/10</Badge></div>
            <p className="text-xs text-muted-foreground">Removing a checkpoint deletes that recovery copy, not your current source files.</p>
            <div className="flex gap-2"><Input value={reason} onChange={event => setReason(event.target.value)} placeholder="Checkpoint reason" aria-label="Checkpoint reason" /><Button size="sm" disabled={pending || !reason.trim()} onClick={() => run("/checkpoint", { reason: reason.trim() }, () => setReason(""), "Checkpoint created")}><Archive className="mr-1 h-3.5 w-3.5" />Save</Button></div>
            {data.checkpoints.map(checkpoint => <div key={checkpoint.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/30 px-2 py-1.5 text-xs">
              <span className="min-w-0"><strong className="block truncate">{checkpoint.reason}</strong><span className="text-muted-foreground">{new Date(checkpoint.createdAt).toLocaleString()}</span></span>
              <Button size="sm" variant="outline" disabled={pending || !!data.pending} title={data.pending ? "Resolve the current proposal first" : "Create a restore proposal"} onClick={() => run("/restore", { id: checkpoint.id }, undefined, "Restore proposal created")}><RotateCcw className="mr-1 h-3.5 w-3.5" />Propose restore</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => {
                if (window.confirm("Permanently remove this recovery checkpoint? Your current files will not change.")) run("/checkpoint-delete", { id: checkpoint.id, confirm: true }, undefined, "Recovery checkpoint removed");
              }}>Remove checkpoint</Button>
            </div>)}
            {data.legacyWorkspaces.length > 0 && <div className="space-y-2 border-t pt-2" aria-label="Legacy workspaces">
              <h4 className="text-xs font-semibold">Older saved workspaces</h4>
              {data.legacyWorkspaces.map(item => <div key={item.conversationId} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/30 p-2 text-xs">
                <span className="min-w-0"><strong>Conversation {item.conversationId}</strong><span className="ml-2 text-muted-foreground">{item.files} files</span></span>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => void downloadLegacy(item.conversationId)}>Download original ZIP</Button>
                  <Button size="sm" variant="outline" disabled={pending || !!data.pending} title={data.pending ? "Resolve the current proposal first" : "Create a reviewed import proposal"} onClick={() => run("/legacy", { conversationId: item.conversationId }, undefined, "Legacy import proposal created")}>Propose import</Button>
                </div>
              </div>)}
              <p className="text-xs text-muted-foreground">Import proposals are reviewed before applying. A path collision blocks the proposal; originals are kept unchanged.</p>
            </div>}
          </section>
          {data.job && <section className="rounded border p-2 text-xs" aria-label="Project review progress">
            <strong>Latest AI review: {data.job.status.replace(/-/g, " ")}</strong>
            <p className="text-muted-foreground">{data.job.detail || "AI review is separate from build, browser validation and publication."}</p>
          </section>}

          <section className="space-y-2 border-t pt-3" aria-label="Local validation">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Local validation</h3><Badge variant="outline">{data.execution}</Badge></div>
            <p className="text-xs text-muted-foreground">Static structural checks only. This does not run your application or attest runtime success. The downloaded runner executes only where you choose; it is not automatically sandboxed. Review its instructions before running it.</p>
            <div className="flex flex-wrap gap-2"><Button size="sm" disabled={pending} onClick={() => run("/validate", {}, undefined, "Static checks completed")}><FlaskConical className="mr-1 h-3.5 w-3.5" />Run structural checks</Button><Button size="sm" variant="outline" onClick={() => void downloadBundle()}><Download className="mr-1 h-3.5 w-3.5" />Download local runner</Button></div>
            {data.reports.map(report => <div key={report.id} className="space-y-1 rounded border p-2 text-xs">
              <div className="flex flex-wrap justify-between gap-2"><strong>{report.status}</strong><span className="text-muted-foreground">{new Date(report.createdAt).toLocaleString()} · {report.source}</span></div>
              {(report.source.toLowerCase().includes("customer") || report.source.toLowerCase().includes("local")) && <p className="text-amber-700 dark:text-amber-300">Customer-reported; not server-attested.</p>}
              {report.checks.map((check, index) => <p key={`${check.name}-${index}`}><span className="font-medium">{check.name}: {check.status}</span>{check.detail ? ` — ${check.detail}` : ""}</p>)}
              <p className="break-all font-mono text-muted-foreground">Fingerprint {report.fingerprint}</p>
              <Button size="sm" variant="outline" disabled={pending || data.repairs >= 3} title={data.repairs >= 3 ? "Maximum of three repair attempts reached" : "Create an AI repair request"} onClick={() => run("/repair", { reportId: report.id }, result => { if (result?.request) onRepair(result.request); }, "Repair request added to chat input")}><Wrench className="mr-1 h-3.5 w-3.5" />Request repair ({data.repairs}/3)</Button>
            </div>)}
            <div className="flex flex-wrap items-center gap-2">
              <input ref={reportInput} className="hidden" type="file" accept="application/json,.json" aria-label="Choose local validation report" onChange={event => void importReport(event.target.files?.[0])} />
              <Button size="sm" variant="outline" disabled={pending} onClick={() => reportInput.current?.click()}><FileUp className="mr-1 h-3.5 w-3.5" />Import local JSON report</Button>
              <span className="text-xs text-muted-foreground">Reports imported here are customer-reported.</span>
            </div>
          </section>
          {data.inputs.length === 0 && <p className="text-xs text-muted-foreground">Reference text is bounded and attached with a server-reported extraction status.</p>}
        </>}
      </div>
    </details>
  );
}
