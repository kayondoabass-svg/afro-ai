import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, Check, ChevronDown, CircleHelp, Download, LoaderCircle, LockKeyhole, RefreshCw, Smartphone, Monitor, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CaptureRun = {
  id: string;
  fingerprint: string;
  phase: "before" | "after";
  status: "capturing" | "captured" | "failed" | "uncertain";
  createdAt: string;
  updatedAt: string;
  evidenceIds: string[];
  reason?: string;
  parentRunId?: string | null;
  target?: { workspace: string; profile: string; profileVersion: number } | null;
  repairDepth?: number;
  reviewAttempt?: { status: "reviewing" | "uncertain" | "failed" | "reviewed" };
  review?: { findings: string; createdAt: string; fingerprint: string; status: "reviewed"; inspection?: unknown };
  repair?: { request: string; preparedAt: string; status: "awaiting-reviewed-save" };
};
type Capability = { enabled: boolean; reason?: string };
type Evidence = { id: string; name: string; phase: "before" | "after"; profile?: "desktop" | "mobile"; fingerprint: string; createdAt: string };
type VisualAuditResponse = { capability: Capability; runs: CaptureRun[]; visualVerified?: false };
type Activity = {
  id: string;
  createdAt: string;
  tool: string;
  status: string;
  title: string;
  message?: string;
  paths?: string[];
};

const auditKey = (id: number) => ["/api/conversations", id, "workbench-visual-audit"];
const evidenceKey = (id: number) => ["project-workbench-evidence", id];
const phaseLabel = (phase: CaptureRun["phase"]) => phase === "before" ? "Before" : "After";

type InspectionRow = { label: string; detail: string };
type InspectionViews = { desktop: InspectionRow[]; mobile: InspectionRow[] };

export function parseInspectionViews(value: unknown): InspectionViews | null {
  let inspection = value;
  if (typeof inspection === "string") {
    try { inspection = JSON.parse(inspection); } catch { return null; }
  }
  if (!inspection || typeof inspection !== "object" || Array.isArray(inspection)) return null;
  const root = inspection as Record<string, unknown>;
  const parseView = (value: unknown): InspectionRow[] | null => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      value = record.checks ?? record.items ?? value;
    }
    let entries: Array<[string, unknown]>;
    if (Array.isArray(value)) {
      if (value.length !== 6) return null;
      entries = value.map((item, index) => [String(index + 1), item]);
    } else if (value && typeof value === "object") {
      const values = Object.entries(value as Record<string, unknown>);
      if (values.length !== 6) return null;
      entries = values;
    } else return null;
    return entries.map(([fallback, item]) => {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        return { label: `Check ${fallback}`, detail: String(item) };
      }
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const row = item as Record<string, unknown>;
        const label = row.label ?? row.name ?? row.check ?? row.title ?? `Check ${fallback}`;
        const status = row.status ?? row.outcome;
        const detail = row.detail ?? row.result ?? row.observation ?? row.finding ?? row.details ?? status;
        return { label: String(label), detail: [status, typeof detail === "string" ? detail : detail == null ? "Observation not provided." : JSON.stringify(detail)].filter(Boolean).join(" · ") };
      }
      return { label: `Check ${fallback}`, detail: "Observation not provided." };
    });
  };
  const desktop = parseView(root.desktop);
  const mobile = parseView(root.mobile);
  return desktop && mobile ? { desktop, mobile } : null;
}

async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : `Request failed (${response.status})`;
}

function auditEventSource(url: string, onEvent: (event: Activity) => void, onReset: () => void, onState: (state: string) => void) {
  const source = new EventSource(url, { withCredentials: true });
  source.addEventListener("open", () => onState("connected"));
  source.addEventListener("activity", event => {
    try { onEvent(JSON.parse((event as MessageEvent<string>).data) as Activity); } catch { /* Ignore malformed public activity; reconnect remains available. */ }
  });
  source.addEventListener("reset", () => onReset());
  source.addEventListener("heartbeat", () => onState("connected"));
  source.addEventListener("end", () => onState("reconnecting"));
  source.addEventListener("error", () => onState(source.readyState === EventSource.CONNECTING ? "reconnecting" : "disconnected"));
  return source;
}

