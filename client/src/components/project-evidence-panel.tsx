import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, Check, Clock3, Expand, ImagePlus, LoaderCircle, LockKeyhole, RefreshCw, Trash2, WandSparkles } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Review = { id: string; createdAt: string; findings: unknown; status: "reviewed"; source: "ai-visual"; fingerprint: string };
type Evidence = {
  id: string; name: string; mimeType: string; createdAt: string; capturedAt?: string | null;
  pageLabel?: string | null; phase: "before" | "after"; width?: number | null; height?: number | null;
  fingerprint: string; stale: boolean; review?: Review | null;
};
type EvidenceEvent = { id: string; jobId?: string | null; createdAt: string; tool: string; callId: string; status: string; message?: string; paths?: string[] };
type PersistedJob = {
  id: string; status: "reserved" | "dispatched" | "settled" | "released" | "uncertain";
  reservedCents: number; usedTokens?: number | null; estimated?: boolean;
  calls: number; completed: number; createdAt: string; maxTokens: number;
};
type EvidenceResponse = {
  items: Evidence[]; events: EvidenceEvent[];
  jobs?: PersistedJob[];
  job?: { id: string; status: string; updatedAt: string; usage?: unknown; detail?: string } | null;
  budget: { maxTokens: number; maxRounds: number; paygChargeCents: number };
  limits: { fileBytes: number; maxItems: number };
};
type CurrentWorkbench = { fingerprint: string; repairs: number };

const evidenceKey = (id: number) => ["project-workbench-evidence", id];
const workbenchKey = (id: number) => ["project-workbench", id];
const explainError = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  return body.error || body.message || `Request failed (${response.status})`;
};

async function fileAsRawBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function showFindings(findings: unknown): string {
  if (typeof findings === "string") return findings;
  if (Array.isArray(findings)) return findings.map(item => typeof item === "string" ? item : JSON.stringify(item)).join("\n");
  if (findings && typeof findings === "object") return Object.entries(findings as Record<string, unknown>).map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join("\n");
  return "No written findings were returned.";
}

function shortCallLabel(callId: string): string {
  const safeId = callId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 8);
  return safeId ? `Call ${safeId}` : "Call";
}

function isJobActive(status: string): boolean {
  return ["queued", "pending", "running", "active", "in-progress", "dispatched"].some(value => status.toLowerCase().includes(value));
}

function runtimeJobOutcome(status: string): { label: string; tone: string } {
  const normalized = status.toLowerCase();
  if (["stopped", "interrupted", "cancelled", "canceled", "aborted"].some(value => normalized.includes(value))) {
    return { label: "Interrupted — no successful completion", tone: "text-amber-700 dark:text-amber-300" };
  }
  if (["failed", "error"].some(value => normalized.includes(value))) return { label: "Failed — not completed", tone: "text-destructive" };
  if (["completed", "succeeded", "success", "settled", "done"].some(value => normalized.includes(value))) {
    return { label: "Completed", tone: "text-primary" };
  }
  if (isJobActive(status)) return { label: status.replace(/[-_]/g, " "), tone: "text-foreground" };
  return { label: "Interrupted — completion not recorded", tone: "text-amber-700 dark:text-amber-300" };
}

