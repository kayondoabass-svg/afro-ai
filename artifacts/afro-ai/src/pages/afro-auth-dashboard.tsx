import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { authAdminRequest } from "@/lib/afro-auth-admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, ShieldCheck, ArrowRight, KeyRound } from "lucide-react";
import type { Project, PublishedApp } from "@shared/schema";

interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  plan: string;
  created_at: number;
}

export default function AfroAuthDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const contextOpenedRef = useRef(false);
  const searchParams = new URLSearchParams(window.location.search);
  const requestedApp = searchParams.get("appId") || searchParams.get("app");
  const hasHandoffContext = searchParams.has("projectId") || !!requestedApp;
  const requestedProjectId = Number(searchParams.get("projectId"));
  const requestedAppId = Number(requestedApp);

  const { data: ownedProjects, isLoading: projectsLoading, isError: projectsError } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!user,
  });
  const { data: ownedApps, isLoading: appsLoading, isError: appsError } = useQuery<PublishedApp[]>({
    queryKey: ["/api/published-apps"],
    enabled: !!user,
  });

  const { data, isLoading, error, refetch } = useQuery<{ tenants: TenantSummary[] }>({
    queryKey: ["/cf-auth/v1/admin/tenants"],
    queryFn: () => authAdminRequest("/cf-auth/v1/admin/tenants"),
    enabled: !!user,
  });

  const tenants = data?.tenants || [];
  const selectedProject = Number.isInteger(requestedProjectId) && requestedProjectId > 0
    ? ownedProjects?.find((project) => project.id === requestedProjectId)
    : undefined;
  const selectedApp = Number.isInteger(requestedAppId) && requestedAppId > 0
    ? ownedApps?.find((app) => app.id === requestedAppId)
    : undefined;
  const { data: library, isLoading: libraryLoading, isError: libraryError } = useQuery<{
    apps: { project: Project | null; publishedApps: PublishedApp[] }[];
  }>({
    queryKey: ["/api/app-library"],
    enabled: !!user && hasHandoffContext,
  });
  const contextLoading = hasHandoffContext && (
    authLoading || !user || projectsLoading || appsLoading ||
    libraryLoading
  );
  const contextError = projectsError || appsError || libraryError;
  const ownedPair = library?.apps.some((entry) =>
    entry.project?.id === requestedProjectId &&
    entry.publishedApps.some((app) => app.id === requestedAppId)
  );
  const validHandoff = !!selectedProject && !!selectedApp && !!ownedPair && !contextError;
  const tenantUrl = (tenantId: string) =>
    `/dashboard/auth/${tenantId}${validHandoff && selectedApp ? `?appId=${selectedApp.id}` : ""}`;

  const createMutation = useMutation({
    mutationFn: async (projectName: string) => {
      return authAdminRequest("/cf-auth/v1/admin/tenants", projectName) as Promise<TenantSummary>;
    },
    onSuccess: (tenant) => {
      queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants"] });
      setCreateOpen(false);
      setName("");
      toast({ title: "Project created", description: `${tenant.name} created. Add and verify its website domain next; login is not enabled automatically.` });
      setLocation(tenantUrl(tenant.id));
    },
    onError: (err: any) => {
      toast({ title: "Couldn't create project", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (contextOpenedRef.current || authLoading || !user || contextLoading || !requestedProjectId || !requestedAppId) return;
    contextOpenedRef.current = true;
    if (validHandoff && selectedProject) {
      setName(selectedProject.name);
      setCreateOpen(true);
    }
  }, [authLoading, user, contextLoading, requestedProjectId, requestedAppId, validHandoff, selectedProject]);

  if (authLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-12 text-center">
        <ShieldCheck className="h-12 w-12 mx-auto text-primary mb-4" />
        <h1 className="text-2xl font-bold mb-2" data-testid="text-signin-required">Sign in to manage Afro Auth</h1>
        <p className="text-muted-foreground mb-6">You need an Afro AI account to create projects.</p>
        <Button onClick={() => setLocation("/login?redirect=/dashboard/auth")} data-testid="button-signin">
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Afro Auth projects</h1>
          <p className="text-muted-foreground mt-1">
            Each project gets its own login system, API keys, and user list.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-new-project">
          <Plus className="h-4 w-4 mr-2" /> New project
        </Button>
      </div>

      <Card className="mb-6 border-primary/20 bg-primary/[0.035]">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Setup guide</p>
            <h2 className="mt-1 font-semibold">From website proof to a verified customer session</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Follow the full sequence for domain ownership, allowed origins, one-time server keys, customer email confirmation, and live session checks.
            </p>
          </div>
          <Button variant="outline" asChild className="shrink-0">
            <Link href="/docs/auth#start">
              Read setup guide <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {hasHandoffContext && (
        <Card className="mb-6" data-testid="card-auth-handoff-context">
          <CardContent className="p-4">
            {contextLoading ? (
              <div className="space-y-2" aria-label="Checking selected app ownership">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            ) : contextError ? (
              <div role="alert" className="text-sm text-destructive">
                Could not verify that this live site belongs to the selected project. Refresh the page and try again.
              </div>
            ) : validHandoff ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">Adding Afro Auth to {selectedProject.name}</p>
                <p className="text-xs text-muted-foreground">Prefilled: the new Afro Auth project name field.</p>
                <p className="text-sm text-muted-foreground">
                  Selected live site: {selectedApp.customDomain || `${selectedApp.subdomain}.afroaigroup.com`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Creating this Afro Auth project will not enable login automatically. You will still need to add and verify the site domain.
                </p>
              </div>
            ) : (
              <div role="alert" className="text-sm text-muted-foreground">
                The requested project and live site could not be confirmed as a source pair in your account. Choose an existing Afro Auth project or start from a live site in your dashboard.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error ? (
        <div role="alert" className="rounded-lg border p-6 space-y-3">
          <p>{error.message}</p>
          <Button variant="outline" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : tenants.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <KeyRound className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h2 className="font-semibold mb-1" data-testid="text-empty-title">No projects yet</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first project to start adding login to your app.
            </p>
            <Button onClick={() => setCreateOpen(true)} data-testid="button-empty-create">
              <Plus className="h-4 w-4 mr-2" /> Create your first project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {tenants.map((t) => (
            <Link
              key={t.id}
              href={tenantUrl(t.id)}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`Manage ${t.name} Afro Auth project`}
              data-testid={`card-project-${t.id}`}
            >
              <Card className="h-full cursor-pointer transition hover-elevate active-elevate-2">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg" data-testid={`text-project-name-${t.id}`}>{t.name}</CardTitle>
                    <Badge variant="secondary" data-testid={`badge-plan-${t.id}`}>{t.plan}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground font-mono mb-3" data-testid={`text-project-slug-${t.id}`}>
                    {t.slug}
                  </p>
                  <div className="flex items-center text-sm text-primary">
                    Manage <ArrowRight className="h-4 w-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Afro Auth project</DialogTitle>
            <DialogDescription>
              Pick a name your team will recognise. You can rename it later.
            </DialogDescription>
          </DialogHeader>
          {validHandoff && selectedProject && selectedApp && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{selectedProject.name}</p>
              <p className="text-muted-foreground">
                {selectedApp.customDomain || `${selectedApp.subdomain}.afroaigroup.com`}
              </p>
            </div>
          )}
          <div className="space-y-2 py-2">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              placeholder="e.g. MyShop, Acme HR"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              data-testid="input-project-name"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button
              onClick={() => name.trim() && createMutation.mutate(name.trim())}
              disabled={!name.trim() || createMutation.isPending}
              data-testid="button-confirm-create"
            >
              {createMutation.isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="mt-8 text-sm text-muted-foreground">
        Want to know what this is? <Link href="/afro-auth" className="text-primary underline">See the product page</Link>
      </p>
    </div>
  );
}
