import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Globe,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Rocket,
  Eye,
  EyeOff,
  Clock,
  Server,
  Shield,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import type { PublishedApp } from "@shared/schema";

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(htmlContent: string) {
  const bytes = new Blob([htmlContent]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DeploymentsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deleteApp, setDeleteApp] = useState<PublishedApp | null>(null);
  const [expandedApp, setExpandedApp] = useState<number | null>(null);

  const { data: apps, isLoading } = useQuery<PublishedApp[]>({
    queryKey: ["/api/published-apps"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/published-apps/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      setDeleteApp(null);
      toast({ title: "App deleted", description: "Your published app and DNS record have been removed." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete app", variant: "destructive" });
    },
  });

  const copyDomain = (app: PublishedApp) => {
    const url = `https://${app.subdomain}.afroaigroup.com`;
    navigator.clipboard.writeText(url);
    setCopiedId(app.id);
    toast({ title: "Copied!", description: "Domain URL copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-deployments-title">Deployments</h1>
              <p className="text-sm text-muted-foreground">Manage your published apps and domains</p>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs" data-testid="badge-total-apps">
            {apps?.length ?? 0} {(apps?.length ?? 0) === 1 ? "app" : "apps"} published
          </Badge>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Skeleton className="w-10 h-10 rounded-lg" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-4 w-72" />
                      </div>
                    </div>
                    <Skeleton className="h-20 w-full rounded-lg" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : apps && apps.length > 0 ? (
          <div className="space-y-4">
            {apps.map((app) => {
              const domainUrl = `https://${app.subdomain}.afroaigroup.com`;
              const previewUrl = `/site/${app.subdomain}`;
              const isExpanded = expandedApp === app.id;

              return (
                <Card key={app.id} className="overflow-hidden" data-testid={`card-deployment-${app.id}`}>
                  <CardContent className="p-0">
                    <div className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                            <Globe className="w-5 h-5 text-green-500" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-lg truncate" data-testid={`text-app-title-${app.id}`}>{app.title}</h3>
                            <p className="text-sm text-muted-foreground">Published {formatDate(app.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setExpandedApp(isExpanded ? null : app.id)}
                            data-testid={`button-expand-${app.id}`}
                          >
                            {isExpanded ? "Less" : "Details"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteApp(app)}
                            data-testid={`button-delete-app-${app.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 bg-muted/50 rounded-lg p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</p>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                              <span className="text-sm font-medium text-green-500" data-testid={`text-status-${app.id}`}>Live</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Visibility</p>
                            <div className="flex items-center gap-2">
                              <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm" data-testid={`text-visibility-${app.id}`}>Public</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Domain</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <a
                              href={domainUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-1 font-mono"
                              data-testid={`link-domain-${app.id}`}
                            >
                              {domainUrl}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => copyDomain(app)}
                              data-testid={`button-copy-domain-${app.id}`}
                            >
                              {copiedId === app.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</p>
                          <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                            data-testid={`link-preview-${app.id}`}
                          >
                            {window.location.origin}{previewUrl}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 bg-muted/30 rounded-lg p-4 space-y-4 border border-border/50">
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <Server className="w-4 h-4 text-primary" />
                            Deployment Details
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">Type</p>
                              <p className="text-sm font-medium">Static HTML</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">Size</p>
                              <p className="text-sm font-medium">{formatSize(app.htmlContent)}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">DNS Provider</p>
                              <p className="text-sm font-medium">Cloudflare</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">SSL / TLS</p>
                              <div className="flex items-center gap-1">
                                <Shield className="w-3.5 h-3.5 text-green-500" />
                                <span className="text-sm font-medium text-green-500">Active</span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">DNS Record</p>
                              <p className="text-sm font-medium font-mono truncate">
                                {app.cloudflareDnsRecordId ? `CNAME (...${app.cloudflareDnsRecordId.slice(-8)})` : "Pending"}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">Last Updated</p>
                              <p className="text-sm font-medium">{formatDate(app.updatedAt)}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Rocket className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No Published Apps Yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Use the AI Chat to build your first website or app, then publish it live on afroaigroup.com
              </p>
              <Button
                onClick={() => setLocation("/chat")}
                data-testid="button-go-to-chat"
              >
                <Rocket className="w-4 h-4" />
                Start Building
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!deleteApp} onOpenChange={() => setDeleteApp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Published App
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteApp?.title}</strong>? This will remove the app from{" "}
              <strong>{deleteApp?.subdomain}.afroaigroup.com</strong>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteApp(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteApp && deleteMutation.mutate(deleteApp.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="w-4 h-4" />Delete App</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
