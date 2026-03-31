import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Zap, Code, TestTube, CheckCircle, XCircle, Clock, Globe, Lock, Copy, Check, Filter } from "lucide-react";

interface ApiIntegration {
  id: number;
  name: string;
  baseUrl: string;
  method: string;
  headers: string | null;
  authType: string;
  authKey: string | null;
  authValue: string | null;
  authConfig: string | null;
  description: string | null;
  lastTestedAt: string | null;
  lastTestStatus: number | null;
  createdAt: string;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const AUTH_TYPES = [
  { value: "none",        label: "No Auth",               desc: "Public API — no authentication required" },
  { value: "apikey",      label: "API Key",                desc: "Custom header key/value pair" },
  { value: "bearer",      label: "Bearer Token",           desc: "Authorization: Bearer <token>" },
  { value: "basic",       label: "Basic Auth",             desc: "Username & password (Base64 encoded)" },
  { value: "oauth2",      label: "OAuth 2.0",              desc: "Auto-fetch access token using client ID & secret" },
  { value: "awssigv4",    label: "AWS Sig v4",             desc: "Sign requests for AWS services" },
  { value: "digest",      label: "Digest Auth",            desc: "HTTP Digest challenge-response (MD5)" },
  { value: "hmac",        label: "HMAC Signature",         desc: "Sign requests with a shared secret" },
  { value: "customtoken", label: "Custom Token",           desc: "Any header name with a static token value" },
];

const METHOD_COLORS: Record<string, string> = {
  GET:    "bg-green-500/20 text-green-400 border-green-500/30",
  POST:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PUT:    "bg-amber-500/20 text-amber-400 border-amber-500/30",
  PATCH:  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
};

const emptyForm = {
  name: "", baseUrl: "", method: "GET", headers: "",
  authType: "none", authKey: "", authValue: "", description: "",
  authConfig: {} as Record<string, string>,
  testBody: "",
};

function parseAuthConfig(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export default function ApiIntegrationsPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiIntegration | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [testResult, setTestResult] = useState<{ id: number; data: any } | null>(null);
  const [snippet, setSnippet] = useState<string | null>(null);
  const [snippetId, setSnippetId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [filterAuth, setFilterAuth] = useState<string | null>(null);

  const { data: integrations = [], isLoading } = useQuery<ApiIntegration[]>({ queryKey: ["/api/integrations"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/integrations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setOpen(false); setForm(emptyForm);
      toast({ title: "Integration created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/integrations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setOpen(false); setEditing(null); setForm(emptyForm);
      toast({ title: "Integration updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/integrations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: "Integration deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function setAc(key: string, val: string) {
    setForm(f => ({ ...f, authConfig: { ...f.authConfig, [key]: val } }));
  }

  function openNew() { setEditing(null); setForm(emptyForm); setTestResult(null); setOpen(true); }
  function openEdit(item: ApiIntegration) {
    setEditing(item);
    setForm({
      name: item.name, baseUrl: item.baseUrl, method: item.method,
      headers: item.headers || "", authType: item.authType,
      authKey: item.authKey || "", authValue: item.authValue || "",
      description: item.description || "",
      authConfig: parseAuthConfig(item.authConfig),
      testBody: "",
    });
    setTestResult(null);
    setOpen(true);
  }

  async function handleTest(id: number, bodyStr?: string) {
    setTestingId(id); setTestResult(null);
    try {
      let parsedBody: any = {};
      if (bodyStr) { try { parsedBody = JSON.parse(bodyStr); } catch { parsedBody = {}; } }
      const res = await apiRequest("POST", `/api/integrations/${id}/test`, { body: parsedBody });
      const data = await res.json();
      setTestResult({ id, data });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    } catch (e: any) {
      setTestResult({ id, data: { error: e.message } });
    } finally { setTestingId(null); }
  }

  async function handleSnippet(id: number) {
    setSnippetId(id);
    try {
      const res = await apiRequest("GET", `/api/integrations/${id}/snippet`);
      const data = await res.json();
      setSnippet(data.snippet);
    } catch (e: any) {
      toast({ title: "Failed to get snippet", description: e.message, variant: "destructive" });
    }
  }

  function copySnippet(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  }

  function handleSubmit() {
    const { testBody, ...rest } = form;
    const payload = {
      ...rest,
      headers: form.headers || null,
      authKey: form.authKey || null,
      authValue: form.authValue || null,
      description: form.description || null,
      authConfig: Object.keys(form.authConfig).length ? JSON.stringify(form.authConfig) : null,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }

  const statusBadge = (status: number | null) => {
    if (!status) return null;
    const ok = status >= 200 && status < 300;
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${ok ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
        {ok ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} {status}
      </span>
    );
  };

  const filtered = filterAuth
    ? integrations.filter(i => i.authType === filterAuth)
    : integrations;

  const isBodyMethod = ["POST", "PUT", "PATCH"].includes(form.method);

  return (
    <div className="flex-1 overflow-auto min-h-0 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Globe className="w-6 h-6 text-primary" /> API Integrations
            </h1>
            <p className="text-muted-foreground mt-1">Connect your apps to any external REST API. Test connections and grab ready-to-use code snippets.</p>
          </div>
          <Button onClick={openNew} data-testid="button-add-integration" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" /> Add Integration
          </Button>
        </div>

        {/* Auth Type Filter Chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <button
            onClick={() => setFilterAuth(null)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!filterAuth ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}
            data-testid="filter-auth-all"
          >
            All
          </button>
          {AUTH_TYPES.map(a => {
            const count = integrations.filter(i => i.authType === a.value).length;
            return (
              <button
                key={a.value}
                onClick={() => setFilterAuth(filterAuth === a.value ? null : a.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterAuth === a.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}
                data-testid={`filter-auth-${a.value}`}
                title={a.desc}
              >
                {a.label} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Integration List */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : filtered.length === 0 && integrations.length === 0 ? (
          <Card className="border-dashed border-2 border-border bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Globe className="w-12 h-12 text-muted-foreground mb-4 opacity-40" />
              <h3 className="text-lg font-semibold mb-2">No integrations yet</h3>
              <p className="text-muted-foreground mb-4 max-w-sm">Connect your AI-generated apps to any REST API — weather, payments, AI models, databases, and more.</p>
              <Button onClick={openNew} data-testid="button-add-first-integration">
                <Plus className="w-4 h-4 mr-2" />Add your first integration
              </Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No integrations with "{AUTH_TYPES.find(a => a.value === filterAuth)?.label}" auth.</p>
            <Button variant="link" size="sm" onClick={() => setFilterAuth(null)}>Clear filter</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((item) => (
              <Card key={item.id} className="bg-card border-border hover:border-primary/40 transition-colors" data-testid={`card-integration-${item.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{item.name}</CardTitle>
                      {item.description && <CardDescription className="mt-1 text-xs line-clamp-2">{item.description}</CardDescription>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded border font-bold ${METHOD_COLORS[item.method] || "bg-muted"}`}>{item.method}</span>
                      {item.authType !== "none" && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs font-mono text-muted-foreground truncate bg-muted/50 px-2 py-1 rounded">{item.baseUrl}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                      {AUTH_TYPES.find(a => a.value === item.authType)?.label || item.authType}
                    </Badge>
                    {item.lastTestStatus ? statusBadge(item.lastTestStatus) : null}
                    {item.lastTestedAt && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {new Date(item.lastTestedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(item)} data-testid={`button-edit-integration-${item.id}`} className="flex-1">Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => handleTest(item.id)} disabled={testingId === item.id} data-testid={`button-test-integration-${item.id}`}>
                      <TestTube className="w-3.5 h-3.5 mr-1" />{testingId === item.id ? "…" : "Test"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleSnippet(item.id)} data-testid={`button-snippet-integration-${item.id}`} title="Get code snippet">
                      <Code className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { if (confirm("Delete this integration?")) deleteMutation.mutate(item.id); }} disabled={deleteMutation.isPending} className="text-destructive hover:text-destructive hover:bg-destructive/10" data-testid={`button-delete-integration-${item.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {testingId === item.id && (
                    <div className="text-xs text-muted-foreground animate-pulse flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Sending request…
                    </div>
                  )}
                  {testResult?.id === item.id && (
                    <div className={`p-3 rounded-lg text-xs font-mono border ${testResult.data.error ? "bg-red-500/10 text-red-400 border-red-500/20" : (testResult.data.status >= 200 && testResult.data.status < 300) ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"}`}>
                      {testResult.data.error ? (
                        <span>Error: {testResult.data.error}</span>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            {statusBadge(testResult.data.status)}
                            <span className="text-muted-foreground">{testResult.data.elapsed}ms</span>
                          </div>
                          <pre className="overflow-auto max-h-32 whitespace-pre-wrap">{JSON.stringify(testResult.data.body, null, 2).slice(0, 800)}</pre>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Snippet Modal */}
        {snippet && snippetId && (
          <Dialog open={!!snippet} onOpenChange={() => { setSnippet(null); setSnippetId(null); setCopied(false); }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Code className="w-4 h-4 text-primary" />
                  Code Snippet — {integrations.find(i => i.id === snippetId)?.name}
                </DialogTitle>
              </DialogHeader>
              <pre className="text-xs bg-muted rounded-lg p-4 overflow-auto max-h-96 whitespace-pre-wrap border border-border">{snippet}</pre>
              <Button onClick={() => copySnippet(snippet)} className="w-full" data-testid="button-copy-snippet">
                {copied ? <><Check className="w-4 h-4 mr-2" />Copied!</> : <><Copy className="w-4 h-4 mr-2" />Copy to Clipboard</>}
              </Button>
            </DialogContent>
          </Dialog>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm); setTestResult(null); } }}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? `Edit — ${editing.name}` : "Add Integration"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Stripe Payments" data-testid="input-integration-name" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Base URL *</Label>
                  <Input value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))} placeholder="https://api.example.com/v1/endpoint" data-testid="input-integration-url" />
                </div>
                <div className="space-y-1">
                  <Label>HTTP Method</Label>
                  <Select value={form.method} onValueChange={v => setForm(f => ({ ...f, method: v }))}>
                    <SelectTrigger data-testid="select-integration-method"><SelectValue /></SelectTrigger>
                    <SelectContent>{HTTP_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Auth Type</Label>
                  <Select value={form.authType} onValueChange={v => setForm(f => ({ ...f, authType: v, authKey: "", authValue: "", authConfig: {} }))}>
                    <SelectTrigger data-testid="select-integration-auth"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AUTH_TYPES.map(a => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.authType !== "none" && (
                    <p className="text-xs text-muted-foreground">{AUTH_TYPES.find(a => a.value === form.authType)?.desc}</p>
                  )}
                </div>

                {/* API Key */}
                {form.authType === "apikey" && (
                  <>
                    <div className="space-y-1">
                      <Label>Header Name</Label>
                      <Input value={form.authKey} onChange={e => setForm(f => ({ ...f, authKey: e.target.value }))} placeholder="X-API-Key" data-testid="input-integration-authkey" />
                    </div>
                    <div className="space-y-1">
                      <Label>API Key Value</Label>
                      <Input type="password" value={form.authValue} onChange={e => setForm(f => ({ ...f, authValue: e.target.value }))} placeholder="sk-..." data-testid="input-integration-authvalue" />
                    </div>
                  </>
                )}

                {/* Bearer Token */}
                {form.authType === "bearer" && (
                  <div className="col-span-2 space-y-1">
                    <Label>Bearer Token</Label>
                    <Input type="password" value={form.authValue} onChange={e => setForm(f => ({ ...f, authValue: e.target.value }))} placeholder="eyJhbGciOiJIUzI1NiJ9..." data-testid="input-integration-authvalue" />
                  </div>
                )}

                {/* Basic Auth */}
                {form.authType === "basic" && (
                  <div className="col-span-2 space-y-1">
                    <Label>Username : Password</Label>
                    <Input type="password" value={form.authValue} onChange={e => setForm(f => ({ ...f, authValue: e.target.value }))} placeholder="username:password" data-testid="input-integration-authvalue" />
                  </div>
                )}

                {/* Custom Token */}
                {form.authType === "customtoken" && (
                  <>
                    <div className="space-y-1">
                      <Label>Header Name</Label>
                      <Input value={form.authKey} onChange={e => setForm(f => ({ ...f, authKey: e.target.value }))} placeholder="X-Custom-Token" data-testid="input-integration-authkey" />
                    </div>
                    <div className="space-y-1">
                      <Label>Token Value</Label>
                      <Input type="password" value={form.authValue} onChange={e => setForm(f => ({ ...f, authValue: e.target.value }))} placeholder="my-secret-token" data-testid="input-integration-authvalue" />
                    </div>
                  </>
                )}

                {/* OAuth 2.0 */}
                {form.authType === "oauth2" && (
                  <>
                    <div className="col-span-2 space-y-1">
                      <Label>Token URL</Label>
                      <Input value={form.authConfig.tokenUrl || ""} onChange={e => setAc("tokenUrl", e.target.value)} placeholder="https://auth.example.com/oauth/token" data-testid="input-oauth-tokenurl" />
                    </div>
                    <div className="space-y-1">
                      <Label>Client ID</Label>
                      <Input value={form.authConfig.clientId || ""} onChange={e => setAc("clientId", e.target.value)} placeholder="your_client_id" data-testid="input-oauth-clientid" />
                    </div>
                    <div className="space-y-1">
                      <Label>Client Secret</Label>
                      <Input type="password" value={form.authConfig.clientSecret || ""} onChange={e => setAc("clientSecret", e.target.value)} placeholder="your_client_secret" data-testid="input-oauth-clientsecret" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label>Scope <span className="text-muted-foreground">(optional)</span></Label>
                      <Input value={form.authConfig.scope || ""} onChange={e => setAc("scope", e.target.value)} placeholder="read write" data-testid="input-oauth-scope" />
                    </div>
                  </>
                )}

                {/* AWS Signature v4 */}
                {form.authType === "awssigv4" && (
                  <>
                    <div className="space-y-1">
                      <Label>Access Key ID</Label>
                      <Input value={form.authConfig.accessKey || ""} onChange={e => setAc("accessKey", e.target.value)} placeholder="AKIAIOSFODNN7EXAMPLE" data-testid="input-aws-accesskey" />
                    </div>
                    <div className="space-y-1">
                      <Label>Secret Access Key</Label>
                      <Input type="password" value={form.authConfig.secretKey || ""} onChange={e => setAc("secretKey", e.target.value)} placeholder="wJalrXUtnFEMI/K7MDENG..." data-testid="input-aws-secretkey" />
                    </div>
                    <div className="space-y-1">
                      <Label>AWS Region</Label>
                      <Input value={form.authConfig.region || ""} onChange={e => setAc("region", e.target.value)} placeholder="us-east-1" data-testid="input-aws-region" />
                    </div>
                    <div className="space-y-1">
                      <Label>Service</Label>
                      <Input value={form.authConfig.service || ""} onChange={e => setAc("service", e.target.value)} placeholder="execute-api" data-testid="input-aws-service" />
                    </div>
                  </>
                )}

                {/* Digest Auth */}
                {form.authType === "digest" && (
                  <div className="col-span-2 space-y-1">
                    <Label>Username : Password</Label>
                    <Input type="password" value={form.authValue} onChange={e => setForm(f => ({ ...f, authValue: e.target.value }))} placeholder="username:password" data-testid="input-integration-authvalue" />
                    <p className="text-xs text-muted-foreground">Credentials are used in MD5 challenge-response flow</p>
                  </div>
                )}

                {/* HMAC Signature */}
                {form.authType === "hmac" && (
                  <>
                    <div className="space-y-1">
                      <Label>Signature Header</Label>
                      <Input value={form.authKey} onChange={e => setForm(f => ({ ...f, authKey: e.target.value }))} placeholder="X-Signature" data-testid="input-hmac-header" />
                    </div>
                    <div className="space-y-1">
                      <Label>Algorithm</Label>
                      <Select value={form.authConfig.algorithm || "sha256"} onValueChange={v => setAc("algorithm", v)}>
                        <SelectTrigger data-testid="select-hmac-algorithm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sha256">HMAC-SHA256</SelectItem>
                          <SelectItem value="sha512">HMAC-SHA512</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Shared Secret</Label>
                      <Input type="password" value={form.authConfig.secret || ""} onChange={e => setAc("secret", e.target.value)} placeholder="your-shared-secret" data-testid="input-hmac-secret" />
                    </div>
                    <div className="space-y-1">
                      <Label>Prefix <span className="text-muted-foreground">(optional)</span></Label>
                      <Input value={form.authConfig.prefix || ""} onChange={e => setAc("prefix", e.target.value)} placeholder="sha256=" data-testid="input-hmac-prefix" />
                    </div>
                  </>
                )}

                {/* Custom Headers */}
                <div className="col-span-2 space-y-1">
                  <Label>Custom Headers <span className="text-muted-foreground">(JSON, optional)</span></Label>
                  <Textarea value={form.headers} onChange={e => setForm(f => ({ ...f, headers: e.target.value }))} placeholder={'{"Accept": "application/json", "X-Version": "2"}'} rows={2} className="font-mono text-xs" data-testid="input-integration-headers" />
                </div>

                {/* Description */}
                <div className="col-span-2 space-y-1">
                  <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this API do?" data-testid="input-integration-description" />
                </div>

                {/* Test Body — only for POST/PUT/PATCH */}
                {isBodyMethod && editing && (
                  <div className="col-span-2 space-y-1">
                    <Label>Test Request Body <span className="text-muted-foreground">(JSON, for Test only)</span></Label>
                    <Textarea
                      value={form.testBody}
                      onChange={e => setForm(f => ({ ...f, testBody: e.target.value }))}
                      placeholder={'{\n  "key": "value"\n}'}
                      rows={3}
                      className="font-mono text-xs"
                      data-testid="input-integration-testbody"
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSubmit} disabled={!form.name || !form.baseUrl || createMutation.isPending || updateMutation.isPending} className="flex-1" data-testid="button-save-integration">
                  {createMutation.isPending || updateMutation.isPending ? "Saving…" : editing ? "Update Integration" : "Create Integration"}
                </Button>
                {editing && (
                  <Button variant="outline" onClick={() => handleTest(editing.id, form.testBody)} disabled={testingId === editing.id} data-testid="button-test-integration-modal">
                    <TestTube className="w-4 h-4 mr-1" />{testingId === editing.id ? "Testing…" : "Test"}
                  </Button>
                )}
              </div>

              {/* In-dialog test result */}
              {testResult?.id === editing?.id && (
                <div className={`p-3 rounded-lg text-xs font-mono border ${testResult.data.error ? "bg-red-500/10 text-red-400 border-red-500/20" : (testResult.data.status >= 200 && testResult.data.status < 300) ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"}`}>
                  {testResult.data.error ? (
                    <span>Error: {testResult.data.error}</span>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        {statusBadge(testResult.data.status)}
                        <span className="text-muted-foreground">{testResult.data.elapsed}ms</span>
                      </div>
                      <pre className="overflow-auto max-h-40 whitespace-pre-wrap">{JSON.stringify(testResult.data.body, null, 2).slice(0, 1000)}</pre>
                    </>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
