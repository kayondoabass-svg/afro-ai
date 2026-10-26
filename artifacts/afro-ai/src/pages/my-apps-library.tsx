import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { AppHandoffContext } from "@/components/app-handoff-context";
import { AppLibraryResponse, AppLibraryEntry, reconcilePublishedApps } from "@/lib/app-handoff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Project, PublishedApp } from "@shared/schema";
import { isSetupBlocked, projectChatUrl, projectRequestError } from "@/lib/fullstack-project";
import { FullstackInfrastructure } from "@/components/fullstack-infrastructure";
import {
  AlertTriangle, ArrowRight, Check, Clock, Copy, ExternalLink, Globe,
  History, Link2, QrCode, Rocket, RotateCcw, Search, Shield, Trash2, Upload,
} from "lucide-react";

type Filter = "all" | "drafts" | "published";
type ConfirmTarget = { kind: "project"; entry: AppLibraryEntry } | { kind: "orphan"; app: PublishedApp };
type DomainTarget = { app: PublishedApp; mode: "connect" | "instructions" };
type Version = { id: number; versionNumber: number; title: string; snapshotReason: string; createdAt: string };

const invalidateLibrary = () => {
  void queryClient.invalidateQueries({ queryKey: ["/api/app-library"] });
  void queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
  void queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
};
const dateLabel = (value: string | Date) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const isLive = (app: PublishedApp) => app.appStatus === "active" && !["customer-unpublished", "deletion-pending", "unpublish-pending"].includes(app.suspendReason || "");
const appUrl = (app: PublishedApp) => app.customDomain && app.customDomainVerified
  ? `https://${app.customDomain}` : `https://${app.subdomain}.afroaigroup.com`;

