import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AppLibraryResponse, reconcilePublishedApps } from "@/lib/app-handoff";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { ArrowRight, Folder, Globe, Plus, Rocket, Sparkles } from "lucide-react";
import afroLogo from "@assets/IMG_5719_1771852498362.png";
import { FULLSTACK_SOURCE_NOTICE, isSetupBlocked, projectChatUrl, projectRequestError } from "@/lib/fullstack-project";

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showNewProject, setShowNewProject] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<{ plan: string } | null>(null);
  const reconciledOwner = useRef<string | null>(null);
  const [reconcileReady, setReconcileReady] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const form = useForm({ defaultValues: { name: "", description: "", type: "website" } });
  const ownerId = user?.id ? String(user.id) : null;
  const { data: library, isLoading, isError, error, refetch } = useQuery<AppLibraryResponse>({ queryKey: ["/api/app-library"], enabled: !!user && reconcileReady });
  const fullstackAccess = useQuery<{ allowed: boolean; reason: string }>({ queryKey: ["/api/projects/fullstack-access"], staleTime: 0, refetchOnWindowFocus: true });
  const canCreateFullstack = fullstackAccess.isSuccess && !fullstackAccess.isFetching && fullstackAccess.data.allowed;
  const accessExplanation = fullstackAccess.isError ? "Could not verify full-stack access. Retry the access check." :
    fullstackAccess.isPending || fullstackAccess.isFetching ? "Checking paid full-stack access…" :
    fullstackAccess.data?.reason || "Full-stack starters require a paid plan.";
  const entries = library?.apps || [];

  useEffect(() => {
    if (!ownerId || reconciledOwner.current === ownerId) return;
    reconciledOwner.current = ownerId;
    let cancelled = false;
    reconcilePublishedApps(ownerId)
      .then((result) => {
        if (!cancelled) {
          setReconcileError((result.failures || 0) > 0 ? `${result.failures} published app(s) still need recovery.` : null);
          setReconcileReady(true);
        }
      })
      .catch((error: Error) => { if (!cancelled) { reconciledOwner.current = null; setReconcileError(error.message); setReconcileReady(true); } });
    return () => { cancelled = true; };
  }, [ownerId]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const plan = params.get("plan");
    if (payment === "success" && plan) {
      setPaymentSuccess({ plan });
      window.history.replaceState({}, "", "/dashboard");
    } else if (payment === "pending") {
      toast({ title: t("dashboard.paymentPending"), description: t("dashboard.paymentPendingDesc") });
      window.history.replaceState({}, "", "/dashboard");
    } else if (payment === "failed") {
      toast({ title: t("dashboard.paymentNotCompleted"), description: params.get("reason") || t("dashboard.paymentDefaultReason"), variant: "destructive" });
      window.history.replaceState({}, "", "/dashboard");
    }
  }, []);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; type: string }) => {
      const response = await apiRequest("POST", "/api/projects", data);
      return response.json();
    },
    onSuccess: (project: any) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/app-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      setShowNewProject(false);
      form.reset();
      toast({ title: t("dashboard.projectCreated"), description: t("dashboard.projectCreatedDesc") });
      if (project.type === "fullstack" && !isSetupBlocked(project)) navigate(projectChatUrl(project));
    },
    onError: (error) => {
      const result = projectRequestError(error);
      if (result.project?.id) {
        queryClient.setQueryData<AppLibraryResponse>(["/api/app-library"], (old) => ({
          apps: [
            { key: `project-${result.project!.id}`, project: result.project!, conversationId: null, publishedApps: [] },
            ...(old?.apps || []).filter((entry) => entry.project?.id !== result.project!.id),
          ],
        }));
      }
      void queryClient.invalidateQueries({ queryKey: ["/api/app-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      if (result.project?.id) { setShowNewProject(false); form.reset(); }
      toast({
        title: t("dashboard.error"),
        description: `${result.message}${result.project?.id ? " Your project was created. Use Retry setup on its My Apps card instead of creating a duplicate." : ""}`,
        variant: "destructive",
      });
    },
  });
  const onSubmit = (data: { name: string; description: string; type: string }) => {
    if (data.type === "fullstack" && !canCreateFullstack) {
      toast({ title: "Full-stack access required", description: accessExplanation, variant: "destructive" });
      return;
    }
    createMutation.mutate(data);
  };
  const firstName = user?.firstName || t("overview.defaultUser");
  const publishedCount = entries.reduce((count, entry) => count + entry.publishedApps.length, 0);

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {paymentSuccess && <div className="flex items-start justify-between gap-4 rounded-xl border border-primary/35 bg-primary/10 p-4"><div><p className="font-semibold capitalize">{t("dashboard.paymentWelcome", { plan: paymentSuccess.plan })}</p><p className="mt-1 text-sm text-muted-foreground">{t("dashboard.paymentUpgradeSuccess", { plan: paymentSuccess.plan })}</p></div><Button variant="ghost" size="sm" onClick={() => setPaymentSuccess(null)}>Dismiss</Button></div>}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12"><AvatarImage src={user?.profileImageUrl || undefined} /><AvatarFallback className="bg-primary/10 font-semibold text-primary">{firstName.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
            <div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold" data-testid="text-welcome">{t("dashboard.welcome")} {firstName}</h1><Badge variant="secondary" className="capitalize text-xs">{(user as any)?.plan || "starter"}</Badge></div><p className="text-sm text-muted-foreground">Your workspace at a glance. Build, publish, then keep everything in My Apps.</p></div>
          </div>
          <Button onClick={() => setShowNewProject(true)} data-testid="button-new-project"><Plus className="mr-1.5 h-4 w-4" />{t("dashboard.newProject")}</Button>
        </header>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card><CardContent className="flex items-center gap-4 p-5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Folder className="h-5 w-5" /></span><div><p className="text-2xl font-bold">{entries.length}</p><p className="text-xs text-muted-foreground">Apps in My Apps</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-4 p-5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500"><Globe className="h-5 w-5" /></span><div><p className="text-2xl font-bold">{publishedCount}</p><p className="text-xs text-muted-foreground">Publications</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-4 p-5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><img src={afroLogo} alt="Afro AI" className="h-7 w-7 object-contain" /></span><div><p className="text-lg font-bold">{t("dashboard.unlimited")}</p><p className="text-xs text-muted-foreground">{t("dashboard.aiChats")}</p></div></CardContent></Card>
        </div>
        {reconcileError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"><p className="text-sm text-destructive">Could not fully restore your live-site projects: {reconcileError}</p><Button size="sm" variant="outline" onClick={async () => { try { const result = await reconcilePublishedApps(ownerId!, true); setReconcileError((result.failures || 0) > 0 ? `${result.failures} published app(s) still need recovery.` : null); } catch (error) { setReconcileError((error as Error).message); } }}>Retry</Button></div>}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Your workspace</p><h2 className="mt-1 text-xl font-semibold">Recent apps</h2></div><Link href="/deployments" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" data-testid="link-my-apps">Open My Apps <ArrowRight className="h-4 w-4" /></Link></div>
          {isLoading ? <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map((i) => <Card key={i}><CardContent className="space-y-3 p-5"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-64" /></CardContent></Card>)}</div> :
            isError ? <Card role="alert"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5"><p className="text-sm text-destructive">{(error as Error)?.message || "Apps could not load."}</p><Button variant="outline" onClick={() => void refetch()}>Retry</Button></CardContent></Card> :
            entries.length ? <div className="grid gap-3 sm:grid-cols-2">
              {entries.slice(0, 4).map((entry) => {
                const projectName = entry.project?.name || entry.publishedApps[0]?.title || "Recovered app";
                const live = entry.publishedApps.some((app) => app.appStatus === "active" && !["customer-unpublished", "deletion-pending", "unpublish-pending"].includes(app.suspendReason || ""));
                return <Link key={entry.key} href="/deployments" className="group block" data-testid={`card-recent-app-${entry.key}`}><Card className="h-full transition-colors group-hover:border-primary/40"><CardContent className="flex items-start gap-4 p-5"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${live ? "bg-emerald-500/10 text-emerald-500" : "bg-primary/10 text-primary"}`}>{live ? <Globe className="h-5 w-5" /> : <Rocket className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{projectName}</h3><Badge variant="secondary" className="text-[10px]">{entry.publishedApps.length ? (live ? "Published" : "Offline") : "Draft"}</Badge></div><p className="mt-1 truncate text-sm text-muted-foreground">{entry.project?.description || entry.publishedApps[0]?.subdomain || "Open in My Apps to manage this project."}</p></div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" /></CardContent></Card></Link>;
              })}
            </div> : <Card className="border-dashed"><CardContent className="p-8 text-center"><Sparkles className="mx-auto mb-3 h-7 w-7 text-primary" /><h3 className="font-semibold">{t("dashboard.noProjects")}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{t("dashboard.noProjectsDesc")}</p><Button className="mt-4" onClick={() => setShowNewProject(true)}>{t("dashboard.createFirst")}</Button></CardContent></Card>}
        </section>
        <Card className="border-primary/20 bg-primary/5"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">One library for every app</p><p className="mt-1 text-sm text-muted-foreground">Find drafts, live websites, domain controls and history together.</p></div><Button variant="outline" onClick={() => navigate("/deployments")}>Go to My Apps <ArrowRight className="ml-2 h-4 w-4" /></Button></CardContent></Card>
      </div>
      <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
        <DialogContent><DialogHeader><DialogTitle>{t("dashboard.createTitle")}</DialogTitle><DialogDescription>{t("dashboard.createDesc")}</DialogDescription></DialogHeader>
          <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel>{t("dashboard.projectName")}</FormLabel><FormControl><Input placeholder={t("dashboard.projectNamePlaceholder")} {...field} data-testid="input-project-name" /></FormControl></FormItem>} />
            <FormField control={form.control} name="description" render={({ field }) => <FormItem><FormLabel>{t("dashboard.description")}</FormLabel><FormControl><Textarea placeholder={t("dashboard.descPlaceholder")} className="resize-none" {...field} data-testid="input-project-description" /></FormControl></FormItem>} />
            <FormField control={form.control} name="type" render={({ field }) => <FormItem><FormLabel>{t("dashboard.type")}</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger data-testid="select-project-type"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="website">{t("dashboard.website")}</SelectItem><SelectItem value="mobile_app">{t("dashboard.mobileApp")}</SelectItem><SelectItem value="fullstack">Full-stack starter · paid</SelectItem></SelectContent></Select></FormItem>} />
            <div className="space-y-2 rounded-md border border-primary/25 bg-primary/5 p-3 text-sm"><p className="font-medium">Full-stack starter · React + Workers/Hono + D1</p><p className="text-xs text-muted-foreground">{FULLSTACK_SOURCE_NOTICE}</p>{!canCreateFullstack && <p className="text-xs text-muted-foreground" role="status">{accessExplanation}</p>}{fullstackAccess.isError && <Button type="button" size="sm" variant="outline" onClick={() => void fullstackAccess.refetch()}>Retry access check</Button>}{!canCreateFullstack && !fullstackAccess.isPending && <Button type="button" size="sm" variant="outline" onClick={() => navigate("/pricing")}>View paid plans</Button>}</div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending || (form.watch("type") === "fullstack" && !canCreateFullstack)} data-testid="button-submit-project">{createMutation.isPending ? t("dashboard.creating") : t("dashboard.createProject")}</Button>
          </form></Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
