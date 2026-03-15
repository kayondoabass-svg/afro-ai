import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Clock,
  Server,
  Shield,
  AlertTriangle,
  RefreshCw,
  Link2,
  CheckCircle2,
  XCircle,
  History,
  RotateCcw,
  Upload,
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

function reasonLabel(reason: string) {
  if (reason === "publish") return "Published";
  if (reason === "pre-restore") return "Before Restore";
  if (reason === "payment") return "Paid Version";
  return reason;
}

function reasonColor(reason: string) {
  if (reason === "publish") return "bg-primary/10 text-primary border-primary/20";
  if (reason === "pre-restore") return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
  if (reason === "payment") return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
  return "bg-muted text-muted-foreground";
}

type AppVersion = {
  id: number;
  versionNumber: number;
  title: string;
  snapshotReason: string;
  createdAt: string;
};

type DomainDialogApp = { app: PublishedApp; mode: "connect" | "instructions" };

export default function DeploymentsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deleteApp, setDeleteApp] = useState<PublishedApp | null>(null);
  const [expandedApp, setExpandedApp] = useState<number | null>(null);
  const [domainDialog, setDomainDialog] = useState<DomainDialogApp | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [versionApp, setVersionApp] = useState<PublishedApp | null>(null);
  const [restoringVersionId, setRestoringVersionId] = useState<number | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<AppVersion | null>(null);

  const { data: apps, isLoading } = useQuery<PublishedApp[]>({
    queryKey: ["/api/published-apps"],
  });

  const { data: versions, isLoading: versionsLoading } = useQuery<AppVersion[]>({
    queryKey: ["/api/published-apps", versionApp?.id, "versions"],
    queryFn: async () => {
      if (!versionApp) return [];
      const res = await fetch(`/api/published-apps/${versionApp.id}/versions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load versions");
      return res.json();
    },
    enabled: !!versionApp,
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

  const restoreMutation = useMutation({
    mutationFn: async ({ appId, versionId }: { appId: number; versionId: number }) => {
      return await apiRequest("POST", `/api/published-apps/${appId}/restore/${versionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps", versionApp?.id, "versions"] });
      setConfirmRestore(null);
      toast({
        title: "Version restored!",
        description: "Your app is now live with the restored version. The previous version was saved automatically.",
      });
    },
    onError: (err: any) => {
      setConfirmRestore(null);
      toast({ title: "Restore failed", description: err.message || "Failed to restore version", variant: "destructive" });
    },
  });

  const connectDomainMutation = useMutation({
    mutationFn: async ({ id, domain }: { id: number; domain: string }) => {
      return await apiRequest("POST", `/api/published-apps/${id}/connect-domain`, { domain });
    },
    onSuccess: (data: any, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      const app = apps?.find((a) => a.id === vars.id);
      if (app) {
        setDomainDialog({ app: { ...app, customDomain: vars.domain, customDomainVerified: false }, mode: "instructions" });
      }
      toast({ title: "Domain saved", description: "Follow the instructions to verify your domain." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to connect domain", variant: "destructive" });
    },
  });

  const removeDomainMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/published-apps/${id}/custom-domain`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      toast({ title: "Domain removed", description: "Custom domain has been disconnected." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to remove domain", variant: "destructive" });
    },
  });

  const verifyDomain = async (appId: number) => {
    setVerifyingId(appId);
    try {
      const res = await apiRequest("POST", `/api/published-apps/${appId}/verify-domain`);
      const data = res as any;
      if (data.verified) {
        queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
        toast({ title: "Domain verified!", description: "Your custom domain is now live." });
        setDomainDialog(null);
      } else {
        toast({ title: "Not verified yet", description: data.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    } finally {
      setVerifyingId(null);
    }
  };

  const copyDomain = (app: PublishedApp) => {
    const url = app.customDomain && app.customDomainVerified
      ? `https://${app.customDomain}`
      : `https://${app.subdomain}.afroaigroup.com`;
    navigator.clipboard.writeText(url);
    setCopiedId(app.id);
    toast({ title: "Copied!", description: "Domain URL copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openConnectDialog = (app: PublishedApp) => {
    setDomainInput(app.customDomain || "");
    setDomainDialog({ app, mode: app.customDomain && !app.customDomainVerified ? "instructions" : "connect" });
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
              <p className="text-sm text-muted-foreground">Manage your published apps and custom domains</p>
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
              const subdomainUrl = `https://${app.subdomain}.afroaigroup.com`;
              const customUrl = app.customDomain && app.customDomainVerified ? `https://${app.customDomain}` : null;
              const primaryUrl = customUrl || subdomainUrl;
              const previewUrl = `/site/${app.subdomain}`;
              const isExpanded = expandedApp === app.id;

              return (
                <Card key={app.id} className="overflow-hidden" data-testid={`card-deployment-${app.id}`}>
                  <CardContent className="p-0">
                    <div className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${app.appStatus === "suspended" ? "bg-red-500/10" : "bg-green-500/10"}`}>
                            <Globe className={`w-5 h-5 ${app.appStatus === "suspended" ? "text-red-500" : "text-green-500"}`} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-lg truncate" data-testid={`text-app-title-${app.id}`}>{app.title}</h3>
                              {app.customDomain && app.customDomainVerified && (
                                <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20 flex-shrink-0">
                                  <Globe className="w-3 h-3 mr-1" />Custom Domain
                                </Badge>
                              )}
                              {app.customDomain && !app.customDomainVerified && (
                                <Badge variant="secondary" className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20 flex-shrink-0">
                                  <Clock className="w-3 h-3 mr-1" />Pending Verification
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">Published {formatDate(app.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setVersionApp(app)}
                            title="View version history"
                            data-testid={`button-history-${app.id}`}
                          >
                            <History className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline ml-1">History</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openConnectDialog(app)}
                            title={app.customDomain ? "Manage custom domain" : "Connect custom domain"}
                            data-testid={`button-connect-domain-${app.id}`}
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline ml-1">{app.customDomain ? "Domain" : "Connect Domain"}</span>
                          </Button>
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
                              {app.appStatus === "suspended" ? (
                                <>
                                  <div className="w-2 h-2 rounded-full bg-red-500" />
                                  <span className="text-sm font-medium text-red-500" data-testid={`text-status-${app.id}`}>Suspended</span>
                                </>
                              ) : (
                                <>
                                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                  <span className="text-sm font-medium text-green-500" data-testid={`text-status-${app.id}`}>Live</span>
                                </>
                              )}
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
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {customUrl ? "Custom Domain" : "Domain"}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <a
                              href={primaryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-1 font-mono"
                              data-testid={`link-domain-${app.id}`}
                            >
                              {primaryUrl}
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
                          {customUrl && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Also at: <span className="font-mono">{subdomainUrl}</span>
                            </p>
                          )}
                          {app.customDomain && !app.customDomainVerified && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-yellow-600 dark:text-yellow-400 font-mono">{app.customDomain}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs px-2 border-yellow-500/30 text-yellow-600 dark:text-yellow-400"
                                onClick={() => verifyDomain(app.id)}
                                disabled={verifyingId === app.id}
                                data-testid={`button-verify-domain-${app.id}`}
                              >
                                {verifyingId === app.id ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                                Verify
                              </Button>
                            </div>
                          )}
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
                          {app.appStatus === "suspended" && app.suspendReason && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-red-500">Suspended</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{app.suspendReason}</p>
                              </div>
                            </div>
                          )}
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
                              <p className="text-xs text-muted-foreground">Custom Domain</p>
                              {app.customDomain ? (
                                <div className="flex items-center gap-1">
                                  {app.customDomainVerified
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                    : <XCircle className="w-3.5 h-3.5 text-yellow-500" />}
                                  <span className="text-sm font-medium font-mono truncate">{app.customDomain}</span>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">Not connected</span>
                              )}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteApp} onOpenChange={() => setDeleteApp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Published App
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteApp?.title}</strong>? This will remove the app from{" "}
              <strong>{deleteApp?.subdomain}.afroaigroup.com</strong> along with all its version history. This action cannot be undone.
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

      {/* Version History Dialog */}
      <Dialog open={!!versionApp} onOpenChange={(open) => { if (!open) { setVersionApp(null); setConfirmRestore(null); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Version History
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium">{versionApp?.title}</span> — every time you republish, the previous version is saved here. Restore any version instantly.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 py-2 min-h-0">
            {/* Current live version */}
            {versionApp && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{versionApp.title}</p>
                      <Badge className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 flex-shrink-0">
                        Live
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Current version · {formatDate(versionApp.updatedAt)}</p>
                  </div>
                </div>
              </div>
            )}

            {versionsLoading ? (
              <div className="space-y-2 pt-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-8 h-8 rounded-full" />
                      <div className="space-y-1 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : versions && versions.length > 0 ? (
              <div className="space-y-2 pt-1">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-between gap-3"
                    data-testid={`card-version-${version.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-bold text-muted-foreground">
                        v{version.versionNumber}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{version.title}</p>
                          <Badge variant="outline" className={`text-xs flex-shrink-0 ${reasonColor(version.snapshotReason)}`}>
                            {reasonLabel(version.snapshotReason)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{formatDate(version.createdAt)}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0 h-7 px-2 text-xs"
                      onClick={() => setConfirmRestore(version)}
                      data-testid={`button-restore-version-${version.id}`}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No previous versions yet.</p>
                <p className="text-xs mt-1">Versions are saved automatically each time you republish.</p>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 border-t border-border/50">
            <Button variant="outline" onClick={() => { setVersionApp(null); setConfirmRestore(null); }} data-testid="button-close-history">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog open={!!confirmRestore} onOpenChange={(open) => { if (!open) setConfirmRestore(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-primary" />
              Restore Version {confirmRestore?.versionNumber}?
            </DialogTitle>
            <DialogDescription>
              This will replace the live version of <strong>{versionApp?.title}</strong> with the snapshot from{" "}
              <strong>{confirmRestore ? formatDate(confirmRestore.createdAt) : ""}</strong>. The current live version will be saved automatically so you can restore it again if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmRestore(null)} data-testid="button-cancel-restore">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (versionApp && confirmRestore) {
                  restoreMutation.mutate({ appId: versionApp.id, versionId: confirmRestore.id });
                }
              }}
              disabled={restoreMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="button-confirm-restore"
            >
              {restoreMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" />Restoring...</>
              ) : (
                <><RotateCcw className="w-4 h-4" />Restore This Version</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Domain Dialog */}
      <Dialog open={!!domainDialog} onOpenChange={(open) => { if (!open) setDomainDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              {domainDialog?.app.customDomain ? "Manage Custom Domain" : "Connect Custom Domain"}
            </DialogTitle>
            <DialogDescription>
              {domainDialog?.app.customDomain
                ? "Your custom domain setup and verification status."
                : "Connect your own domain (e.g. mybusiness.com) to this app."}
            </DialogDescription>
          </DialogHeader>

          {domainDialog?.mode === "connect" && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Your Domain</label>
                <Input
                  placeholder="e.g. mybusiness.com or www.mybusiness.com"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  data-testid="input-custom-domain"
                />
              </div>
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium">You'll need to add a CNAME record:</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono bg-muted px-1 rounded">CNAME</span> → <span className="font-mono bg-muted px-1 rounded">afroaigroup.com</span>
                </p>
              </div>
            </div>
          )}

          {domainDialog?.mode === "instructions" && domainDialog.app.customDomain && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  Add this DNS record to your domain provider:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Type</p>
                    <p className="font-mono bg-muted px-2 py-1 rounded">CNAME</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Name / Host</p>
                    <p className="font-mono bg-muted px-2 py-1 rounded">{domainDialog.app.customDomain.startsWith("www.") ? "www" : "@"}</p>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <p className="text-muted-foreground">Value / Points To</p>
                    <p className="font-mono bg-muted px-2 py-1 rounded break-all">afroaigroup.com</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">DNS changes can take up to 24 hours to propagate. Click Verify once you've added the record.</p>
              </div>
              {domainDialog.app.customDomainVerified && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-500/10 rounded-lg p-3">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <p className="text-sm font-medium">Domain verified and live!</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            {domainDialog?.app.customDomain && (
              <Button
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => {
                  if (domainDialog?.app.id) removeDomainMutation.mutate(domainDialog.app.id);
                  setDomainDialog(null);
                }}
                disabled={removeDomainMutation.isPending}
                data-testid="button-remove-domain"
              >
                Remove Domain
              </Button>
            )}
            <Button variant="outline" onClick={() => setDomainDialog(null)}>Cancel</Button>
            {domainDialog?.mode === "connect" && (
              <Button
                onClick={() => {
                  if (domainDialog?.app.id && domainInput.trim()) {
                    connectDomainMutation.mutate({ id: domainDialog.app.id, domain: domainInput.trim() });
                  }
                }}
                disabled={!domainInput.trim() || connectDomainMutation.isPending}
                data-testid="button-save-domain"
              >
                {connectDomainMutation.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" />Saving...</> : "Save & Get Instructions"}
              </Button>
            )}
            {domainDialog?.mode === "instructions" && !domainDialog.app.customDomainVerified && (
              <Button
                onClick={() => verifyDomain(domainDialog.app.id)}
                disabled={verifyingId === domainDialog.app.id}
                data-testid="button-verify-now"
              >
                {verifyingId === domainDialog.app.id ? <><RefreshCw className="w-4 h-4 animate-spin" />Verifying...</> : <><CheckCircle2 className="w-4 h-4" />Verify Domain</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