export default function MyAppsLibraryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const ownerId = user?.id ? String(user.id) : null;
  const reconciledOwner = useRef<string | null>(null);
  const selectionHandled = useRef(false);
  const [reconcileReady, setReconcileReady] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [typedConfirm, setTypedConfirm] = useState("");
  const [unpublishApp, setUnpublishApp] = useState<PublishedApp | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [historyApp, setHistoryApp] = useState<PublishedApp | null>(null);
  const [restoreVersion, setRestoreVersion] = useState<Version | null>(null);
  const [domainTarget, setDomainTarget] = useState<DomainTarget | null>(null);
  const [infrastructureProject, setInfrastructureProject] = useState<Project | null>(null);
  const [domainValue, setDomainValue] = useState("");
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  const { data: library, isLoading, isError, error, refetch } = useQuery<AppLibraryResponse>({
    queryKey: ["/api/app-library"],
    enabled: !!user && reconcileReady,
  });
  const fullstackAccess = useQuery<{ allowed: boolean; reason: string }>({
    queryKey: ["/api/projects/fullstack-access"],
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const initializeMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/initialize`);
      return response.json() as Promise<{ id: number; type: string; name: string; status: string; description?: string }>;
    },
    onSuccess: (project) => {
      invalidateLibrary();
      if (!isSetupBlocked(project as any)) navigate(projectChatUrl(project as any));
    },
    onError: (error) => {
      invalidateLibrary();
      toast({ title: "Setup could not be retried", description: projectRequestError(error).message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!ownerId || reconciledOwner.current === ownerId) return;
    reconciledOwner.current = ownerId;
    let cancelled = false;
    reconcilePublishedApps(ownerId)
      .then((result) => {
        if (!cancelled) {
          setReconcileError((result.failures || 0) > 0 ? `${result.failures} published app(s) still need source recovery.` : null);
          setReconcileReady(true);
        }
      })
      .catch((err: Error) => { if (!cancelled) { setReconcileError(err.message || "Could not reconcile published apps."); setReconcileReady(true); } });
    return () => { cancelled = true; };
  }, [ownerId]);

  const entries = library?.apps || [];
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("appId") || params.get("app");
    const appId = requested ? Number(requested) : NaN;
    if (!requested || !Number.isInteger(appId) || selectionHandled.current) return;
    const entry = entries.find((candidate) => candidate.publishedApps.some((app) => app.id === appId));
    if (!entry) return;
    selectionHandled.current = true;
    setFilter("all");
    setSearch("");
    setExpanded(entry.key);
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-testid="card-library-${entry.key}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    });
  }, [entries]);
  const filtered = useMemo(() => entries.filter((entry) => {
    const hasPublished = entry.publishedApps.length > 0;
    if (filter === "drafts" && (hasPublished || !entry.project)) return false;
    if (filter === "published" && !hasPublished) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [entry.project?.name, entry.project?.description, ...entry.publishedApps.flatMap((app) => [app.title, app.subdomain, app.customDomain])]
      .some((value) => value?.toLowerCase().includes(needle));
  }), [entries, filter, search]);

  const deleteMutation = useMutation({
    mutationFn: async (target: ConfirmTarget) => {
      if (target.kind === "project") {
        await apiRequest("DELETE", `/api/projects/${target.entry.project!.id}`, { confirmation: "DELETE" });
      } else {
        await apiRequest("DELETE", `/api/published-apps/${target.app.id}`, { confirmation: "DELETE" });
      }
    },
    onSuccess: () => {
      invalidateLibrary();
      setConfirmTarget(null);
      setTypedConfirm("");
      toast({ title: "App deleted", description: "The app and its hosted publication have been removed." });
    },
    onError: (err: Error) => {
      invalidateLibrary();
      toast({
        title: "Deletion needs attention",
        description: `${err.message || "Cleanup is incomplete."} Public serving has been blocked. Retry the delete to finish cleanup.`,
        variant: "destructive",
      });
    },
  });
  const unpublishMutation = useMutation({
    mutationFn: (app: PublishedApp) => apiRequest("POST", `/api/published-apps/${app.id}/unpublish`, { confirmation: "UNPUBLISH" }),
    onSuccess: () => { invalidateLibrary(); setUnpublishApp(null); toast({ title: "App unpublished", description: "The source project and version history are preserved." }); },
    onError: (err: Error) => {
      invalidateLibrary();
      toast({ title: "Could not unpublish", description: err.message, variant: "destructive" });
    },
  });
  const recoverMutation = useMutation({
    mutationFn: async (appId: number) => {
      const response = await apiRequest("POST", `/api/published-apps/${appId}/project`);
      return response.json() as Promise<{ project?: { id: number }; conversationId?: number | null; sourceSyncWarning?: string }>;
    },
    onSuccess: (result) => {
      invalidateLibrary();
      if (!result.project?.id || !result.conversationId) {
        toast({ title: "Source recovery incomplete", description: "The project was recovered, but its conversation is unavailable. Refresh My Apps and retry.", variant: "destructive" });
        return;
      }
      if (result.sourceSyncWarning) toast({ title: "Source recovery warning", description: result.sourceSyncWarning });
      navigate(`/chat?projectId=${result.project.id}&conversation=${result.conversationId}`);
    },
    onError: (err: Error) => {
      invalidateLibrary();
      toast({ title: "Could not recover source project", description: err.message, variant: "destructive" });
    },
  });
  const domainMutation = useMutation({
    mutationFn: ({ id, domain }: { id: number; domain: string }) => apiRequest("POST", `/api/published-apps/${id}/connect-domain`, { domain }),
    onSuccess: () => { invalidateLibrary(); setDomainTarget(null); toast({ title: "Domain saved", description: "Follow the DNS instructions in the app details." }); },
    onError: (err: Error) => {
      invalidateLibrary();
      toast({ title: "Could not save domain", description: err.message, variant: "destructive" });
    },
  });
  const removeDomainMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/published-apps/${id}/custom-domain`),
    onSuccess: () => { invalidateLibrary(); setDomainTarget(null); toast({ title: "Domain removed" }); },
    onError: (err: Error) => {
      invalidateLibrary();
      toast({ title: "Could not remove domain", description: err.message, variant: "destructive" });
    },
  });
  const versionsQuery = useQuery<Version[]>({
    queryKey: ["/api/published-apps", historyApp?.id, "versions"],
    enabled: !!historyApp,
    queryFn: async () => {
      const response = await fetch(`/api/published-apps/${historyApp!.id}/versions`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load version history.");
      return response.json();
    },
  });
  const restoreMutation = useMutation({
    mutationFn: ({ appId, versionId }: { appId: number; versionId: number }) => apiRequest("POST", `/api/published-apps/${appId}/restore/${versionId}`),
    onSuccess: () => { invalidateLibrary(); setRestoreVersion(null); toast({ title: "Version restored" }); },
    onError: (err: Error) => {
      invalidateLibrary();
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });
  const createConversationMutation = useMutation({
    mutationFn: async (entry: AppLibraryEntry) => {
      const project = entry.project!;
      const response = await apiRequest("POST", "/api/conversations", { title: project.name, projectId: project.id });
      const conversation = await response.json() as { id?: number };
      if (!conversation.id) throw new Error("A conversation could not be created for this project.");
      return { projectId: project.id, conversationId: conversation.id };
    },
    onSuccess: ({ projectId, conversationId }) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      invalidateLibrary();
      navigate(`/chat?projectId=${projectId}&conversation=${conversationId}`);
    },
    onError: (err: Error) => toast({ title: "Could not open project", description: err.message, variant: "destructive" }),
  });

  const openBuild = (entry: AppLibraryEntry) => {
    if (!entry.project) return;
    const conversation = entry.conversationId;
    if (conversation) navigate(`/chat?projectId=${entry.project.id}&conversation=${conversation}`);
    else createConversationMutation.mutate(entry);
  };
  const copyUrl = async (app: PublishedApp) => {
    try {
      await navigator.clipboard.writeText(appUrl(app));
      setCopiedId(app.id);
      window.setTimeout(() => setCopiedId(null), 1600);
      toast({ title: "Link copied", description: appUrl(app) });
    } catch { toast({ title: "Could not copy link", variant: "destructive" }); }
  };
  const verifyDomain = async (app: PublishedApp) => {
    setVerifyingId(app.id);
    try {
      const response = await apiRequest("POST", `/api/published-apps/${app.id}/verify-domain`);
      const result = await response.json() as { verified?: boolean; message?: string };
      if (!result.verified) throw new Error(result.message || "DNS record is not verified yet.");
      invalidateLibrary();
      setDomainTarget(null);
      toast({ title: "Domain verified", description: "Your custom domain is now live." });
    } catch (err) { toast({ title: "Domain verification pending", description: (err as Error).message, variant: "destructive" }); }
    finally { setVerifyingId(null); }
  };

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="mx-auto max-w-6xl space-y-7 px-4 py-7 sm:px-6 lg:px-8">
        <AppHandoffContext prefilledFields={[]} />
        <header className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8">
          <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full border border-primary/10" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Workspace / Library</p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" data-testid="text-deployments-title">My Apps</h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">Every draft and live version, together. One project, one place to keep building.</p>
            </div>
            <Button onClick={() => navigate("/chat")} className="gap-2 self-start sm:self-auto" data-testid="button-start-building">
              <Rocket className="h-4 w-4" /> Start building
            </Button>
          </div>
        </header>

        {reconcileError && (
          <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">Some existing sites still need to be connected to projects: {reconcileError}</p>
            <Button size="sm" variant="outline" onClick={async () => {
              try {
                const result = await reconcilePublishedApps(ownerId!, true);
                reconciledOwner.current = ownerId;
                setReconcileError((result.failures || 0) > 0 ? `${result.failures} published app(s) still need source recovery.` : null);
              }
              catch (err) { setReconcileError((err as Error).message); }
            }}>Retry recovery</Button>
          </div>
        )}
        <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter apps">
            {(["all", "drafts", "published"] as Filter[]).map((value) => (
              <button key={value} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}
                className={`rounded-full border px-4 py-2 text-sm capitalize transition-colors ${filter === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                data-testid={`filter-${value}`}>
                {value}<span className="ml-2 tabular-nums opacity-70">{value === "all" ? entries.length : value === "drafts" ? entries.filter((e) => !!e.project && !e.publishedApps.length).length : entries.filter((e) => !!e.publishedApps.length).length}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search apps…" className="pl-9" aria-label="Search apps" data-testid="input-search-apps" />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4" aria-label="Loading apps">
            {[0, 1, 2].map((item) => <Card key={item}><CardContent className="space-y-4 p-6"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-72" /><Skeleton className="h-16 w-full" /></CardContent></Card>)}
          </div>
        ) : isError ? (
          <Card role="alert"><CardContent className="space-y-3 p-8 text-center"><h2 className="font-semibold">My Apps could not load</h2><p className="text-sm text-muted-foreground">{(error as Error)?.message || "Try again in a moment."}</p><Button variant="outline" onClick={() => void refetch()}>Retry</Button></CardContent></Card>
        ) : filtered.length ? (
          <div className="space-y-4">
            {filtered.map((entry) => {
              const title = entry.project?.name || entry.publishedApps[0]?.title || "Recovered app";
              const open = expanded === entry.key;
              return (
                <Card key={entry.key} className="overflow-hidden border-border/70 transition-colors hover:border-primary/35" data-testid={`card-library-${entry.key}`}>
                  <CardContent className="p-0">
                    <div className="p-5 sm:p-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${entry.publishedApps.some(isLive) ? "bg-emerald-500/10 text-emerald-500" : "bg-primary/10 text-primary"}`}>
                            {entry.publishedApps.some(isLive) ? <Globe className="h-5 w-5" /> : <Rocket className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="truncate text-lg font-semibold" data-testid={`text-library-title-${entry.key}`}>{title}</h2>
                              {entry.project && <Badge variant="secondary" className="capitalize">{entry.project.status.replace("_", " ")}</Badge>}
                              {entry.publishedApps.map((app) => (
                                <Badge key={app.id} variant="outline" className={isLive(app) ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-amber-500/30 text-amber-700 dark:text-amber-400"}>
                                  {app.suspendReason === "deletion-pending" ? "Cleanup pending" : app.suspendReason === "unpublish-pending" ? "Unpublish pending" : app.suspendReason === "customer-unpublished" ? "Offline" : isLive(app) ? "Live" : "Suspended"}
                                </Badge>
                              ))}
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{entry.project?.description || (entry.publishedApps.length ? "Published website with source controls and deployment history." : "Draft app")}</p>
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {entry.project && <span>Project created {dateLabel(entry.project.createdAt)}</span>}
                              <span>{entry.publishedApps.length} publication{entry.publishedApps.length === 1 ? "" : "s"}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {entry.project ? (
                            entry.project.status === "deletion-pending" ? (
                              <Button size="sm" variant="outline" disabled data-testid={`button-project-cleanup-pending-${entry.project.id}`}>
                                <AlertTriangle className="mr-1.5 h-4 w-4" />Deletion cleanup pending
                              </Button>
                            ) : isSetupBlocked(entry.project) ? (
                              <div className="flex flex-col items-end gap-1">
                                <Button size="sm" onClick={() => initializeMutation.mutate(entry.project!.id)} disabled={!fullstackAccess.data?.allowed || initializeMutation.isPending} data-testid={`button-retry-setup-${entry.project.id}`}>
                                  {initializeMutation.isPending && initializeMutation.variables === entry.project.id ? "Retrying setup…" : "Retry setup"}
                                </Button>
                                {!fullstackAccess.data?.allowed && <span className="max-w-48 text-right text-[10px] text-muted-foreground">{fullstackAccess.data?.reason || "Paid full-stack access required."}</span>}
                              </div>
                            ) : (
                              <Button size="sm" onClick={() => openBuild(entry)} disabled={createConversationMutation.isPending} data-testid={`button-open-build-${entry.key}`}>
                                <Rocket className="mr-1.5 h-4 w-4" />{createConversationMutation.isPending ? "Opening…" : "Open & Build"}
                              </Button>
                            )
                          ) : entry.publishedApps[0] ? (
                            <Button size="sm" onClick={() => recoverMutation.mutate(entry.publishedApps[0].id)} disabled={recoverMutation.isPending} data-testid={`button-recover-${entry.key}`}>
                              <RotateCcw className="mr-1.5 h-4 w-4" />Recover source
                            </Button>
                          ) : null}
                          <Button size="sm" variant="outline" onClick={() => setExpanded(open ? null : entry.key)} data-testid={`button-details-${entry.key}`}>{open ? "Hide details" : "Details"}</Button>
                          {entry.project && <Button size="sm" variant="destructive" onClick={() => { setConfirmTarget({ kind: "project", entry }); setTypedConfirm(""); }} data-testid={`button-delete-project-${entry.project.id}`}><Trash2 className="mr-1.5 h-4 w-4" />Delete</Button>}
                        </div>
                      </div>

                      {entry.publishedApps.map((app) => (
                        <div key={app.id} className="mt-5 rounded-xl border border-border/70 bg-muted/20 p-4">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{app.title || app.subdomain}</h3>{app.customDomain && <Badge variant="outline">{app.customDomainVerified ? "Custom domain" : "Domain pending"}</Badge>}</div>
                              <a href={appUrl(app)} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-mono text-xs text-primary hover:underline" data-testid={`link-domain-${app.id}`}>{appUrl(app)}<ExternalLink className="h-3 w-3 shrink-0" /></a>
                              <p className="mt-1 text-xs text-muted-foreground">Published {dateLabel(app.createdAt)} · {app.suspendReason === "customer-unpublished" ? "Offline by request" : app.suspendReason === "deletion-pending" ? "Public serving blocked; cleanup can be retried" : app.suspendReason === "unpublish-pending" ? "Unpublish cleanup is incomplete; retry below" : isLive(app) ? "Publicly available" : `Suspended${app.suspendReason ? ` · ${app.suspendReason}` : ""}`}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" onClick={() => copyUrl(app)} data-testid={`button-copy-domain-${app.id}`}>{copiedId === app.id ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}{copiedId === app.id ? "Copied" : "Share link"}</Button>
                              <Button size="sm" variant="outline" onClick={() => setHistoryApp(app)} data-testid={`button-history-${app.id}`}><History className="mr-1.5 h-3.5 w-3.5" />History</Button>
                              {entry.project && <Button size="sm" variant="outline" onClick={() => navigate(`/dashboard/auth?projectId=${entry.project!.id}&appId=${app.id}`)} data-testid={`button-add-auth-${app.id}`}><Shield className="mr-1.5 h-3.5 w-3.5" />Add authentication</Button>}
                              <Button size="sm" variant="outline" onClick={() => { setDomainValue(app.customDomain || ""); setDomainTarget({ app, mode: app.customDomain && !app.customDomainVerified ? "instructions" : "connect" }); }} data-testid={`button-connect-domain-${app.id}`}><Link2 className="mr-1.5 h-3.5 w-3.5" />Domain</Button>
                              {app.suspendReason === "unpublish-pending" ? <Button size="sm" variant="outline" disabled={unpublishMutation.isPending} onClick={() => unpublishMutation.mutate(app)} data-testid={`button-retry-unpublish-${app.id}`}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Retry unpublish</Button> : isLive(app) ? <Button size="sm" variant="outline" onClick={() => setUnpublishApp(app)} data-testid={`button-unpublish-${app.id}`}><Upload className="mr-1.5 h-3.5 w-3.5 rotate-180" />Unpublish</Button> : null}
                              {!entry.project && <Button size="sm" variant="destructive" onClick={() => { setConfirmTarget({ kind: "orphan", app }); setTypedConfirm(""); }} data-testid={`button-delete-orphan-${app.id}`}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete</Button>}
                            </div>
                          </div>
                          {app.suspendReason === "deletion-pending" && (
                            <div role="alert" className="mt-3 flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                              <span className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />Cleanup did not finish. Public serving is blocked.</span>
                              <Button size="sm" variant="destructive" onClick={() => { setConfirmTarget(entry.project ? { kind: "project", entry } : { kind: "orphan", app }); setTypedConfirm(""); }} data-testid={`button-retry-cleanup-${app.id}`}>Retry delete</Button>
                            </div>
                          )}
                          {open && (
                            <div className="mt-4 grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Hosting</p><p className="mt-1 text-sm">Static HTML · Cloudflare · SSL/TLS active</p></div>
                              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Last updated</p><p className="mt-1 text-sm">{dateLabel(app.updatedAt)}</p></div>
                              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">QR / Share</p><a className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline" href={appUrl(app)} target="_blank" rel="noreferrer"><QrCode className="h-4 w-4" />Open website <ArrowRight className="h-3 w-3" /></a></div>
                              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Custom domain</p><p className="mt-1 truncate text-sm">{app.customDomain || "Not connected"}</p>{app.customDomain && !app.customDomainVerified && <Button className="mt-2 h-7" size="sm" variant="outline" disabled={verifyingId === app.id} onClick={() => void verifyDomain(app)}>{verifyingId === app.id ? "Checking…" : "Verify DNS"}</Button>}</div>
                            </div>
                          )}
                        </div>
                      ))}
                      {entry.project?.type === "fullstack" && (
                        <Button className="mt-4" size="sm" variant="outline" onClick={() => setInfrastructureProject(entry.project)} data-testid={`button-infrastructure-${entry.project.id}`}>
                          Database infrastructure
                        </Button>
                      )}
                      {entry.project && isSetupBlocked(entry.project) && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          {entry.project.status === "setup_failed"
                            ? "Starter files could not be saved. Retry setup on this project; do not create another."
                            : "Starter setup is initializing. If progress has stalled, safely Retry setup on this same project. If setup is still running, the server will ask you to wait."}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : entries.length ? (
          <Card><CardContent className="p-12 text-center"><Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><h2 className="font-semibold">No matching apps</h2><p className="mt-1 text-sm text-muted-foreground">Try another search or filter.</p></CardContent></Card>
        ) : (
          <Card className="border-dashed"><CardContent className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Rocket className="h-7 w-7" /></div>
            <h2 className="text-lg font-semibold">Your library starts here</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Create your first project in chat. Drafts and live sites will stay together in My Apps.</p>
            <Button className="mt-5" onClick={() => navigate("/chat")}>Start building</Button>
          </CardContent></Card>
        )}
      </div>

      <Dialog open={!!confirmTarget} onOpenChange={(open) => { if (!open) { setConfirmTarget(null); setTypedConfirm(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" />Delete app and publication?</DialogTitle>
            <DialogDescription>This permanently removes {confirmTarget?.kind === "project" ? confirmTarget.entry.project?.name : confirmTarget?.app.title}. Public serving is blocked as cleanup starts. Type DELETE to confirm. If cleanup is incomplete, retry here to finish.</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={typedConfirm} onChange={(event) => setTypedConfirm(event.target.value)} placeholder="Type DELETE" aria-label="Type DELETE to confirm" data-testid="input-library-delete-confirm" />
          <DialogFooter><Button variant="outline" onClick={() => { setConfirmTarget(null); setTypedConfirm(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={typedConfirm !== "DELETE" || deleteMutation.isPending} onClick={() => confirmTarget && deleteMutation.mutate(confirmTarget)} data-testid="button-confirm-library-delete">{deleteMutation.isPending ? "Deleting…" : "Delete permanently"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!infrastructureProject} onOpenChange={(open) => { if (!open) setInfrastructureProject(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{infrastructureProject?.name} · Infrastructure</DialogTitle><DialogDescription>Manage the project database separately from source files and hosting.</DialogDescription></DialogHeader>
          {infrastructureProject && <FullstackInfrastructure key={infrastructureProject.id} project={infrastructureProject} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!unpublishApp} onOpenChange={(open) => { if (!open) setUnpublishApp(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Take this app offline?</DialogTitle><DialogDescription>{unpublishApp?.title} will stop serving publicly. Its source project and history stay in My Apps.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setUnpublishApp(null)}>Keep published</Button><Button variant="destructive" disabled={unpublishMutation.isPending} onClick={() => unpublishApp && unpublishMutation.mutate(unpublishApp)} data-testid="button-confirm-unpublish">{unpublishMutation.isPending ? "Unpublishing…" : "Unpublish"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!historyApp} onOpenChange={(open) => { if (!open) { setHistoryApp(null); setRestoreVersion(null); } }}>
        <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto"><DialogHeader><DialogTitle>Version history</DialogTitle><DialogDescription>{historyApp?.title} · snapshots saved when you publish or restore.</DialogDescription></DialogHeader>
          {versionsQuery.isLoading ? <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div> : versionsQuery.isError ? <div role="alert" className="space-y-2 text-sm"><p>{(versionsQuery.error as Error).message}</p><Button variant="outline" onClick={() => void versionsQuery.refetch()}>Retry</Button></div> : versionsQuery.data?.length ? <div className="space-y-2">{versionsQuery.data.map((version) => <div key={version.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-medium">v{version.versionNumber} · {version.title}</p><p className="text-xs text-muted-foreground">{dateLabel(version.createdAt)} · {version.snapshotReason}</p></div><Button size="sm" variant="outline" onClick={() => setRestoreVersion(version)}><RotateCcw className="mr-1 h-3.5 w-3.5" />Restore</Button></div>)}</div> : <div className="py-6 text-center text-sm text-muted-foreground"><Clock className="mx-auto mb-2 h-6 w-6" />No previous versions yet.</div>}
        </DialogContent>
      </Dialog>
      <Dialog open={!!restoreVersion} onOpenChange={(open) => { if (!open) setRestoreVersion(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Restore version {restoreVersion?.versionNumber}?</DialogTitle><DialogDescription>The current published version will be saved to history before this snapshot goes live.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setRestoreVersion(null)}>Cancel</Button><Button disabled={restoreMutation.isPending} onClick={() => historyApp && restoreVersion && restoreMutation.mutate({ appId: historyApp.id, versionId: restoreVersion.id })}>Restore version</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!domainTarget} onOpenChange={(open) => { if (!open) setDomainTarget(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{domainTarget?.app.customDomain ? "Custom domain" : "Connect a custom domain"}</DialogTitle><DialogDescription>Connect a hostname you already own. Domain purchases happen separately.</DialogDescription></DialogHeader>
          {domainTarget?.mode === "connect" ? <div className="space-y-3"><Input value={domainValue} onChange={(event) => setDomainValue(event.target.value)} placeholder="www.example.com" aria-label="Custom domain" /><p className="text-xs text-muted-foreground">Add a CNAME record pointing to afroaigroup.com, then verify after DNS has propagated.</p></div> : <div className="rounded-lg border bg-muted/30 p-4 text-sm"><p>CNAME · {domainTarget?.app.customDomain?.startsWith("www.") ? "www" : "@"} → afroaigroup.com</p><p className="mt-2 text-xs text-muted-foreground">DNS changes may take up to 24 hours.</p></div>}
          <DialogFooter>{domainTarget?.app.customDomain && <Button variant="destructive" onClick={() => removeDomainMutation.mutate(domainTarget.app.id)} disabled={removeDomainMutation.isPending}>Remove domain</Button>}
            <Button variant="outline" onClick={() => setDomainTarget(null)}>Close</Button>
            {domainTarget?.mode === "connect" ? <Button disabled={!domainValue.trim() || domainMutation.isPending} onClick={() => domainTarget && domainMutation.mutate({ id: domainTarget.app.id, domain: domainValue.trim() })}>Save domain</Button> : domainTarget?.app.customDomain && !domainTarget.app.customDomainVerified ? <Button disabled={verifyingId === domainTarget.app.id} onClick={() => void verifyDomain(domainTarget.app)}>{verifyingId === domainTarget.app.id ? "Checking…" : "Verify DNS"}</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