function groupToolEvents(events: EvidenceEvent[], activeJob: boolean) {
  const chronological = [...events].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const groups = new Map<string, EvidenceEvent[]>();
  chronological.forEach((event, index) => {
    const key = `${event.jobId || "legacy"}:${event.callId || event.id || `event-${index}`}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  });
  return Array.from(groups.entries()).map(([callId, entries]) => {
    const lastStatus = entries[entries.length - 1].status.toLowerCase();
    const failed = ["failed", "error"].includes(lastStatus);
    const completed = ["completed", "complete", "success", "succeeded", "done"].includes(lastStatus);
    const interrupted = ["interrupted", "stopped", "cancelled", "canceled", "aborted", "released"].includes(lastStatus);
    return {
      callId,
      entries,
      tool: entries[0].tool,
      last: entries[entries.length - 1],
      outcome: failed ? "Failed" : completed ? "Completed" : interrupted ? "Interrupted" : activeJob ? "In progress" : "Interrupted",
      tone: failed || interrupted ? "text-destructive" : completed ? "text-primary" : activeJob ? "text-foreground" : "text-amber-700 dark:text-amber-300",
    };
  });
}

function reservationSummary(job: PersistedJob): { label: string; detail: string; tone: string } {
  const amount = `${job.reservedCents}¢`;
  switch (job.status) {
    case "reserved":
    case "dispatched":
      return { label: "Reservation held", detail: `${amount} held · not yet a settled customer charge`, tone: "text-amber-700 dark:text-amber-300" };
    case "settled":
      return { label: "Customer charge settled", detail: `${amount} charged for this generation`, tone: "text-primary" };
    case "released":
      return { label: "Reservation released", detail: `${amount} released · no customer charge`, tone: "text-muted-foreground" };
    case "uncertain":
      return { label: "Charge outcome uncertain", detail: `${amount} reservation needs reconciliation. Do not retry this generation.`, tone: "text-destructive" };
  }
}

export function ProjectEvidencePanel({ conversationId, onRepair, maxJobTokens, onMaxJobTokensChange }: {
  conversationId: number;
  onRepair: (request: string) => void;
  maxJobTokens: number;
  onMaxJobTokensChange: (value: number) => void;
}) {
  const qc = useQueryClient();
  const { language } = useLanguage();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"before" | "after">("after");
  const [pageLabel, setPageLabel] = useState("");
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [selected, setSelected] = useState<Evidence | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Evidence | null>(null);
  const [repairTarget, setRepairTarget] = useState<Evidence | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Evidence | null>(null);
  const [actionError, setActionError] = useState("");
  const [uploadError, setUploadError] = useState("");

  const workbench = useQuery<CurrentWorkbench>({
    queryKey: workbenchKey(conversationId),
    enabled: !!conversationId,
    queryFn: async () => {
      const response = await fetch(`/api/conversations/${conversationId}/workbench`, { credentials: "include" });
      if (!response.ok) throw new Error(await explainError(response));
      return response.json();
    },
  });
  const evidenceQuery = useQuery<EvidenceResponse>({
    queryKey: evidenceKey(conversationId),
    enabled: !!conversationId,
    queryFn: async () => {
      const response = await fetch(`/api/conversations/${conversationId}/workbench/evidence`, { credentials: "include" });
      if (!response.ok) throw new Error(await explainError(response));
      return response.json();
    },
    refetchInterval: query => {
      const jobStatus = query.state.data?.job?.status?.toLowerCase() || "";
      return ["queued", "pending", "running", "active", "in-progress"].some(status => jobStatus.includes(status)) ? 2500 : false;
    },
  });
  const data = evidenceQuery.data;
  const currentFingerprint = workbench.data?.fingerprint;
  const isStale = (item: Evidence) => !currentFingerprint || item.stale || item.fingerprint !== currentFingerprint;
  const hasSourceChanged = (item: Evidence) => !!currentFingerprint && (item.stale || item.fingerprint !== currentFingerprint);
  const remainingRepairs = Math.max(0, 3 - (workbench.data?.repairs ?? 0));
  const refreshAll = () => Promise.all([
    qc.invalidateQueries({ queryKey: evidenceKey(conversationId) }),
    qc.invalidateQueries({ queryKey: workbenchKey(conversationId) }),
  ]);
  const mutation = useMutation({
    mutationFn: async ({ url, method, body }: { url: string; method: "POST" | "DELETE"; body: unknown }) => {
      const response = await fetch(url, {
        method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await explainError(response));
      return response.status === 204 ? null : response.json();
    },
    onSuccess: async () => { setActionError(""); await refreshAll(); },
    onError: error => setActionError(error instanceof Error ? error.message : "This action could not be completed. Please try again."),
  });
  const busy = mutation.isPending;
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const toolHistory = useMemo(() => groupToolEvents(data?.events ?? [], !!data?.job && isJobActive(data.job.status)), [data?.events, data?.job?.status]);
  const billingHistory = useMemo(() => [...(data?.jobs ?? [])].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()), [data?.jobs]);

  const upload = async (file?: File) => {
    if (!file) return;
    setUploadError("");
    const reject = (message: string) => {
      setUploadError(message);
      if (uploadRef.current) uploadRef.current.value = "";
    };
    if (!privacyConfirmed) { reject("Confirm that this image is safe to share before uploading."); return; }
    if (file.type !== "image/png" && file.type !== "image/jpeg") { reject("Choose a PNG or JPEG image."); return; }
    if (file.size > (data?.limits.fileBytes ?? 524288)) { reject("This image is larger than the 512 KB limit."); return; }
    if (items.length >= (data?.limits.maxItems ?? 8)) { reject("The evidence gallery is full. Remove an image before adding another."); return; }
    if (!currentFingerprint) { reject("Current project version is not available yet. Retry before uploading."); return; }
    try {
      const base64 = await fileAsRawBase64(file);
      const response = await fetch(`/api/conversations/${conversationId}/workbench/evidence`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name, mimeType: file.type, base64, fingerprint: currentFingerprint, phase,
          pageLabel: pageLabel.trim() || null, capturedAt: new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error(await explainError(response));
      setPrivacyConfirmed(false);
      setPageLabel("");
      if (uploadRef.current) uploadRef.current.value = "";
      await refreshAll();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The image could not be uploaded.");
    } finally {
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };

  const confirmReview = () => {
    if (!reviewTarget || isStale(reviewTarget)) return;
    const item = reviewTarget;
    setReviewTarget(null);
    mutation.mutate({
      url: `/api/conversations/${conversationId}/workbench/evidence/${encodeURIComponent(item.id)}/review`,
      method: "POST", body: { confirm: true, language },
    });
  };
  const confirmRepair = () => {
    if (!repairTarget || isStale(repairTarget) || !repairTarget.review || remainingRepairs <= 0) return;
    const item = repairTarget;
    setRepairTarget(null);
    mutation.mutate({
      url: `/api/conversations/${conversationId}/workbench/evidence/${encodeURIComponent(item.id)}/repair`,
      method: "POST", body: { confirm: true },
    }, {
      onSuccess: (result: { request?: string }) => {
        void refreshAll();
        if (typeof result?.request === "string" && result.request.trim()) onRepair(result.request);
      },
      onError: error => setActionError(error instanceof Error ? error.message : "Repair request could not be prepared."),
    });
  };
  const confirmDelete = () => {
    if (!deleteTarget) return;
    const item = deleteTarget;
    setDeleteTarget(null);
    mutation.mutate({
      url: `/api/conversations/${conversationId}/workbench/evidence/${encodeURIComponent(item.id)}`,
      method: "DELETE", body: { confirm: true },
    });
  };

  return (
    <section aria-label="Project visual evidence" className="my-4 rounded-xl border border-border bg-card/90 text-card-foreground shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="mt-0.5 rounded-lg border border-primary/20 bg-primary/10 p-2 text-primary"><Camera className="h-4 w-4" /></span>
          <div>
            <h2 className="font-semibold tracking-tight">Visual evidence</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">Keep private Before / After captures with this chat. Images are stored in your account and are never public links.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" /><span>Private to this project</span>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(250px,.8fr)]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">Capture phase
              <select aria-label="Capture phase" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={phase} onChange={event => setPhase(event.target.value as "before" | "after")}>
                <option value="before">Before</option><option value="after">After</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">Page or view
              <Input value={pageLabel} onChange={event => setPageLabel(event.target.value)} maxLength={80} placeholder="e.g. Mobile checkout" aria-label="Page or view label" className="h-9 text-sm" />
            </label>
          </div>
          <div className="rounded-lg border border-dashed border-border bg-muted/25 p-3">
            <input ref={uploadRef} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Choose visual evidence image" onChange={event => void upload(event.target.files?.[0])} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <ImagePlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-xs leading-relaxed text-muted-foreground">PNG or JPEG · up to {Math.round((data?.limits.fileBytes ?? 524288) / 1024)} KB · {items.length}/{data?.limits.maxItems ?? 8} captures</p>
              </div>
              <Button size="sm" variant="outline" disabled={busy || !currentFingerprint || items.length >= (data?.limits.maxItems ?? 8)} onClick={() => uploadRef.current?.click()}>
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />Choose image
              </Button>
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <input type="checkbox" checked={privacyConfirmed} onChange={event => setPrivacyConfirmed(event.target.checked)} className="mt-0.5 accent-primary" />
              <span>I have permission to share this image and have removed sensitive personal or account information.</span>
            </label>
            {uploadError && <p role="alert" className="mt-2 text-xs text-destructive">{uploadError}</p>}
            {!currentFingerprint && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Current source version is loading. Image upload will be available when it is ready.</p>}
          </div>

          {workbench.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
            <span className="text-destructive">Current source version could not be checked. Review and repair actions are paused. {workbench.error.message}</span>
            <Button size="sm" variant="outline" disabled={workbench.isFetching} onClick={() => void workbench.refetch()}>Retry source check</Button>
          </div>}
          {evidenceQuery.isPending && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Loading visual evidence"><Skeleton className="aspect-[4/3]" /><Skeleton className="aspect-[4/3]" /></div>}
          {evidenceQuery.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <span className="text-destructive">Visual evidence could not load. {evidenceQuery.error.message}</span>
            <Button size="sm" variant="outline" onClick={() => void evidenceQuery.refetch()} disabled={evidenceQuery.isFetching}><RefreshCw className="mr-1 h-3 w-3" />Retry</Button>
          </div>}
          {data && items.length === 0 && <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-6 text-center">
            <ImagePlus className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No captures in this chat yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Add a local screenshot to create a lasting visual record.</p>
          </div>}
          {items.length > 0 && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {items.map(item => {
              const stale = isStale(item);
              return <article key={item.id} className="min-w-0 overflow-hidden rounded-lg border border-border bg-background">
                <button type="button" onClick={() => setSelected(item)} className="group relative block aspect-[4/3] w-full overflow-hidden bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`Enlarge ${item.phase === "before" ? "Before" : "After"} image ${item.name}`}>
                  <img src={`/api/conversations/${conversationId}/workbench/evidence/${encodeURIComponent(item.id)}/image`} alt={`${item.phase === "before" ? "Before" : "After"} capture${item.pageLabel ? ` — ${item.pageLabel}` : ""}`} loading="lazy" className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]" />
                  <span className={`absolute left-2 top-2 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${item.phase === "before" ? "bg-slate-900/85 text-white" : "bg-primary text-primary-foreground"}`}>{item.phase === "before" ? "Before" : "After"}</span>
                  {hasSourceChanged(item) && <span className="absolute right-2 top-2 rounded bg-amber-500 px-2 py-1 text-[10px] font-semibold text-amber-950">Source changed</span>}
                  <span className="absolute bottom-2 right-2 rounded-full bg-background/90 p-1.5 text-foreground"><Expand className="h-3.5 w-3.5" /></span>
                </button>
                <div className="space-y-2 p-3">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium" title={item.name}>{item.pageLabel || item.name}</p>
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="h-3 w-3" />{new Date(item.capturedAt || item.createdAt).toLocaleString()}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{item.width && item.height ? `${item.width} × ${item.height}` : ""}</span>
                  </div>
                  {stale && <p className="flex gap-1.5 rounded bg-amber-500/10 p-2 text-[10px] leading-relaxed text-amber-800 dark:text-amber-200"><AlertTriangle className="h-3 w-3 shrink-0" />Approved changes make this capture historical. Recapture locally and upload a fresh image before review or repair.</p>}
                  {item.review && <div className="rounded border border-border/70 bg-muted/30 p-2">
                    <p className="flex items-center gap-1 text-[10px] font-semibold"><Check className="h-3 w-3 text-primary" />Reviewed · {new Date(item.review.createdAt).toLocaleString()}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-muted-foreground">{showFindings(item.review.findings)}</p>
                    <p className="mt-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">Visual observations are not a test pass.</p>
                  </div>}
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={busy || stale} onClick={() => setReviewTarget(item)} title={stale ? "Upload a fresh capture of the current source first" : undefined}><WandSparkles className="mr-1 h-3 w-3" />Review · {data?.budget.paygChargeCents ?? 2}¢</Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={busy || stale || !item.review || remainingRepairs === 0} onClick={() => setRepairTarget(item)} title={stale ? "Upload a fresh capture of the current source first" : !item.review ? "Review this image before requesting a repair" : remainingRepairs === 0 ? "Three repair requests have already been used" : undefined}>Request repair · {remainingRepairs}/3</Button>
                    <Button size="icon" variant="ghost" className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`Remove ${item.name}`} disabled={busy} onClick={() => setDeleteTarget(item)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </article>;
            })}
          </div>}
        </div>

        <aside className="min-w-0 space-y-3">
          <section className="rounded-lg border border-border bg-muted/20 p-3" aria-label="Run history and progress">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Run history &amp; progress</h3>
              <Button size="icon" variant="ghost" aria-label="Refresh evidence and run history" className="h-7 w-7" disabled={evidenceQuery.isFetching} onClick={() => void evidenceQuery.refetch()}><RefreshCw className={`h-3.5 w-3.5 ${evidenceQuery.isFetching ? "animate-spin" : ""}`} /></Button>
            </div>
            {data?.job && <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-2.5">
              <p className={`flex items-center gap-2 text-xs font-medium ${runtimeJobOutcome(data.job.status).tone}`}>{isJobActive(data.job.status) && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}{runtimeJobOutcome(data.job.status).label}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Updated {new Date(data.job.updatedAt).toLocaleString()}</p>
              {data.job.detail && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{data.job.detail}</p>}
            </div>}
            {toolHistory.length > 0 && <ol className="mt-3 space-y-2" aria-label="Chronological tool calls">
              {toolHistory.map(group => <li key={group.callId} className="border-l-2 border-primary/30 pl-2.5">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-2 text-[10px] [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{group.tool.replace(/[_-]/g, " ")}</span>
                      <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground">{shortCallLabel(group.entries[0].callId || group.callId)}</span>
                    </span>
                    <span className={`shrink-0 font-semibold ${group.tone}`}>{group.outcome}</span>
                  </summary>
                  <div className="mt-2 space-y-2 border-l border-border pl-2.5">
                    {group.entries.map(event => <div key={event.id} className="text-[10px]">
                      <div className="flex flex-wrap justify-between gap-x-2"><span className="font-medium">{event.status.replace(/[_-]/g, " ")}</span><time className="text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</time></div>
                      {event.message && <p className="mt-1 break-words leading-relaxed text-muted-foreground">{event.message}</p>}
                      {event.paths?.length ? <p className="mt-1 break-all font-mono text-[9px] text-muted-foreground">{event.paths.join(", ")}</p> : null}
                    </div>)}
                  </div>
                </details>
                <time className="mt-1 block text-[9px] text-muted-foreground">{new Date(group.last.createdAt).toLocaleString()}</time>
              </li>)}
            </ol>}
            {billingHistory.length > 0 && <section className="mt-3 border-t border-border pt-3" aria-label="Persisted generation and billing history">
              <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Persisted generation &amp; billing history</h4>
              <ol className="mt-2 space-y-2">
                {billingHistory.map(job => {
                  const summary = reservationSummary(job);
                  return <li key={job.id} className="rounded-md border border-border bg-background/70 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-[10px] font-semibold ${summary.tone}`}>{summary.label}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{summary.detail}</p>
                      </div>
                      <span className="shrink-0 font-mono text-[9px] text-muted-foreground">Run {job.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 8) || "ID"}</span>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">{job.estimated ? "Estimated provider usage" : "Provider usage"} · {job.usedTokens ?? "Not reported"} tokens <span className="text-foreground/70">(separate from customer charge)</span></p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{job.completed}/{job.calls} tool calls completed · token ceiling {job.maxTokens.toLocaleString()}</p>
                    <time className="mt-1 block text-[9px] text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</time>
                  </li>;
                })}
              </ol>
            </section>}
            {!toolHistory.length && !billingHistory.length && !data?.job && <p className="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Persisted run events and billing history will appear here as work progresses.</p>}
            <div className="mt-3 border-t border-border pt-3">
              <label htmlFor={`max-job-tokens-${conversationId}`} className="flex items-center justify-between gap-2 text-xs font-medium"><span>Token limit</span><span className="font-mono text-muted-foreground">10k–{(data?.budget.maxTokens ?? 50000).toLocaleString()}</span></label>
              <Input id={`max-job-tokens-${conversationId}`} type="number" min={10000} max={Math.min(50000, data?.budget.maxTokens ?? 50000)} step={1000} value={maxJobTokens} onChange={event => onMaxJobTokensChange(Math.min(50000, Math.max(10000, Number(event.target.value) || 10000)))} className="mt-1 h-8 font-mono text-xs" />
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Maximum 5 rounds per job. No operation starts automatically.</p>
            </div>
          </section>
          <section className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Review before spending</p>
            <p className="mt-1">A visual review sends this image for analysis. Customer PAYG is a flat {data?.budget.paygChargeCents ?? 2}¢ per generation—not per file, tool call, or model round. Simple file reads are not charged. Provider usage estimates are separate, not the customer charge. Uploading alone never starts a review.</p>
            <p className="mt-2">Nothing is hosted or executed here. After approved source changes, recapture the page locally and upload a fresh After image.</p>
          </section>
          {actionError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">{actionError}</div>}
        </aside>
      </div>

      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-5xl overflow-auto p-3 sm:p-5">
          {selected && <>
            <DialogHeader className="pr-8 text-left"><DialogTitle className="truncate">{selected.phase === "before" ? "Before" : "After"} · {selected.pageLabel || selected.name}</DialogTitle><DialogDescription>{selected.width && selected.height ? `${selected.width} × ${selected.height} · ` : ""}{new Date(selected.capturedAt || selected.createdAt).toLocaleString()}</DialogDescription></DialogHeader>
            <img src={`/api/conversations/${conversationId}/workbench/evidence/${encodeURIComponent(selected.id)}/image`} alt={`${selected.phase === "before" ? "Before" : "After"} capture ${selected.pageLabel || selected.name}`} className="max-h-[72dvh] w-full rounded-md bg-muted object-contain" />
          </>}
        </DialogContent>
      </Dialog>
      <Dialog open={!!reviewTarget} onOpenChange={open => { if (!open) setReviewTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm visual review</DialogTitle><DialogDescription>This sends the selected private image for visual analysis and authorizes one generation at the flat {data?.budget.paygChargeCents ?? 2}¢ PAYG rate. The customer charge is not based on tool calls or provider usage. This is not a test run or a pass/fail result. There are no automatic retries.</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReviewTarget(null)}>Cancel</Button><Button disabled={busy} onClick={confirmReview}>{busy ? "Starting…" : "Confirm paid review"}</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!repairTarget} onOpenChange={open => { if (!open) setRepairTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add a repair request to this chat?</DialogTitle><DialogDescription>A repair request uses reviewed, current evidence and will be placed in the chat input for you to inspect. It will not generate or change files until you choose to send it. {remainingRepairs} of 3 requests remain.</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRepairTarget(null)}>Cancel</Button><Button disabled={busy || remainingRepairs <= 0} onClick={confirmRepair}>Add request to chat</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove this capture?</DialogTitle><DialogDescription>This permanently removes the private evidence image and its saved review. Project files will not change.</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep capture</Button><Button variant="destructive" disabled={busy} onClick={confirmDelete}>Remove capture</Button></div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