export function ProjectVisualAuditChat({
  conversationId, onRepair, visualAuditConsent, onVisualAuditConsentChange,
}: {
  conversationId: number;
  onRepair: (request: string) => void;
  visualAuditConsent: boolean;
  onVisualAuditConsentChange: (consent: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [activity, setActivity] = useState<Activity[]>([]);
  const [streamState, setStreamState] = useState("connecting");
  const [expanded, setExpanded] = useState(false);
  const [captureTarget, setCaptureTarget] = useState<"before" | "after" | null>(null);
  const [reviewTarget, setReviewTarget] = useState<CaptureRun | null>(null);
  const [repairTarget, setRepairTarget] = useState<CaptureRun | null>(null);
  const [consentForAction, setConsentForAction] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const audit = useQuery<VisualAuditResponse>({
    queryKey: auditKey(conversationId),
    enabled: !!conversationId,
    queryFn: async () => {
      const response = await fetch(`/api/conversations/${conversationId}/workbench/visual-audit`, { credentials: "include" });
      if (!response.ok) throw new Error(await errorMessage(response));
      const data = await response.json();
      if (typeof data?.capability?.enabled !== "boolean" || !Array.isArray(data.runs))
        throw new Error("Capture capability response is incomplete. No capture has been started.");
      return data;
    },
  });
  const evidence = useQuery<{ items: Evidence[]; fingerprint?: string }>({
    queryKey: evidenceKey(conversationId),
    enabled: !!conversationId,
    queryFn: async () => {
      const response = await fetch(`/api/conversations/${conversationId}/workbench/evidence`, { credentials: "include" });
      if (!response.ok) throw new Error(await errorMessage(response));
      const data = await response.json();
      if (!Array.isArray(data?.items)) throw new Error("Saved evidence response is incomplete.");
      return data;
    },
  });
  const runs = useMemo(() => audit.data?.runs ?? [], [audit.data?.runs]);
  const fingerprint = evidence.data?.fingerprint;
  const capturePending = runs.some(run => run.status === "capturing");
  const latestRepairParent = useMemo(() => [...runs]
    .filter(run => !!fingerprint && run.repair?.status === "awaiting-reviewed-save" && run.fingerprint !== fingerprint && (run.repairDepth ?? 0) < 3
      && !runs.some(child => child.parentRunId === run.id))
    .sort((a, b) => Date.parse(b.repair?.preparedAt || b.updatedAt) - Date.parse(a.repair?.preparedAt || a.updatedAt))[0], [runs, fingerprint]);
  const profileImage = (run: CaptureRun, profile: "desktop" | "mobile") => {
    const item = evidence.data?.items?.find(entry => run.evidenceIds.includes(entry.id) && entry.profile === profile);
    return item ? `/api/conversations/${conversationId}/workbench/evidence/${encodeURIComponent(item.id)}/image` : null;
  };
  const currentStatus = (run: CaptureRun) => !fingerprint || run.fingerprint !== fingerprint ? "stale" : run.status;

  useEffect(() => {
    setActivity([]);
    setStreamState("connecting");
    if (typeof EventSource === "undefined") {
      setStreamState("unavailable in this browser");
      return;
    }
    let disposed = false;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let cursor = "";
    const connect = () => {
      if (disposed) return;
      source?.close();
      source = auditEventSource(
        `/api/conversations/${conversationId}/workbench/events${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`,
        event => {
          cursor = event.id;
          setActivity(previous => [...previous.filter(item => item.id !== event.id), event].slice(-140));
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            void queryClient.invalidateQueries({ queryKey: auditKey(conversationId) });
            void queryClient.invalidateQueries({ queryKey: evidenceKey(conversationId) });
          }, 500);
        },
        () => setActivity([]),
        state => {
          setStreamState(state);
          if (state === "reconnecting" && source?.readyState === EventSource.CLOSED) {
            reconnectTimer = setTimeout(connect, 1200);
          }
        },
      );
    };
    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      source?.close();
    };
  }, [conversationId, queryClient]);

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: auditKey(conversationId) }),
    queryClient.invalidateQueries({ queryKey: evidenceKey(conversationId) }),
  ]);

  const capture = async () => {
    if (!captureTarget || !fingerprint || actionBusy) return;
    setActionBusy(true);
    setError("");
    const phase = captureTarget;
    setCaptureTarget(null);
    setConsentForAction(false);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/workbench/visual-audit/capture`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true, requestId: crypto.randomUUID(), phase, fingerprint,
          ...(phase === "after" && latestRepairParent ? { parentRunId: latestRepairParent.id } : {}),
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Capture was not confirmed. Check saved capture history; there is no automatic retry.");
      await refresh();
    } finally { setActionBusy(false); }
  };

  const review = async () => {
    if (!reviewTarget || actionBusy) return;
    const target = reviewTarget;
    setReviewTarget(null);
    setConsentForAction(false);
    setActionBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/conversations/${conversationId}/workbench/visual-audit/${encodeURIComponent(target.id)}/review`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Review outcome could not be confirmed. Check run history before taking another paid action.");
      await refresh();
    } finally { setActionBusy(false); }
  };

  const prepareRepair = async () => {
    if (!repairTarget || actionBusy) return;
    const target = repairTarget;
    setRepairTarget(null);
    setConsentForAction(false);
    setActionBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/conversations/${conversationId}/workbench/visual-audit/${encodeURIComponent(target.id)}/repair`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json();
      if (typeof result.request !== "string" || !result.request.trim()) throw new Error("The repair request was not returned. No message was sent.");
      if (mounted.current) onRepair(result.request);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Repair request could not be prepared.");
      await refresh();
    } finally { setActionBusy(false); }
  };

  return <section aria-label="Visual audit and saved activity" className="my-4 overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900/70 text-zinc-100 shadow-lg shadow-black/10">
    <div className="flex flex-col gap-3 border-b border-zinc-800 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <span className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-2 text-amber-200"><Camera className="h-4 w-4" /></span>
        <div>
          <h2 className="font-semibold tracking-tight">Visual evidence</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-400">Paired desktop and mobile captures are private to this conversation. A screenshot is evidence, not a test pass.</p>
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400"><LockKeyhole className="h-3.5 w-3.5" />Private evidence</span>
    </div>

    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,.8fr)]">
      <div className="min-w-0 space-y-4">
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-700 bg-zinc-950/50 p-3 text-xs leading-relaxed text-zinc-300">
          <Checkbox checked={visualAuditConsent} onCheckedChange={value => onVisualAuditConsentChange(value === true)} className="mt-0.5" />
          <span>Allow visual-audit consent to accompany my next project-agent message. This is optional, applies only to this conversation, and does not capture or send anything by itself.</span>
        </label>

        {audit.isPending || evidence.isPending ? <div className="grid grid-cols-2 gap-3" aria-label="Loading screenshot capability and evidence">
          <div className="aspect-[4/3] animate-pulse rounded-lg bg-zinc-800" /><div className="aspect-[4/3] animate-pulse rounded-lg bg-zinc-800" />
        </div> : null}
        {(audit.isError || evidence.isError) && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900/70 bg-red-950/30 p-3 text-xs text-red-200">
          <span>{audit.isError ? `Capture capability could not be checked. ${audit.error?.message || "Request failed."}` : `Evidence could not load. ${evidence.error?.message || "Request failed."}`}</span>
          <Button size="sm" variant="outline" className="border-red-900 text-red-100" onClick={() => { void audit.refetch(); void evidence.refetch(); }}>Retry check</Button>
        </div>}
        {audit.data && evidence.data && <>
          {!audit.data.capability.enabled && <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 text-xs text-amber-100">
            <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" /><span>Remote browser capture is unavailable. {audit.data.capability.reason || "Capture capability is not currently enabled."}</span>
          </div>}
          {!fingerprint && <p role="status" className="rounded-lg border border-zinc-700 bg-zinc-950/50 p-3 text-xs text-zinc-400">Saved project fingerprint is still loading. Capture and review controls are paused until freshness can be checked.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {(["before", "after"] as const).map(phase => <Button key={phase} variant="outline" className="h-auto min-h-11 justify-start border-zinc-700 bg-zinc-950/40 py-2 text-zinc-100 hover:bg-zinc-800" disabled={!audit.data?.capability.enabled || !fingerprint || actionBusy || capturePending} onClick={() => { setConsentForAction(false); setCaptureTarget(phase); }}>
              {phase === "before" ? <Camera className="mr-2 h-4 w-4 text-amber-200" /> : <RefreshCw className="mr-2 h-4 w-4 text-amber-200" />}
              Capture {phaseLabel(phase)} · desktop + mobile
            </Button>)}
          </div>
          {latestRepairParent && <p className="rounded-md border border-amber-900/40 bg-amber-950/20 p-2.5 text-xs leading-relaxed text-amber-100">The next After capture will continue the latest prepared repair, run {latestRepairParent.id.slice(0, 8)}, because the project fingerprint has changed. Repair depth {latestRepairParent.repairDepth ?? 0} of 3.</p>}
          {(actionBusy || capturePending) && <p className="flex items-center gap-2 text-xs text-amber-100" role="status"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />{capturePending ? "A capture is recorded as in progress. Controls are paused until its saved outcome is known." : "Waiting for the confirmed operation to finish. Do not retry if its outcome is uncertain."}</p>}
          {runs.length === 0 && !audit.isPending && <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/30 px-4 py-6 text-center">
            <Camera className="mx-auto h-5 w-5 text-zinc-500" /><p className="mt-2 text-sm font-medium text-zinc-200">No saved screenshot runs</p>
            <p className="mt-1 text-xs text-zinc-500">No image will be fabricated. Confirm an explicit capture when you are ready.</p>
          </div>}
          {runs.map(run => {
            const status = currentStatus(run);
            const stale = status === "stale";
            const desktop = profileImage(run, "desktop"), mobile = profileImage(run, "mobile");
            const uncertain = run.status === "uncertain" || run.reviewAttempt?.status === "uncertain";
            const reviewPending = run.reviewAttempt?.status === "reviewing";
            const inspection = run.review ? parseInspectionViews(run.review.inspection) : null;
            return <article key={run.id} className="rounded-lg border border-zinc-700 bg-zinc-950/40 p-3">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="text-sm font-semibold">{phaseLabel(run.phase)} capture</p><time className="mt-1 block text-[10px] text-zinc-500">{new Date(run.createdAt).toLocaleString()}</time></div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${stale || uncertain || run.status === "failed" ? "bg-amber-950/50 text-amber-200" : run.status === "captured" ? "bg-emerald-950/50 text-emerald-200" : "bg-zinc-800 text-zinc-300"}`}>
                  {stale ? "Stale" : uncertain ? "Outcome uncertain · do not replay" : run.status === "captured" ? "Captured" : run.status === "failed" ? "Failed" : "Capturing"}
                </span>
              </header>
              {run.status === "captured" && <>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {([{ label: "Desktop", icon: Monitor, src: desktop }, { label: "Mobile", icon: Smartphone, src: mobile }] as const).map(view => <div key={view.label} className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-medium text-zinc-400"><view.icon className="h-3 w-3" />{view.label}</div>
                    {view.src && !failedImages[view.src] ? <a href={view.src} target="_blank" rel="noreferrer" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200" aria-label={`Open private ${view.label.toLowerCase()} screenshot in a new tab`}>
                      <img src={view.src} alt={`${phaseLabel(run.phase)} ${view.label.toLowerCase()} screenshot`} loading="lazy" onError={() => setFailedImages(previous => ({ ...previous, [view.src!]: true }))} className="aspect-[4/3] w-full bg-zinc-950 object-contain" />
                    </a> : <div className="flex aspect-[4/3] items-center justify-center p-4 text-center text-xs text-amber-100"><AlertTriangle className="mr-2 h-4 w-4 shrink-0" />{evidence.isError ? "Image details unavailable." : "This profile image is not available in saved evidence."}</div>}
                    {view.src && <a href={view.src} download={`${run.phase}-${view.label.toLowerCase()}-${run.id}.jpg`} className="flex items-center gap-1.5 border-t border-zinc-800 px-2 py-1.5 text-[10px] text-zinc-300 hover:text-amber-100"><Download className="h-3 w-3" />Download private image</a>}
                  </div>)}
                </div>
                {run.review && <div className="mt-3 rounded-md border border-zinc-700 bg-zinc-900/80 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200"><Check className="h-3.5 w-3.5" />{inspection ? "Structured visual review" : "Unstructured review"} · {new Date(run.review.createdAt).toLocaleString()}</p>
                  {inspection && <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(["desktop", "mobile"] as const).map(profile => <section key={profile} aria-label={`${profile} visual checklist`} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-2.5">
                      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-300">{profile} · six observations</h4>
                      <ol className="mt-2 space-y-2">
                        {inspection[profile].map((check, index) => <li key={`${index}-${check.label}`} className="border-l border-amber-200/30 pl-2">
                          <p className="text-[10px] font-medium text-zinc-200">{check.label}</p>
                          <p className="mt-0.5 break-words text-[10px] leading-relaxed text-zinc-400">{check.detail}</p>
                        </li>)}
                      </ol>
                    </section>)}
                  </div>}
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-300">{run.review.findings}</p>
                  <p className="mt-2 text-[10px] text-amber-200">Visual review is not functional verification.</p>
                </div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-100" disabled={actionBusy || stale || !fingerprint || !!run.review || uncertain || reviewPending} onClick={() => { setConsentForAction(false); setReviewTarget(run); }}><WandSparkles className="mr-1.5 h-3.5 w-3.5" />Review both images</Button>
                  <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-100" disabled={actionBusy || stale || !run.review || uncertain || !!run.repair} onClick={() => { setConsentForAction(false); setRepairTarget(run); }}>{run.repair ? "Repair prepared" : "Prepare repair request"}</Button>
                </div>
                {run.repair && <div className="mt-3 rounded-md border border-amber-900/40 bg-amber-950/20 p-3">
                  <p className="text-xs font-semibold text-amber-100">Repair prepared · awaiting reviewed save</p>
                  <p className="mt-1 text-[10px] text-zinc-400">Prepared {new Date(run.repair.preparedAt).toLocaleString()} · depth {run.repairDepth ?? 0} of 3</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-300">{run.repair.request}</p>
                </div>}
              </>}
              {stale && <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-950/30 p-2 text-xs text-amber-100"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Project source has changed since capture. Historical images cannot be reviewed or used for repair.</p>}
              {(run.reason || uncertain) && <p role={uncertain ? "alert" : "status"} className="mt-2 text-xs leading-relaxed text-amber-100">{run.reason || "The previous operation has an uncertain outcome. Check saved history; no paid operation will be replayed automatically."}</p>}
              {run.reviewAttempt?.status === "reviewing" && <p role="status" className="mt-2 text-xs text-amber-100">Review has been dispatched; outcome may still be settling.</p>}
              {run.parentRunId && <p className="mt-2 text-[10px] text-zinc-500">Continues repair from run {run.parentRunId.slice(0, 8)}{run.target ? ` · profile ${run.target.profile} v${run.target.profileVersion}` : ""}{run.repairDepth !== undefined ? ` · depth ${run.repairDepth}/3` : ""}</p>}
              <a href={`/api/conversations/${conversationId}/workbench/visual-audit/${encodeURIComponent(run.id)}/report`} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-[10px] text-zinc-300 hover:border-amber-200/50 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200" download={`visual-audit-${run.id}.json`}>
                <Download className="h-3 w-3" />Download private JSON report
              </a>
            </article>;
          })}
        </>}
        {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-900/70 bg-red-950/30 p-3 text-xs text-red-200"><span>{error}</span><Button size="sm" variant="outline" className="shrink-0 border-red-900" onClick={() => { setError(""); void refresh(); }}>Check saved history</Button></div>}
      </div>

      <aside className="min-w-0 space-y-3">
        <section className="rounded-lg border border-zinc-700 bg-zinc-950/45 p-3" aria-label="Saved project activity history">
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="flex w-full items-center justify-between gap-2 text-left">
            <span><span className="block text-xs font-semibold uppercase tracking-wide text-zinc-300">Saved activity</span><span className="mt-1 block text-[10px] text-zinc-500">Read-only · {streamState}</span></span>
            <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded && <>
            {audit.isError && <p role="alert" className="mt-3 text-xs text-amber-100">Saved run history could not be loaded. {audit.error.message}<button type="button" className="ml-2 underline" onClick={() => void audit.refetch()}>Retry</button></p>}
            {activity.length === 0 && !audit.isError && <p className="mt-3 rounded-md border border-dashed border-zinc-700 p-3 text-center text-xs text-zinc-500">No saved workbench events yet.</p>}
            <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {activity.map(event => <li key={event.id} className="border-l-2 border-amber-200/30 pl-2.5">
                <p className="text-xs font-medium text-zinc-200">{event.title || `${event.tool} · ${event.status}`}</p>
                <time className="mt-1 block text-[10px] text-zinc-500">{new Date(event.createdAt).toLocaleString()}</time>
                {event.message && <p className="mt-1 break-words text-[10px] leading-relaxed text-zinc-400">{event.message}</p>}
                {event.paths?.length ? <p className="mt-1 break-all font-mono text-[10px] text-zinc-500">{event.paths.join(", ")}</p> : null}
              </li>)}
            </ol>
          </>}
          <p className="mt-3 border-t border-zinc-800 pt-3 text-[10px] leading-relaxed text-zinc-500">The activity stream only reads saved events, resumes from its event cursor, and closes when this conversation changes. It never starts or replays a job.</p>
        </section>
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-[11px] leading-relaxed text-zinc-400">
          <p className="font-semibold text-zinc-200">Evidence, not a guarantee</p>
          <p className="mt-1">Capture sends the saved project preview to a remote browser. Review sends both screenshots for AI analysis and may incur a charge. Failed or uncertain outcomes are shown as-is; no automatic paid retry occurs.</p>
        </div>
      </aside>
    </div>

    <Dialog open={!!captureTarget} onOpenChange={open => { if (!open) setCaptureTarget(null); }}>
      <DialogContent className="border-zinc-700 bg-zinc-950 text-zinc-100">
        <DialogHeader><DialogTitle>Confirm {captureTarget ? phaseLabel(captureTarget) : ""} capture</DialogTitle>
          <DialogDescription className="text-zinc-400">The saved project preview will be sent to a remote browser to create desktop and mobile screenshots. This starts a new capture request, not a replay.{captureTarget === "after" && latestRepairParent ? ` It will continue prepared repair ${latestRepairParent.id.slice(0, 8)} because the source fingerprint changed.` : ""}</DialogDescription></DialogHeader>
        <label className="flex items-start gap-2 text-sm text-zinc-300"><Checkbox checked={consentForAction} onCheckedChange={value => setConsentForAction(value === true)} /><span>I have permission to share this project preview for capture and have removed sensitive material.</span></label>
        <DialogFooter><Button variant="outline" className="border-zinc-700" onClick={() => setCaptureTarget(null)}>Cancel</Button><Button disabled={!consentForAction || actionBusy} onClick={() => void capture()}>Capture paired screenshots</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={!!reviewTarget} onOpenChange={open => { if (!open) setReviewTarget(null); }}>
      <DialogContent className="border-zinc-700 bg-zinc-950 text-zinc-100">
        <DialogHeader><DialogTitle>Share both screenshots for review?</DialogTitle><DialogDescription className="text-zinc-400">The actual desktop and mobile images will be sent for AI visual analysis. This may incur a charge. A review is not a functional test.</DialogDescription></DialogHeader>
        <label className="flex items-start gap-2 text-sm text-zinc-300"><Checkbox checked={consentForAction} onCheckedChange={value => setConsentForAction(value === true)} /><span>I have permission to share both saved images for AI review.</span></label>
        <DialogFooter><Button variant="outline" className="border-zinc-700" onClick={() => setReviewTarget(null)}>Cancel</Button><Button disabled={!consentForAction || actionBusy} onClick={() => void review()}>Confirm AI review</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={!!repairTarget} onOpenChange={open => { if (!open) setRepairTarget(null); }}>
      <DialogContent className="border-zinc-700 bg-zinc-950 text-zinc-100">
        <DialogHeader><DialogTitle>Prepare a repair request</DialogTitle><DialogDescription className="text-zinc-400">A reviewed request will be placed in the chat composer. It will not be sent or saved until you inspect and submit it yourself.</DialogDescription></DialogHeader>
        <p className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-300">Only the current source review can be used. No project files will be changed by preparing the request.</p>
        <DialogFooter><Button variant="outline" className="border-zinc-700" onClick={() => setRepairTarget(null)}>Cancel</Button><Button disabled={actionBusy} onClick={() => void prepareRepair()}>Prepare in chat</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

