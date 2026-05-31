import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import {
  Plus,
  Globe,
  Smartphone,
  MoreHorizontal,
  Folder,
  Clock,
  Trash2,
  ArrowRight,
  Sparkles,
  Lightbulb,
  Rocket,
  MessageSquare,
  ScanSearch,
} from "lucide-react";
import afroLogo from "@assets/IMG_5719_1771852498362.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import type { Project, PublishedApp } from "@shared/schema";

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState<{ plan: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const plan = params.get("plan");
    if (payment === "success" && plan) {
      setPaymentSuccess({ plan });
      window.history.replaceState({}, "", "/");
    } else if (payment === "pending") {
      toast({ title: t("dashboard.paymentPending"), description: t("dashboard.paymentPendingDesc"), variant: "default" });
      window.history.replaceState({}, "", "/");
    } else if (payment === "failed") {
      const reason = params.get("reason") || t("dashboard.paymentDefaultReason");
      toast({ title: t("dashboard.paymentNotCompleted"), description: reason, variant: "destructive" });
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: publishedApps } = useQuery<PublishedApp[]>({
    queryKey: ["/api/published-apps"],
  });

  const userPlan = (user as any)?.plan || "starter";

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; type: string }) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowNewProject(false);
      toast({ title: t("dashboard.projectCreated"), description: t("dashboard.projectCreatedDesc") });
    },
    onError: () => {
      toast({ title: t("dashboard.error"), description: t("dashboard.createError"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("DELETE", `/api/projects/${id}`);
      try { return await r.json(); } catch { return { ok: true, removedPublished: [] }; }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      const live = (data?.removedPublished || []) as { subdomain: string }[];
      if (live.length > 0) {
        toast({
          title: t("dashboard.projectAndSiteDeleted"),
          description: t("dashboard.tookDownSites", { count: live.length, list: live.map(l => l.subdomain + ".afroaigroup.com").join(", ") }),
        });
      } else {
        toast({ title: t("dashboard.projectDeleted") });
      }
      setProjectToDelete(null);
      setDeleteConfirmText("");
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.deleteFailed"), description: err?.message || t("dashboard.couldNotDelete"), variant: "destructive" });
    },
  });

  const matchingLiveSites = (publishedApps || []).filter(
    a => projectToDelete && a.title === projectToDelete.name
  );

  const form = useForm({
    defaultValues: { name: "", description: "", type: "website" },
  });

  const onSubmit = (data: { name: string; description: string; type: string }) => {
    createMutation.mutate(data);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "mobile_app": return <Smartphone className="w-4 h-4" />;
      case "website": return <Globe className="w-4 h-4" />;
      default: return <Folder className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published": return "bg-green-500/10 text-green-500";
      case "in_progress": return "bg-primary/10 text-primary";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const handleOpenProject = (project: Project) => {
    navigate(`/chat?projectId=${project.id}&project=${encodeURIComponent(project.name)}&type=${encodeURIComponent(project.type)}&description=${encodeURIComponent(project.description || "")}`);
  };

  const firstName = user?.firstName || t("overview.defaultUser");

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Plan upgrade success banner */}
        {paymentSuccess && (
          <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-5 flex items-start gap-4">
            <Rocket className="w-6 h-6 text-yellow-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-yellow-300 capitalize">
                {t("dashboard.paymentWelcome", { plan: paymentSuccess.plan })}
              </p>
              <p className="text-sm text-yellow-200/70 mt-1">
                {t("dashboard.paymentUpgradeSuccess", { plan: paymentSuccess.plan })}
              </p>
            </div>
            <button
              onClick={() => setPaymentSuccess(null)}
              className="text-yellow-400/60 hover:text-yellow-300 text-xl leading-none"
              data-testid="button-dismiss-payment-success"
            >
              ×
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="w-12 h-12">
              <AvatarImage src={user?.profileImageUrl || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {firstName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold" data-testid="text-welcome">
                  {t("dashboard.welcome")} {firstName}
                </h1>
                <Badge variant={userPlan === "starter" ? "secondary" : "default"} className="capitalize text-xs" data-testid="badge-user-plan">
                  {userPlan}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
            </div>
          </div>
          <Button onClick={() => setShowNewProject(true)} data-testid="button-new-project">
            <Plus className="w-4 h-4" />
            {t("dashboard.newProject")}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Folder className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-projects">{projects?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("dashboard.totalProjects")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <Rocket className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-published-projects">
                  {publishedApps?.length ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">{t("dashboard.published")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <img src={afroLogo} alt="AI" className="w-7 h-7 object-contain" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-ai-chats">{t("dashboard.unlimited")}</p>
                <p className="text-xs text-muted-foreground">{t("dashboard.aiChats")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {publishedApps && publishedApps.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" data-testid="text-live-sites-heading">
              <Globe className="w-5 h-5 text-green-500" />
              {t("dashboard.liveSites")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {publishedApps.slice(0, 6).map((app) => (
                <Card key={app.id} className="hover-elevate" data-testid={`card-published-${app.id}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${app.appStatus === "suspended" ? "bg-red-500/10" : "bg-green-500/10"}`}>
                      <Globe className={`w-4 h-4 ${app.appStatus === "suspended" ? "text-red-500" : "text-green-500"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{app.title || app.subdomain}</p>
                      <a
                        href={`https://${app.subdomain}.afroaigroup.com`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline truncate block"
                        data-testid={`link-published-url-${app.id}`}
                      >
                        {app.subdomain}.afroaigroup.com
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold mb-4" data-testid="text-projects-heading">{t("dashboard.yourProjects")}</h2>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6 space-y-4">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : projects && projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  className="hover-elevate group cursor-pointer"
                  onClick={() => handleOpenProject(project)}
                  data-testid={`card-project-${project.id}`}
                >
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          {getTypeIcon(project.type)}
                        </div>
                        <h3 className="font-semibold truncate">{project.name}</h3>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ visibility: "visible" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectToDelete(project);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t("dashboard.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {project.description || t("dashboard.noDescription")}
                    </p>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Badge variant="secondary" className={getStatusColor(project.status)}>
                        {project.status}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {new Date(project.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenProject(project);
                      }}
                      data-testid={`button-build-project-${project.id}`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {t("dashboard.openAndBuild")}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <Card className="animate-shimmer">
                <CardContent className="p-12 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-pulse-gold">
                    <img src={afroLogo} alt="Afro AI" className="w-10 h-10 object-contain" />
                  </div>
                  <h3 className="text-lg font-semibold">{t("dashboard.noProjects")}</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    {t("dashboard.noProjectsDesc")}
                  </p>
                  <Button onClick={() => setShowNewProject(true)} data-testid="button-create-first">
                    <Plus className="w-4 h-4" />
                    {t("dashboard.createFirst")}
                  </Button>
                </CardContent>
              </Card>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  {t("dashboard.quickStartIdeas")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { icon: Globe, title: t("dashboard.ideaBusinessWebsite"), desc: t("dashboard.ideaBusinessWebsiteDesc"), type: "website" },
                    { icon: Smartphone, title: t("dashboard.mobileApp"), desc: t("dashboard.ideaMobileAppDesc"), type: "mobile_app" },
                    { icon: Rocket, title: t("dashboard.ideaPortfolio"), desc: t("dashboard.ideaPortfolioDesc"), type: "website" },
                    { icon: MessageSquare, title: t("dashboard.ideaBlog"), desc: t("dashboard.ideaBlogDesc"), type: "website" },
                    { icon: ScanSearch, title: t("dashboard.ideaEcommerce"), desc: t("dashboard.ideaEcommerceDesc"), type: "website" },
                    { icon: Sparkles, title: t("dashboard.ideaLanding"), desc: t("dashboard.ideaLandingDesc"), type: "website" },
                  ].map((idea, i) => (
                    <Card
                      key={i}
                      className="hover-elevate cursor-pointer group"
                      onClick={() => {
                        navigate(`/chat?project=${encodeURIComponent(idea.title)}&type=${idea.type}&description=${encodeURIComponent(idea.desc)}`);
                      }}
                      data-testid={`card-quickstart-${i}`}
                    >
                      <CardContent className="p-4 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <idea.icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{idea.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{idea.desc}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.createTitle")}</DialogTitle>
            <DialogDescription>{t("dashboard.createDesc")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dashboard.projectName")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("dashboard.projectNamePlaceholder")} {...field} data-testid="input-project-name" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dashboard.description")}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t("dashboard.descPlaceholder")} className="resize-none" {...field} data-testid="input-project-description" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dashboard.type")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-project-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="website">{t("dashboard.website")}</SelectItem>
                        <SelectItem value="mobile_app">{t("dashboard.mobileApp")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-project">
                {createMutation.isPending ? t("dashboard.creating") : t("dashboard.createProject")}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!projectToDelete}
        onOpenChange={(open) => { if (!open) { setProjectToDelete(null); setDeleteConfirmText(""); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">{t("dashboard.deleteConfirmTitle", { name: projectToDelete?.name || "" })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>{t("dashboard.deleteConfirmBody")} <strong>{t("dashboard.cannotBeUndone")}</strong></p>
                {matchingLiveSites.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 space-y-2">
                    <p className="font-semibold text-destructive">{t("dashboard.alsoTakeDownSites", { count: matchingLiveSites.length })}</p>
                    <ul className="list-disc list-inside text-xs">
                      {matchingLiveSites.map(a => (
                        <li key={a.id} className="font-mono" data-testid={`text-live-site-${a.id}`}>
                          {a.subdomain}.afroaigroup.com
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">{t("dashboard.visitorsSeeNotFound")}</p>
                  </div>
                )}
                <div className="pt-1">
                  <p className="text-xs font-medium mb-1.5">{t("dashboard.typeToConfirmPrefix")} <strong className="font-mono bg-muted px-1.5 py-0.5 rounded text-destructive">DELETE</strong> {t("dashboard.typeToConfirmSuffix")}</p>
                  <Input
                    autoFocus
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="font-mono"
                    data-testid="input-confirm-delete"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-project">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={deleteConfirmText.trim() !== "DELETE" || deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (projectToDelete && deleteConfirmText.trim() === "DELETE") {
                  deleteMutation.mutate(projectToDelete.id);
                }
              }}
              data-testid="button-confirm-delete-project"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {deleteMutation.isPending ? t("dashboard.deleting") : (matchingLiveSites.length > 0 ? t("dashboard.deleteEverything") : t("dashboard.deleteProject"))}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
