import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, Check, ChevronDown, CircleHelp, Download, LoaderCircle, LockKeyhole, RefreshCw, Smartphone, Monitor, WandSparkles, Image as ImageIcon, Plus, ExternalLink, FileText, Files, Search, Pencil, ScanEye, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ReactNode } from "react";
import type { WorkspacePreviewTarget } from "@/components/project-workspace-preview";

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
  sequence?: string;
  jobId?: string;
  callId?: string;
  createdAt: string;
  tool: string;
  status: string;
  title: string;
  message?: string;
  paths?: string[];
  evidenceIds?: string[];
  artifactId?: string;
};
type ActivityPage = {
  items: Activity[];
  nextBefore: string | null;
  hasMore: boolean;
  retention: "project-lifetime";
  legacyHistory: string;
};

const auditKey = (id: number) => ["/api/conversations", id, "workbench-visual-audit"];
const evidenceKey = (id: number) => ["project-workbench-evidence", id];
const phaseLabel = (phase: CaptureRun["phase"]) => phase === "before" ? "Before" : "After";

const activityToolLabels: Record<string, string> = {
  take_ui_screenshot: "Capture screenshots",
  list_files: "List project files",
  read_file: "Read project file",
  search_context: "Search project context",
  search_files: "Search project files",
  propose_edits: "Propose file edits",
  propose_operations: "Propose source operations",
  project_review: "Review project",
  visual_review: "Review screenshots",
  visual_repair: "Prepare visual repair",
  capture_screenshots: "Capture screenshots",
  review_screenshots: "Review screenshots",
  read_project_file: "Read project file",
  write_project_file: "Write project file",
  write_file: "Write file",
  design_proposal: "Save design proposal",
};

export function projectActionLabel(tool: string) {
  return activityToolLabels[tool] ?? tool.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export function ProjectActionIcon({ tool, className = "h-3.5 w-3.5 shrink-0" }: { tool: string; className?: string }) {
  switch (tool) {
    case "take_ui_screenshot":
    case "capture_screenshots": return <Camera aria-hidden="true" className={className} />;
    case "list_files": return <Files aria-hidden="true" className={className} />;
    case "read_file":
    case "read_project_file": return <FileText aria-hidden="true" className={className} />;
    case "write_project_file":
    case "write_file": return <Pencil aria-hidden="true" className={className} />;
    case "search_context":
    case "search_files": return <Search aria-hidden="true" className={className} />;
    case "propose_edits":
    case "propose_operations": return <Pencil aria-hidden="true" className={className} />;
    case "project_review":
    case "visual_review":
    case "review_screenshots": return <ScanEye aria-hidden="true" className={className} />;
    case "visual_repair": return <Wrench aria-hidden="true" className={className} />;
    default: return <CircleHelp aria-hidden="true" className={className} />;
  }
}

function activityStatus(status: string, createdAt?: string): { label: string; tone: string; icon: ReactNode; running: boolean } {
  const normalized = status.toLowerCase();
  const freshStarted = normalized !== "started" || !createdAt || Date.now() - Date.parse(createdAt) <= 120000;
  if (["running", "capturing", "reviewing", "in_progress"].includes(normalized) || (normalized === "started" && freshStarted)) {
    return { label: "In progress", tone: "text-sky-200", icon: <LoaderCircle aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" />, running: true };
  }
  if (normalized === "started") return { label: "Started · update pending", tone: "text-amber-200", icon: <CircleHelp aria-hidden="true" className="h-3 w-3" />, running: false };
  if (["awaiting-approval", "awaiting-reviewed-save"].includes(normalized)) {
    return { label: "Awaiting approval", tone: "text-amber-200", icon: <CircleHelp aria-hidden="true" className="h-3 w-3" />, running: false };
  }
  if (["completed", "captured", "reviewed", "saved", "succeeded", "success"].includes(normalized)) {
    return { label: "Completed", tone: "text-emerald-200", icon: <Check aria-hidden="true" className="h-3 w-3" />, running: false };
  }
  if (["failed", "error", "stopped"].includes(normalized)) {
    return { label: normalized === "stopped" ? "Stopped" : "Failed", tone: "text-rose-200", icon: <X aria-hidden="true" className="h-3 w-3" />, running: false };
  }
  return { label: normalized === "uncertain" || normalized === "interrupted" ? "Uncertain" : status ? `Outcome: ${status}` : "Outcome not recorded", tone: "text-amber-200", icon: <CircleHelp aria-hidden="true" className="h-3 w-3" />, running: false };
}

export function ProjectActionStatus({ status, createdAt }: { status: string; createdAt?: string }) {
  const state = activityStatus(status, createdAt);
  return <span className={`inline-flex shrink-0 items-center gap-1 ${state.tone}`} aria-label={state.label}>
    {state.icon}<span>{state.label}</span>
  </span>;
}

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
    try {
      const message = event as MessageEvent<string>;
      const activity = JSON.parse(message.data) as Activity;
      if (!activity.sequence && /^\d+$/.test(message.lastEventId || "")) activity.sequence = message.lastEventId;
      onEvent(activity);
    } catch { /* Ignore malformed public activity; reconnect remains available. */ }
  });
  source.addEventListener("reset", () => onReset());
  source.addEventListener("heartbeat", () => onState("connected"));
  source.addEventListener("end", () => onState("reconnecting"));
  source.addEventListener("error", () => onState(source.readyState === EventSource.CONNECTING ? "reconnecting" : "disconnected"));
  return source;
}

