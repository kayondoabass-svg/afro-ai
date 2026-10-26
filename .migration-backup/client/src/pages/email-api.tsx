import { useState } from "react";
import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { normalizeSendingDomain, readableApiError } from "@shared/customer-api-setup";
import { EmailDnsRecords } from "@/components/email-dns-records";
import { Copy, Plus, Trash2, Eye, EyeOff, Check, Globe, Key, BarChart3, Mail, RefreshCw, Code2, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AppHandoffContext } from "@/components/app-handoff-context";
import { useAppHandoff } from "@/lib/app-handoff";
import { EmailProjectWorkspace } from "@/components/email-project-workspace";
import { EmailProjectTest } from "@/components/email-project-test";

interface EmailApiKey {
  founderAccess?: boolean;
  quotaExempt?: boolean;
  id: number;
  name: string;
  publicKey: string;
  secretKeyPreview: string;
  plan: string;
  emailsSentMonth: number;
  monthlyLimit: number;
  isActive: boolean;
  revokedAt?: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface EmailApiDomain {
  id: number;
  domain: string;
  status: string;
  dkimToken: string | null;
  spfRecord: string | null;
  dmarcRecord: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

interface EmailApiLog {
  id: number;
  fromAddress: string;
  toAddress: string;
  subject: string;
  status: string;
  messageId: string | null;
  error: string | null;
  sentAt: string;
}

interface Stats {
  founderAccess?: boolean;
  emailProvider?: "resend" | "ses";
  totalSent: number;
  totalFailed: number;
  totalKeys: number;
  verifiedDomains: number;
  emailsSentThisMonth: number;
}

function copyToClipboard(text: string, label: string, toast: any) {
  try {
    navigator.clipboard.writeText(text).then(
      () => toast({ title: `Copied ${label}` }),
      () => toast({ title: `Couldn't copy ${label}`, description: "Select and copy the value manually.", variant: "destructive" }),
    );
  } catch {
    toast({ title: `Couldn't copy ${label}`, description: "Select and copy the value manually.", variant: "destructive" });
  }
}

export default function EmailApiPage() {
  const { toast } = useToast();
  const handoff = useAppHandoff();
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newSecretKey, setNewSecretKey] = useState<string | null>(null);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [expandedDomain, setExpandedDomain] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(new URLSearchParams(window.location.search).get("project"));

  const { data: legacyKeys = [], isLoading: legacyLoadingKeys } = useQuery<EmailApiKey[]>({ queryKey: ["/api/email-api/keys"], enabled: !selectedProjectId, retry: false });
  const { data: legacyDomains = [], isLoading: legacyLoadingDomains } = useQuery<EmailApiDomain[]>({ queryKey: ["/api/email-api/domains"], enabled: !selectedProjectId, retry: false });
  const { data: legacyLogs = [], isLoading: legacyLoadingLogs } = useQuery<EmailApiLog[]>({ queryKey: ["/api/email-api/logs"], enabled: !selectedProjectId, retry: false });
  const { data: legacyStats } = useQuery<Stats>({ queryKey: ["/api/email-api/stats"], enabled: !selectedProjectId, retry: false });
  const projectPath = selectedProjectId ? `/api/email-api/projects/${encodeURIComponent(selectedProjectId)}` : "";
  const { data: projectDetail, isLoading: loadingProject, isError: projectError, error: projectLoadError, refetch: refetchProject } = useQuery<{project: {id: string | number; name: string; legacy: boolean}; keys: EmailApiKey[]; domains: EmailApiDomain[]; logs: EmailApiLog[]; stats: Stats}>({
    queryKey: [projectPath], enabled: !!selectedProjectId, retry: false,
  });
  const keys = selectedProjectId ? projectDetail?.keys ?? [] : legacyKeys;
  const domains = selectedProjectId ? projectDetail?.domains ?? [] : legacyDomains;
  const logs = selectedProjectId ? projectDetail?.logs ?? [] : legacyLogs;
  const stats = selectedProjectId ? projectDetail?.stats : legacyStats;
  const selectedProjectReady = !!selectedProjectId && !!projectDetail && !loadingProject && !projectError;
  const loadingKeys = selectedProjectId ? loadingProject : legacyLoadingKeys;
  const loadingDomains = selectedProjectId ? loadingProject : legacyLoadingDomains;
  const loadingLogs = selectedProjectId ? loadingProject : legacyLoadingLogs;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedProjectId) params.set("project", selectedProjectId);
    else params.delete("project");
    const search = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
  }, [selectedProjectId]);

  const createKeyMutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async (name: string) => {
      if (!selectedProjectReady || !selectedProjectId) throw new Error("Select a loaded email project before creating a key.");
      const res = await apiRequest("POST", "/api/email-api/keys", { name, projectId: selectedProjectId });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [projectPath] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-api/projects"] });
      setNewKeyName("");
      setShowCreateKey(false);
      setNewSecretKey(data.secretKey);
      toast({ title: "API key created" });
    },
    onError: () => toast({ title: "Failed to create key", variant: "destructive" }),
  });

  const deleteKeyMutation = useMutation({
    retry: false,
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/email-api/keys/${id}/revoke`, { confirm: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [projectPath] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-api/projects"] });
      toast({ title: "Key permanently revoked" });
    },
  });

  const toggleKeyMutation = useMutation({
    retry: false,
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/email-api/keys/${id}/toggle`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [projectPath] }),
  });

  const rotateKeyMutation = useMutation({
    gcTime: 0, retry: false,
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/email-api/keys/${id}/rotate`, {})).json(),
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: [projectPath] }); setNewSecretKey(data.secretKey); },
    onError: (error) => toast({ title: "Couldn't rotate key", description: readableApiError(error, "Please try again."), variant: "destructive" }),
  });

  const addDomainMutation = useMutation({
    retry: false,
    mutationFn: async (domain: string) => {
      if (!selectedProjectReady || !selectedProjectId) throw new Error("Select a loaded email project before adding a domain.");
      const res = await apiRequest("POST", "/api/email-api/domains", { domain: normalizeSendingDomain(domain), projectId: selectedProjectId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [projectPath] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-api/projects"] });
      setNewDomain("");
      setShowAddDomain(false);
      toast({ title: "Domain added — add DNS records to verify" });
    },
    onError: (error) => toast({ title: "Couldn't add sending domain", description: readableApiError(error, "Please try again."), variant: "destructive" }),
  });

  const verifyDomainMutation = useMutation({
    retry: false,
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/email-api/domains/${id}/verify`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [projectPath] });
      toast({ title: data.status === "verified" ? "Domain verified!" : "Not verified yet — DNS changes can take up to 72h" });
    },
    onError: (error) => toast({ title: "Couldn't check verification", description: readableApiError(error, "Try again later."), variant: "destructive" }),
  });

  const deleteDomainMutation = useMutation({
    retry: false,
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/email-api/projects/${encodeURIComponent(selectedProjectId || "")}/domains/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [projectPath] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-api/projects"] });
      toast({ title: "Domain permission removed from this project" });
    },
  });

  const planColor = (plan: string) => {
    if (plan === "enterprise") return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    if (plan === "pro") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    return "bg-primary/10 text-primary border-primary/20";
  };

  const statusIcon = (status: string) => {
    if (status === "verified") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === "failed") return <AlertTriangle className="w-4 h-4 text-red-500" />;
    return <Clock className="w-4 h-4 text-yellow-500" />;
  };
  const downloadEmailEnv = () => {
    if (!newSecretKey) return;
    const blob = new Blob([`AFRO_EMAIL_API_KEY=${newSecretKey}\n`], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = ".env";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
    toast({ title: ".env file downloaded", description: "Keep it on your server. Never commit secrets or expose them in browser code." });
  };

  const codeExample = keys[0]
    ? `// Install: npm install afro-mail (coming soon)
// Or use fetch directly:

const response = await fetch("https://afroaigroup.com/api/email-api/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_live_YOUR_SECRET_KEY"
  },
  body: JSON.stringify({
    from: "Your Name <you@yourdomain.com>",
    to: "customer@gmail.com",
    subject: "Hello from Afro AI Email",
    html: "<strong>Your message here</strong>"
  })
});

const data = await response.json();
console.log(data.messageId); // → "01000196..."
`
    : "";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="w-6 h-6 text-primary" />
            Email API
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Send transactional emails via API. Powered by AfroAI.</p>
        </div>
      </div>
      <AppHandoffContext prefilledFields={handoff.project ? ["API key name"] : []} />
      <EmailProjectWorkspace selectedId={selectedProjectId} onSelect={setSelectedProjectId}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setShowAddDomain(true)} variant="outline" disabled={!selectedProjectReady} data-testid="button-add-domain">
            <Globe className="w-4 h-4 mr-1" /> Add Domain
          </Button>
          <Button size="sm" onClick={() => { setNewKeyName(handoff.project?.name ? `${handoff.project.name} email` : ""); setShowCreateKey(true); }} disabled={!selectedProjectReady || !domains.some((domain) => domain.status === "verified")} data-testid="button-create-key">
            <Plus className="w-4 h-4 mr-1" /> New API Key
          </Button>
        </div>
      </EmailProjectWorkspace>

      {stats?.founderAccess && <Card className="border-primary/40">
        <CardContent className="p-4 space-y-2">
          <p className="font-semibold">Founder — full access</p>
          <p className="text-sm text-muted-foreground">Your founder account and server-side secret email keys are exempt from customer subscription quotas. No paid Afro AI upgrade is needed. Public-key requests remain limited; never expose secret keys in a browser. Domain verification, security checks and external provider limits still apply.</p>
          {stats.emailProvider === "resend" && <a className="text-sm text-primary underline" href="https://resend.com/settings/usage" target="_blank" rel="noopener noreferrer">Manage Resend sending capacity</a>}
        </CardContent>
      </Card>}

      {!selectedProjectId ? (
        <Card className="border-dashed"><CardContent className="p-6 text-sm text-muted-foreground">
          Choose an email project above to manage its keys, sending domains, activity, usage and API documentation. Account-wide records are not shown as project data.
        </CardContent></Card>
      ) : !selectedProjectReady ? (
        <Card className="border-border/60" data-testid="selected-project-state">
          <CardHeader>
            <CardTitle>{projectError ? "Couldn't load this email project" : "Loading email project"}</CardTitle>
            <CardDescription>{projectError ? readableApiError(projectLoadError, "Project details are unavailable. Your account-wide email records are not shown here.") : "Loading this project's keys, sending domains, activity and usage."}</CardDescription>
          </CardHeader>
          <CardContent>
            {projectError
              ? <Button variant="outline" onClick={() => refetchProject()}>Try again</Button>
              : <div className="space-y-3" aria-label="Loading selected email project"><div className="h-8 w-40 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded bg-muted" /><div className="h-40 animate-pulse rounded bg-muted" /></div>}
          </CardContent>
        </Card>
      ) : <>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Sent This Month", value: stats?.emailsSentThisMonth ?? 0, icon: Mail, color: "text-green-500" },
          { label: "Failed", value: stats?.totalFailed ?? 0, icon: AlertTriangle, color: "text-red-500" },
          { label: "API Keys", value: stats?.totalKeys ?? 0, icon: Key, color: "text-primary" },
          { label: "Verified Domains", value: stats?.verifiedDomains ?? 0, icon: Globe, color: "text-blue-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`w-8 h-8 ${color} shrink-0`} />
              <div>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="keys">
        <TabsList className="grid h-auto w-full grid-cols-5 sm:inline-flex sm:w-auto">
          <TabsTrigger value="keys" data-testid="tab-keys"><Key className="w-4 h-4 mr-1" />API Keys</TabsTrigger>
          <TabsTrigger value="domains" data-testid="tab-domains"><Globe className="w-4 h-4 mr-1" />Domains</TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-logs"><BarChart3 className="w-4 h-4 mr-1" />Logs</TabsTrigger>
          <TabsTrigger value="docs" data-testid="tab-docs"><Code2 className="w-4 h-4 mr-1" />API Docs</TabsTrigger>
          <TabsTrigger value="test" data-testid="tab-test"><Mail className="w-4 h-4 mr-1" />Test</TabsTrigger>
        </TabsList>

        {/* API Keys Tab */}
        <TabsContent value="keys" className="space-y-3 mt-4">
          {loadingKeys ? (
            <div className="text-muted-foreground text-sm p-8 text-center">Loading keys...</div>
          ) : keys.length === 0 ? (
            <Card className="border-dashed border-border/50">
              <CardContent className="p-12 text-center">
                <Key className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No API keys yet. Create one to start sending emails.</p>
                <Button className="mt-4" onClick={() => setShowCreateKey(true)} disabled={!selectedProjectReady || !domains.some((domain) => domain.status === "verified")} data-testid="button-create-first-key">Create API Key</Button>
              </CardContent>
            </Card>
          ) : (
            keys.map(key => (
              <Card key={key.id} className="border-border/50" data-testid={`card-apikey-${key.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{key.name}</span>
                        <Badge variant="outline" className={planColor(key.plan)}>{key.plan}</Badge>
                        <Badge variant="outline" className={key.revokedAt ? "text-red-500 border-red-500/20" : key.isActive ? "text-green-500 border-green-500/20" : "text-muted-foreground"}>
                          {key.revokedAt ? "Revoked" : key.isActive ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground bg-muted/50 rounded px-3 py-1.5 flex-wrap">
                        <span className="truncate">{key.publicKey}</span>
                        <button onClick={() => copyToClipboard(key.publicKey, "public key", toast)} data-testid={`button-copy-pubkey-${key.id}`}>
                          <Copy className="w-3 h-3 hover:text-foreground transition-colors" />
                        </button>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        Secret: sk_live_...{key.secretKeyPreview} (hidden)
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{key.emailsSentMonth} / {key.quotaExempt ? "No customer quota (founder)" : key.monthlyLimit.toLocaleString()} emails this month</span>
                        {key.lastUsedAt && <span>Last used {formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })}</span>}
                      </div>
                      {/* Usage bar */}
                      <div className="w-full max-w-xs h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${key.quotaExempt ? 0 : Math.min(100, (key.emailsSentMonth / Math.max(1, key.monthlyLimit)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!key.revokedAt && <>
                        <Button size="sm" variant="outline" disabled={!selectedProjectReady || rotateKeyMutation.isPending} onClick={() => {
                          if (window.confirm("Generate a replacement key? The current key remains active during rollout. Deploy the replacement before revoking the old key.")) rotateKeyMutation.mutate(key.id);
                        }} aria-label={`Rotate ${key.name}`}><RefreshCw className="mr-1 h-4 w-4" /><span>Rotate</span></Button>
                        <Button size="sm" variant="outline" disabled={!selectedProjectReady || toggleKeyMutation.isPending} onClick={() => toggleKeyMutation.mutate(key.id)} data-testid={`button-toggle-key-${key.id}`}>
                          {key.isActive ? <><EyeOff className="mr-1 h-4 w-4" />Disable</> : <><Eye className="mr-1 h-4 w-4" />Enable</>}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-400" disabled={!selectedProjectReady} onClick={() => {
                          if (window.confirm("Revoke this key permanently? Any application still using it will stop sending immediately.")) deleteKeyMutation.mutate(key.id);
                        }} data-testid={`button-delete-key-${key.id}`}>
                          <Trash2 className="mr-1 h-4 w-4" /><span>Revoke</span>
                        </Button>
                      </>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Domains Tab */}
        <TabsContent value="domains" className="space-y-3 mt-4">
          <p className="text-sm text-muted-foreground">Sending-domain verification is separate from Afro Auth's allowed website origins. Add a bare domain, copy the DNS records below to the company managing that domain's DNS, then select Verify. Adding a domain alone does not grant verified sending.</p>
          {loadingDomains ? (
            <div className="text-muted-foreground text-sm p-8 text-center">Loading domains...</div>
          ) : domains.length === 0 ? (
            <Card className="border-dashed border-border/50">
              <CardContent className="p-12 text-center">
                <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No domains added yet. Add your domain to enable verified sending.</p>
                <Button className="mt-4" onClick={() => setShowAddDomain(true)} disabled={!selectedProjectReady} data-testid="button-add-first-domain">Add Domain</Button>
              </CardContent>
            </Card>
          ) : (
            domains.map(domain => (
              <Card key={domain.id} className="border-border/50" data-testid={`card-domain-${domain.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusIcon(domain.status)}
                        <span className="font-semibold">{domain.domain}</span>
                        <Badge variant="outline" className={
                          domain.status === "verified" ? "text-green-500 border-green-500/20" :
                          domain.status === "failed" ? "text-red-500 border-red-500/20" :
                          "text-yellow-500 border-yellow-500/20"
                        }>
                          {domain.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Added {formatDistanceToNow(new Date(domain.createdAt), { addSuffix: true })}
                        {domain.verifiedAt && ` · Verified ${formatDistanceToNow(new Date(domain.verifiedAt), { addSuffix: true })}`}
                      </p>
                      {domain.status !== "verified" && (
                        <button
                          className="text-xs text-primary underline mt-1"
                          onClick={() => setExpandedDomain(expandedDomain === domain.id ? null : domain.id)}
                          data-testid={`button-show-dns-${domain.id}`}
                        >
                          {expandedDomain === domain.id ? "Hide DNS records" : "Show DNS records to add"}
                        </button>
                      )}
                      {expandedDomain === domain.id && (
                        <EmailDnsRecords domain={domain} onCopy={(value, label) => copyToClipboard(value, label, toast)} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {domain.status !== "verified" && (
                        <Button size="sm" variant="outline" onClick={() => verifyDomainMutation.mutate(domain.id)} disabled={!selectedProjectReady || verifyDomainMutation.isPending} data-testid={`button-verify-domain-${domain.id}`}>
                          <RefreshCw className={`w-4 h-4 mr-1 ${verifyDomainMutation.isPending ? "animate-spin" : ""}`} />
                          Check
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-400" disabled={!selectedProjectReady} onClick={() => {
                        if (window.confirm(`Remove ${domain.domain} from this project's sending permissions? This does not delete the upstream email identity or DNS configuration.`)) deleteDomainMutation.mutate(domain.id);
                      }} data-testid={`button-delete-domain-${domain.id}`}>
                        <Trash2 className="w-4 h-4 mr-1" /><span className="hidden sm:inline">Remove permission</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="mt-4">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Send History</CardTitle>
              <CardDescription>Last 100 emails sent via your API keys</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLogs ? (
                <div className="text-muted-foreground text-sm p-4 text-center">Loading logs...</div>
              ) : logs.length === 0 ? (
                <div className="text-muted-foreground text-sm p-8 text-center">No emails sent yet.</div>
              ) : (
                <div className="space-y-2">
                  {logs.map(log => (
                    <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 text-sm" data-testid={`row-log-${log.id}`}>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${log.status === "sent" ? "bg-green-500" : "bg-red-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{log.subject}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {log.fromAddress} → {log.toAddress}
                        </div>
                        {log.error && <div className="text-xs text-red-400 mt-1 truncate">{log.error}</div>}
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(log.sentAt), { addSuffix: true })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Docs Tab */}
        <TabsContent value="docs" className="mt-4 space-y-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Send Email</CardTitle>
              <CardDescription>POST https://afroaigroup.com/api/email-api/send</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm space-y-2">
                <p className="text-muted-foreground">Authenticate with your secret key in the Authorization header. The secret key is only shown once when created.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {[
                    { field: "from", type: "string", desc: "Sender — must be from verified domain" },
                    { field: "to", type: "string | string[]", desc: "Recipient email(s)" },
                    { field: "subject", type: "string", desc: "Email subject line" },
                    { field: "html", type: "string", desc: "HTML body content" },
                    { field: "text", type: "string (optional)", desc: "Plain-text fallback" },
                  ].map(({ field, type, desc }) => (
                    <div key={field} className="bg-muted/50 rounded-lg p-3">
                      <div className="font-mono font-semibold text-primary">{field}</div>
                      <div className="text-muted-foreground font-mono">{type}</div>
                      <div className="text-muted-foreground mt-1">{desc}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative">
                <pre className="bg-muted/60 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">{codeExample || `// Create an API key first to see a code example`}</pre>
                {codeExample && (
                  <button
                    className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => copyToClipboard(codeExample, "code example", toast)}
                    data-testid="button-copy-code"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Pricing & Limits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                {[
                  { plan: "Starter", price: "Free", emails: "1 email (trial)", ip: "Test your integration", color: "border-primary/30" },
                  { plan: "Pro", price: "$15 / mo", emails: "10,000 / month", ip: "Custom Domains", color: "border-blue-500/30" },
                  { plan: "Business", price: "$25 / mo", emails: "50,000 / month", ip: "Dedicated IP + Priority support", color: "border-purple-500/30" },
                ].map(({ plan, price, emails, ip, color }) => (
                  <div key={plan} className={`rounded-lg border-2 ${color} p-4 space-y-1`}>
                    <div className="font-bold">{plan}</div>
                    <div className="text-2xl font-bold text-primary">{price}</div>
                    <div className="text-muted-foreground text-xs">{emails}</div>
                    <div className="text-muted-foreground text-xs">{ip}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Contact us at <a href="mailto:hello@afroaigroup.com" className="text-primary underline">hello@afroaigroup.com</a> for Pro or Enterprise upgrades.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="test" className="mt-4">
          {selectedProjectId
            ? <EmailProjectTest key={selectedProjectId} projectId={selectedProjectId} keys={keys} hasVerifiedDomain={domains.some((domain) => domain.status === "verified")} />
            : <Card className="border-dashed"><CardContent className="p-8 text-center text-sm text-muted-foreground">Create or select an email project before sending a test.</CardContent></Card>}
        </TabsContent>
      </Tabs>
      </>}

      {/* Create Key Dialog */}
      <Dialog open={showCreateKey} onOpenChange={setShowCreateKey}>
        <DialogContent data-testid="dialog-create-key">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">Key Name</label>
            <Input
              placeholder="e.g. My App Production"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && newKeyName.trim() && createKeyMutation.mutate(newKeyName.trim())}
              data-testid="input-key-name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateKey(false)}>Cancel</Button>
            <Button
              onClick={() => createKeyMutation.mutate(newKeyName.trim())}
              disabled={!newKeyName.trim() || createKeyMutation.isPending || !selectedProjectReady || !domains.some((domain) => domain.status === "verified")}
              data-testid="button-confirm-create-key"
            >
              {createKeyMutation.isPending ? "Creating..." : "Create Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Key Reveal Dialog */}
      <Dialog open={!!newSecretKey} onOpenChange={(open) => { if (!open) { setNewSecretKey(null); createKeyMutation.reset(); rotateKeyMutation.reset(); } }}>
        <DialogContent data-testid="dialog-secret-key">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Check className="w-5 h-5" /> Your Secret Key
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>This is the only time your secret key will be shown. Copy it or download a server-side .env file now. It is a secret; your public key is only an identifier.</span>
            </div>
            <div className="font-mono text-sm bg-muted/60 rounded-lg p-3 break-all">{newSecretKey}</div>
            <Button className="w-full" onClick={() => { copyToClipboard(newSecretKey!, "secret key", toast); }} data-testid="button-copy-secret-key">
              <Copy className="w-4 h-4 mr-2" /> Copy Secret Key
            </Button>
            <Button variant="outline" className="w-full" onClick={downloadEmailEnv} data-testid="button-download-email-env">
              Download server .env
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewSecretKey(null); createKeyMutation.reset(); rotateKeyMutation.reset(); }} data-testid="button-close-secret-dialog">
              I've saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Domain Dialog */}
      <Dialog open={showAddDomain} onOpenChange={setShowAddDomain}>
        <DialogContent data-testid="dialog-add-domain">
          <DialogHeader>
            <DialogTitle>Add Sending Domain</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">Domain</label>
            <Input
              placeholder="e.g. example.com"
              value={newDomain}
              onChange={e => setNewDomain(e.target.value.toLowerCase().trim())}
              onKeyDown={e => e.key === "Enter" && newDomain && addDomainMutation.mutate(newDomain)}
              data-testid="input-domain"
            />
            <p className="text-xs text-muted-foreground">
              Enter only example.com or mail.example.com, without https://, paths or an email address. After adding, copy each record's type, name and value into your DNS provider. Use MX priority where shown; DKIM CNAME records must be DNS-only, not proxied. Do not replace existing mailbox MX records or create a second SPF record at the same name. Then select Verify; DNS changes may take up to 72 hours.
            </p>
            {addDomainMutation.isError && <p role="alert" className="text-sm text-destructive" data-testid="domain-setup-error">{readableApiError(addDomainMutation.error, "Could not add the sending domain.")}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDomain(false)}>Cancel</Button>
            <Button
              onClick={() => addDomainMutation.mutate(newDomain)}
              disabled={!newDomain || addDomainMutation.isPending || !selectedProjectReady}
              data-testid="button-confirm-add-domain"
            >
              {addDomainMutation.isPending ? "Adding..." : "Add Domain"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
