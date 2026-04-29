import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

  const { data, isLoading } = useQuery<{ tenants: TenantSummary[] }>({
    queryKey: ["/cf-auth/v1/admin/tenants"],
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (projectName: string) => {
      const res = await apiRequest("POST", "/cf-auth/v1/admin/tenants", { name: projectName });
      return res.json() as Promise<TenantSummary>;
    },
    onSuccess: (tenant) => {
      queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants"] });
      setCreateOpen(false);
      setName("");
      toast({ title: "Project created", description: `${tenant.name} is ready.` });
      setLocation(`/dashboard/auth/${tenant.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Couldn't create project", description: err?.message || "Try again", variant: "destructive" });
    },
  });

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

  const tenants = data?.tenants || [];

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

      {isLoading ? (
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
            <Card
              key={t.id}
              className="cursor-pointer hover-elevate active-elevate-2 transition"
              onClick={() => setLocation(`/dashboard/auth/${t.id}`)}
              data-testid={`card-project-${t.id}`}
            >
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