function orderActivity(items: Activity[]): Activity[] {
  return [...items].sort((a, b) => {
    if (a.sequence && b.sequence && /^\d+$/.test(a.sequence) && /^\d+$/.test(b.sequence)) {
      const left = a.sequence.replace(/^0+(?=\d)/, ""), right = b.sequence.replace(/^0+(?=\d)/, "");
      return left.length - right.length || left.localeCompare(right) || a.id.localeCompare(b.id);
    }
    return Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
  });
}

function mergeActivity(previous: Activity[], incoming: Activity[]): Activity[] {
  const stableKey = (item: Activity) => item.tool === "design_proposal" && item.artifactId ? `proposal:${item.artifactId}` : item.id;
  const byId = new Map(previous.map(item => [stableKey(item), item]));
  incoming.forEach(item => byId.set(stableKey(item), { ...byId.get(stableKey(item)), ...item }));
  return orderActivity(Array.from(byId.values()));
}

export function ProjectVisualAuditChat({
  conversationId, onRepair, visualAuditConsent, onVisualAuditConsentChange, messageItems = [], onOpenPreview,
}: {
  conversationId: number;
  onRepair: (request: string) => void;
  visualAuditConsent: boolean;
  onVisualAuditConsentChange: (consent: boolean) => void;
  messageItems?: { id: string; timestamp: number; node: ReactNode }[];
  onOpenPreview?: (target: WorkspacePreviewTarget) => void;
}) {
  const queryClient = useQueryClient();
  const [activity, setActivity] = useState<Activity[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [olderError, setOlderError] = useState("");
  const [activityPage, setActivityPage] = useState<ActivityPage | null>(null);
  const [streamState, setStreamState] = useState("connecting");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureTarget, setCaptureTarget] = useState<"before" | "after" | null>(null);
  const [reviewTarget, setReviewTarget] = useState<CaptureRun | null>(null);
  const [repairTarget, setRepairTarget] = useState<CaptureRun | null>(null);
  const [consentForAction, setConsentForAction] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false);
  const [selectedMediaJob, setSelectedMediaJob] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalError, setProposalError] = useState("");
  const proposalRequest = useRef<{ signature: string; id: string } | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
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
  const mediaJobs = useQuery<{ jobs: { id: string; kind: string; status: string; prompt: string; createdAt: string }[] }>({
    queryKey: ["/api/media/jobs"],
    enabled: proposalDialogOpen,
    queryFn: async () => {
      const response = await fetch("/api/media/jobs", { credentials: "include" });
      if (!response.ok) throw new Error(await errorMessage(response));
      return response.json();
    },
  });
  const completedImageJobs = (mediaJobs.data?.jobs ?? []).filter(job => job.kind === "image" && job.status === "succeeded");
  const selectedJob = completedImageJobs.find(job => job.id === selectedMediaJob);
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
    setActivityPage(null);
    setActivityError("");
    setOlderError("");
    setActivityLoading(true);
    setOlderLoading(false);
    setStreamState("connecting");
    let disposed = false;
    const isCurrent = () => !disposed;
    const loadLatest = async () => {
      try {
        const response = await fetch(`/api/conversations/${conversationId}/workbench/activity?limit=50`, { credentials: "include" });
        if (!response.ok) throw new Error(await errorMessage(response));
        const page = await response.json() as ActivityPage;
        if (!Array.isArray(page?.items) || typeof page.hasMore !== "boolean") throw new Error("Saved activity response is incomplete.");
        if (!isCurrent()) return;
        setActivity(previous => mergeActivity(previous, page.items));
        setActivityPage(page);
        setActivityError("");
      } catch (reason) {
        if (isCurrent()) setActivityError(reason instanceof Error ? reason.message : "Saved activity could not be loaded.");
      } finally {
        if (isCurrent()) setActivityLoading(false);
      }
    };
    void loadLatest();
    if (typeof EventSource === "undefined") {
      setStreamState("unavailable in this browser");
      return () => { disposed = true; };
    }
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
          if (disposed) return;
          cursor = event.sequence || event.id;
          setActivity(previous => mergeActivity(previous, [event]));
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            void queryClient.invalidateQueries({ queryKey: auditKey(conversationId) });
            void queryClient.invalidateQueries({ queryKey: evidenceKey(conversationId) });
          }, 500);
        },
        () => { void loadLatest(); },
        state => {
          if (disposed) return;
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

  const loadOlderActivity = async () => {
    if (!activityPage?.nextBefore || olderLoading) return;
    setOlderLoading(true);
    setOlderError("");
    try {
      const response = await fetch(`/api/conversations/${conversationId}/workbench/activity?limit=50&before=${encodeURIComponent(activityPage.nextBefore)}`, { credentials: "include" });
      if (!response.ok) throw new Error(await errorMessage(response));
      const page = await response.json() as ActivityPage;
      if (!Array.isArray(page?.items) || typeof page.hasMore !== "boolean") throw new Error("Saved activity response is incomplete.");
      if (!mounted.current || conversationId !== conversationIdRef.current) return;
      setActivity(previous => mergeActivity(previous, page.items));
      setActivityPage(page);
    } catch (reason) {
      if (mounted.current && conversationId === conversationIdRef.current) setOlderError(reason instanceof Error ? reason.message : "Older activity could not be loaded.");
    } finally {
      if (mounted.current && conversationId === conversationIdRef.current) setOlderLoading(false);
    }
  };

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: auditKey(conversationId) }),
    queryClient.invalidateQueries({ queryKey: evidenceKey(conversationId) }),
  ]);

  const createProposal = async () => {
    if (!selectedJob || !proposalTitle.trim() || proposalBusy) return;
    setProposalBusy(true);
    setProposalError("");
    try {
      const signature = JSON.stringify([selectedJob.id, proposalTitle.trim()]);
      if (proposalRequest.current?.signature !== signature) proposalRequest.current = { signature, id: crypto.randomUUID() };
      const response = await fetch(`/api/conversations/${conversationId}/workbench/proposals`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: proposalRequest.current.id, mediaJobId: selectedJob.id, title: proposalTitle.trim() }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const proposal = await response.json();
      if (typeof proposal?.id !== "string" || typeof proposal?.createdAt !== "string" || !Number.isFinite(Date.parse(proposal.createdAt)) || typeof proposal?.title !== "string") {
        throw new Error("Saved proposal response is incomplete.");
      }
      const savedEvent: Activity = {
        id: `proposal:${proposal.id}`, artifactId: proposal.id,
        createdAt: proposal.createdAt, tool: "design_proposal", status: "saved", title: proposal.title,
      };
      setActivity(previous => mergeActivity(previous, [savedEvent]));
      setProposalDialogOpen(false);
      setProposalTitle("");
      setSelectedMediaJob("");
      proposalRequest.current = null;
      // This action explicitly attaches an already-finished owned image job; the event stream supplies its saved card.
    } catch (reason) {
      setProposalError(reason instanceof Error ? reason.message : "Proposal could not be saved.");
    } finally { setProposalBusy(false); }
  };

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

  const groupedActivity = useMemo(() => {
    const groups = new Map<string, Activity[]>();
    activity.filter(event => event.tool !== "design_proposal").forEach(event => {
      const key = event.jobId || event.id;
      groups.set(key, [...(groups.get(key) ?? []), event]);
    });
    return Array.from(groups, ([key, events]) => ({
      key,
      events: orderActivity(events),
      timestamp: Math.min(...events.map(event => Date.parse(event.createdAt) || 0)),
    }));
  }, [activity]);
  const proposalEvents = activity.filter(event => event.tool === "design_proposal" && event.artifactId);
  const timeline = useMemo(() => [
    ...messageItems.map(item => ({ kind: "message" as const, key: item.id, timestamp: item.timestamp, item })),
    ...groupedActivity.map(group => ({ kind: "activity" as const, key: group.key, timestamp: group.timestamp, group })),
    ...proposalEvents.map(event => ({ kind: "proposal" as const, key: event.artifactId!, timestamp: Date.parse(event.createdAt) || 0, event })),
  ].sort((a, b) => a.timestamp - b.timestamp || a.key.localeCompare(b.key)), [messageItems, groupedActivity, proposalEvents]);

  const attachedEvidence = activity.flatMap(event => (event.evidenceIds ?? [])
    .map(id => evidence.data?.items.find(item => item.id === id))
    .filter((item): item is Evidence => !!item));
  const runEvidenceIds = new Set(runs.flatMap(run => run.evidenceIds));
  const uniqueEvidence = Array.from(new Map(attachedEvidence.filter(item => !runEvidenceIds.has(item.id)).map(item => [item.id, item])).values());
  const proposalImage = (event: Activity) => `/api/conversations/${conversationId}/workbench/proposals/${encodeURIComponent(event.artifactId!)}/image`;
  const evidenceImage = (item: Evidence) => `/api/conversations/${conversationId}/workbench/evidence/${encodeURIComponent(item.id)}/image`;

  return <section aria-label="Conversation and visual tools" className="my-2 min-w-0 text-zinc-100">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${streamState === "connected" ? "bg-emerald-400" : streamState === "connecting" ? "bg-amber-300" : "bg-zinc-500"}`} />
        <span className="truncate text-xs text-zinc-400">Saved project activity · {streamState}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="h-8 border-zinc-700 bg-zinc-900/50 px-2.5 text-xs text-zinc-200 hover:bg-zinc-800" onClick={() => { setProposalError(""); setProposalDialogOpen(true); }}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />Save design proposal
        </Button>
        <Button type="button" size="sm" variant="outline" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(value => !value)} className="h-8 border-zinc-700 bg-zinc-900/50 px-2.5 text-xs text-zinc-200 hover:bg-zinc-800">
          <Camera className="mr-1.5 h-3.5 w-3.5 text-amber-200" />Visual tools
          <ChevronDown className={`ml-1.5 h-3.5 w-3.5 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
        </Button>
      </div>
    </header>

    {(runs.some(run => run.status === "captured" && run.evidenceIds.length > 0) || uniqueEvidence.length > 0) && <section aria-label="Saved visual artifacts" className="mb-4">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"><ImageIcon className="h-3.5 w-3.5" />Saved visuals</div>
      <div className="flex gap-2.5 overflow-x-auto pb-2">
        {runs.filter(run => run.status === "captured" && run.evidenceIds.length > 0).map(run => (["desktop", "mobile"] as const).map(profile => {
          const src = profileImage(run, profile);
          if (!src) return null;
          const item = evidence.data?.items.find(saved => run.evidenceIds.includes(saved.id) && saved.profile === profile);
          return <a key={`${run.id}-${profile}`} href={src} target="_blank" rel="noreferrer"
            aria-label={`Open ${phaseLabel(run.phase).toLowerCase()} ${profile} screenshot`}
            onClick={event => {
              if (onOpenPreview && item) {
                event.preventDefault();
                onOpenPreview({ kind: "evidence", id: item.id, label: `${phaseLabel(run.phase)} ${profile} screenshot` });
              }
            }} className="group block w-36 shrink-0 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
            {!failedImages[src] ? <img src={src} alt={`${phaseLabel(run.phase)} ${profile} saved screenshot`} loading="lazy" onError={() => setFailedImages(previous => ({ ...previous, [src]: true }))} className="aspect-[4/3] w-full object-cover" />
              : <span className="flex aspect-[4/3] items-center justify-center text-[10px] text-amber-100">Image unavailable</span>}
            <span className="block truncate px-2 py-1.5 text-[10px] text-zinc-300">{phaseLabel(run.phase)} · {profile}</span>
          </a>;
        }))}
        {uniqueEvidence.map(item => {
          const src = evidenceImage(item);
          return <a key={`evidence-${item.id}`} href={src} target="_blank" rel="noreferrer"
            aria-label={`Open saved ${item.profile || "project"} screenshot`}
            onClick={event => {
              if (onOpenPreview) {
                event.preventDefault();
                onOpenPreview({ kind: "evidence", id: item.id, label: item.name || "Saved screenshot" });
              }
            }} className="block w-36 shrink-0 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
            {!failedImages[src] ? <img src={src} alt={item.name || `${item.profile || "Saved"} screenshot`} loading="lazy" onError={() => setFailedImages(previous => ({ ...previous, [src]: true }))} className="aspect-[4/3] w-full object-cover" />
              : <span className="flex aspect-[4/3] items-center justify-center text-[10px] text-amber-100">Image unavailable</span>}
            <span className="block truncate px-2 py-1.5 text-[10px] text-zinc-300">{item.name || `${item.profile || "Saved"} screenshot`}</span>
          </a>;
        })}
      </div>
    </section>}

    <ol className="space-y-3" aria-label="Chronological conversation and project activity">
      {timeline.map(entry => entry.kind === "message"
        ? <li key={`message-${entry.key}`} className="min-w-0 py-1">
          <div className="min-w-0 text-sm text-zinc-200">{entry.item.node}</div>
        </li>
        : entry.kind === "proposal" ? <li key={`proposal-${entry.key}`} className="min-w-0 py-1">
          {(() => {
            const event = entry.event;
            const src = proposalImage(event);
            return <article className="max-w-lg overflow-hidden rounded-xl border border-amber-200/20 bg-zinc-900/75">
              {!failedImages[src] ? <img src={src} alt={`${event.title || "Saved design proposal"} image`} loading="lazy" onError={() => setFailedImages(previous => ({ ...previous, [src]: true }))} className="aspect-[16/10] w-full object-cover" />
                : <div role="img" aria-label={`${event.title || "Saved design proposal"} image unavailable`} className="flex aspect-[16/10] items-center justify-center gap-2 bg-zinc-950 text-xs text-zinc-500"><ImageIcon className="h-4 w-4" />Preview unavailable</div>}
              <div className="flex flex-wrap items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-100">{event.title || "Saved design proposal"}</p>
                  <p className="mt-1 text-[10px] text-amber-200/80">Illustrative proposal · not implemented or verified</p>
                </div>
                <Button type="button" size="sm" variant="outline" className="h-8 border-zinc-700 px-2.5 text-xs" disabled={!onOpenPreview} onClick={() => onOpenPreview?.({ kind: "proposal", id: event.artifactId!, label: event.title || "Saved design proposal" })}>
                  Open <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </article>;
          })()}
        </li>
        : <li key={`job-${entry.key}`} className="min-w-0 overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/25">
          <button type="button" aria-expanded={openGroups[entry.key] ?? false} onClick={() => setOpenGroups(previous => ({ ...previous, [entry.key]: !(previous[entry.key] ?? false) }))} className="flex w-full items-center gap-2 p-2.5 text-left hover:bg-zinc-900/70">
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${openGroups[entry.key] ? "rotate-180" : ""}`} />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-400">{entry.group.events.length > 1 ? `${entry.group.events.length} project actions` : "Project action group"}</span>
            {entry.group.events.some(event => /failed|error|uncertain/i.test(event.status)) && <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-900/60 bg-amber-950/30 px-2 py-0.5 text-[10px] font-medium text-amber-200">
              <AlertTriangle className="h-3 w-3" />{entry.group.events.some(event => /uncertain/i.test(event.status)) ? "Uncertain" : "Failed"}
            </span>}
            <time className="shrink-0 text-[10px] text-zinc-600">{new Date(entry.timestamp).toLocaleString()}</time>
          </button>
          <ol aria-label="Project actions" className="space-y-1 px-3 pb-2">
            {Array.from(new Map(entry.group.events.map(event => [event.callId ? `${event.tool}:${event.callId}` : event.id, event])).values()).map(event => {
              const state = activityStatus(event.status, event.createdAt);
              return <li key={`summary-${event.id}`} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-zinc-900/40 px-2 py-1.5 text-[11px]">
                <ProjectActionIcon tool={event.tool} className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
                <span className="min-w-0 flex-1 truncate font-medium text-zinc-200">{projectActionLabel(event.tool)}</span>
                <span className={`inline-flex shrink-0 items-center gap-1 ${state.tone}`}>
                  {state.icon}<span>{state.label}</span>
                </span>
              </li>;
            })}
          </ol>
          {openGroups[entry.key] && <ol className="space-y-2 border-t border-zinc-800/80 px-3 py-2">
            {entry.group.events.map(event => <li key={event.id} className="border-l border-zinc-700 py-1 pl-2.5">
              <p className="text-xs font-medium text-zinc-300">{event.title || `${event.tool} · ${event.status}`}</p>
              <time className="mt-1 block text-[10px] text-zinc-500">{new Date(event.createdAt).toLocaleString()} · {event.status}</time>
              {event.message && <p className="mt-1 break-words text-[10px] leading-relaxed text-zinc-400">{event.message}</p>}
              {event.paths?.length ? <p className="mt-1 break-all font-mono text-[10px] text-zinc-500">{event.paths.join(", ")}</p> : null}
            </li>)}
          </ol>}
        </li>)}
    </ol>
    {activityLoading && activity.length === 0 && <div role="status" aria-label="Loading saved activity" className="mt-3 space-y-2">
      <div className="h-9 animate-pulse rounded-md bg-zinc-800/50" /><div className="h-9 animate-pulse rounded-md bg-zinc-800/50" />
    </div>}
    {!activityLoading && !activityError && activity.length === 0 && messageItems.length === 0 && <p className="mt-3 rounded-md border border-dashed border-zinc-700 p-4 text-center text-xs text-zinc-500">Your project conversation will appear here.</p>}
    {activityError && <div role="alert" className="mt-3 rounded-md border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-100">
      <p>Saved activity could not be loaded. {activityError}</p>
      <Button size="sm" variant="outline" className="mt-2 h-8 border-amber-900 text-amber-100" onClick={() => {
        setActivityLoading(true);
        void fetch(`/api/conversations/${conversationId}/workbench/activity?limit=50`, { credentials: "include" })
          .then(async response => {
            if (!response.ok) throw new Error(await errorMessage(response));
            return response.json() as Promise<ActivityPage>;
          })
          .then(page => {
            if (!mounted.current || conversationId !== conversationIdRef.current) return;
            setActivity(previous => mergeActivity(previous, page.items));
            setActivityPage(page);
            setActivityError("");
          })
          .catch(reason => { if (mounted.current && conversationId === conversationIdRef.current) setActivityError(reason instanceof Error ? reason.message : "Saved activity could not be loaded."); })
          .finally(() => { if (mounted.current && conversationId === conversationIdRef.current) setActivityLoading(false); });
      }}>Retry activity</Button>
    </div>}
    {olderError && <div role="alert" className="mt-3 text-xs text-amber-100">
      <p>Older activity could not be loaded. {olderError}</p>
      <Button size="sm" variant="outline" className="mt-2 h-8 border-amber-900 text-amber-100" onClick={() => void loadOlderActivity()}>Retry older activity</Button>
    </div>}
    {activityPage?.hasMore && <Button type="button" variant="outline" className="mt-3 w-full border-zinc-700 text-xs text-zinc-200" disabled={olderLoading || activityLoading} onClick={() => void loadOlderActivity()}>
      {olderLoading ? <><LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />Loading older activity</> : "Load older activity"}
    </Button>}

    {settingsOpen && <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Visual tools</h2><p className="mt-0.5 text-[10px] text-zinc-500">Private to this conversation · screenshots are evidence, not a test pass.</p></div>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500"><LockKeyhole className="h-3 w-3" />Private</span>
      </div>
      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-700 bg-zinc-950/50 p-3 text-xs leading-relaxed text-zinc-300">
        <Checkbox checked={visualAuditConsent} onCheckedChange={value => onVisualAuditConsentChange(value === true)} className="mt-0.5" />
        <span>Allow visual-audit consent to accompany my next project-agent message. This is optional, applies only to this conversation, and does not capture or send anything by itself.</span>
      </label>
      <div className="grid gap-4">
      <div className="min-w-0 space-y-4">
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
                    {view.src && !failedImages[view.src] ? <a href={view.src} target="_blank" rel="noreferrer" onClick={event => {
                      if (onOpenPreview) {
                        const item = evidence.data?.items?.find(saved => `/api/conversations/${conversationId}/workbench/evidence/${encodeURIComponent(saved.id)}/image` === view.src);
                        if (item) {
                          event.preventDefault();
                          onOpenPreview({ kind: "evidence", id: item.id, label: `${view.label} screenshot` });
                        }
                      }
                    }} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200" aria-label={`Open private ${view.label.toLowerCase()} screenshot ${onOpenPreview ? "in preview pane" : "in a new tab"}`}>
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

      {audit.isError && <p role="alert" className="text-xs text-amber-100">Saved run history could not be loaded. {audit.error.message}<button type="button" className="ml-2 underline" onClick={() => void audit.refetch()}>Retry</button></p>}
      <p className="text-[10px] leading-relaxed text-zinc-500">Capture sends the saved project preview to a remote browser. AI review may incur a charge. Failed or uncertain outcomes remain visible in saved history; no paid operation is replayed automatically.</p>
      <p className="text-[10px] leading-relaxed text-zinc-500">Activity is retained for this project’s lifetime. Only surviving legacy activity can be imported; missing older events cannot be recovered.</p>
      </div>
    </div>}

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
    <Dialog open={proposalDialogOpen} onOpenChange={open => { if (!open) setProposalDialogOpen(false); }}>
      <DialogContent className="border-zinc-700 bg-zinc-950 text-zinc-100">
        <DialogHeader><DialogTitle>Save a design proposal</DialogTitle><DialogDescription className="text-zinc-400">Attach an image generation that already finished. This does not start a new generation.</DialogDescription></DialogHeader>
        {mediaJobs.isPending && <div role="status" aria-label="Loading completed image generations" className="space-y-2"><div className="h-10 animate-pulse rounded bg-zinc-800" /><div className="h-4 w-2/3 animate-pulse rounded bg-zinc-800" /></div>}
        {mediaJobs.isError && <div role="alert" className="rounded-md border border-amber-900/50 p-3 text-xs text-amber-100">Completed image generations could not be loaded. {mediaJobs.error.message}<Button type="button" size="sm" variant="outline" className="ml-2 border-amber-900" onClick={() => void mediaJobs.refetch()}>Retry</Button></div>}
        {mediaJobs.isSuccess && completedImageJobs.length === 0 && <p className="rounded-md border border-dashed border-zinc-700 p-3 text-xs text-zinc-400">No completed image generations are available to attach.</p>}
        {completedImageJobs.length > 0 && <>
          <label className="grid gap-1.5 text-xs text-zinc-300">Completed image generation
            <select aria-label="Completed image generation" value={selectedMediaJob} onChange={event => { const value = event.target.value; setSelectedMediaJob(value); const job = completedImageJobs.find(item => item.id === value); if (!proposalTitle.trim() && job?.prompt) setProposalTitle(job.prompt.slice(0, 120)); }} className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100">
              <option value="">Choose a saved generation</option>
              {completedImageJobs.map(job => <option key={job.id} value={job.id}>{job.prompt || "Image generation"} · {new Date(job.createdAt).toLocaleDateString()}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs text-zinc-300">Proposal title
            <Input value={proposalTitle} maxLength={120} onChange={event => setProposalTitle(event.target.value)} placeholder="Name this design proposal" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
          </label>
        </>}
        {proposalError && <p role="alert" className="text-xs text-rose-300">{proposalError}</p>}
        <DialogFooter><Button type="button" variant="outline" className="border-zinc-700" onClick={() => setProposalDialogOpen(false)}>Cancel</Button><Button type="button" disabled={!selectedJob || !proposalTitle.trim() || proposalBusy} onClick={() => void createProposal()}>{proposalBusy ? "Saving proposal…" : "Save proposal"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

