import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Zap, Code, TestTube, CheckCircle, XCircle, Clock, Globe, Lock, Key } from "lucide-react";

interface ApiIntegration {
  id: number;
  name: string;
  baseUrl: string;
  method: string;
  headers: string | null;
  authType: string;
  authKey: string | null;
  authValue: string | null;
  description: string | null;
  lastTestedAt: string | null;
  lastTestStatus: number | null;
  createdAt: string;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const AUTH_TYPES = [
  { value: "none", label: "No Auth" },
  { value: "apikey", label: "API Key" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-green-500/20 text-green-400 border-green-500/30",
  POST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  PATCH: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
};

const emptyForm = { name: "", baseUrl: "", method: "GET", headers: "", authType: "none", authKey: "", authValue: "", description: "" };

export default function ApiIntegrationsPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiIntegration | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [testResult, setTestResult] = useState<any>(null);
  const [snippet, setSnippet] = useState<string | null>(null);
  const [snippetId, setSnippetId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  const { data: integrations = [], isLoading } = useQuery<ApiIntegration[]>({ queryKey: ["/api/integrations"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/integrations", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/integrations"] }); setOpen(false); setForm(emptyForm); toast({ title: "Integration created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/integrations/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/integrations"] }); setOpen(false); setEditing(null); setForm(emptyForm); toast({ title: "Integration updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/integrations/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/integrations"] }); toast({ title: "Integration deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openNew() { setEditing(null); setForm(emptyForm); setTestResult(null); setOpen(true); }
  function openEdit(item: ApiIntegration) {
    setEditing(item);
    setForm({ name: item.name, baseUrl: item.baseUrl, method: item.method, headers: item.headers || "", authType: item.authType, authKey: item.authKey || "", authValue: item.authValue || "", description: item.description || "" });
    setTestResult(null);
    setOpen(true);
  }

  async function handleTest(id: number) {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", `/api/integrations/${id}/test`, {});
      const data = await res.json();
      setTestResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    } catch (e: any) {
      setTestResult({ error: e.message });
    } finally {
      setTestingId(null);
    }
  }

  async function handleSnippet(id: number) {
    setSnippetId(id);
    try {
      const res = await apiRequest("GET", `/api/integrations/${id}/snippet`);
      const data = await res.json();
      setSnippet(data.snippet);
    } catch {}
  }

  function handleSubmit() {
    const payload = { ...form, headers: form.headers || null, authKey: form.authKey || null, authValue: form.authValue || null, description: form.description || null };
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

  return (
    <div className="flex-1 overflow-auto min-h-0 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
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

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : integrations.length === 0 ? (
          <Card className="border-dashed border-2 border-border bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Globe className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No integrations yet</h3>
              <p className="text-muted-foreground mb-4 max-w-sm">Connect your AI-generated apps to weather APIs, payment APIs, databases, or any REST service.</p>
              <Button onClick={openNew} data-testid="button-add-first-integration"><Plus className="w-4 h-4 mr-2" />Add your first integration</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrations.map((item) => (
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
                    {item.lastTestStatus && statusBadge(item.lastTestStatus)}
                    {item.lastTestedAt && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {new Date(item.lastTestedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(item)} data-testid={`button-edit-integration-${item.id}`} className="flex-1">Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => handleTest(item.id)} disabled={testingId === item.id} data-testid={`button-test-integration-${item.id}`}>
                      <TestTube className="w-3.5 h-3.5 mr-1" />{testingId === item.id ? "Testing…" : "Test"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleSnippet(item.id)} data-testid={`button-snippet-integration-${item.id}`}>
                      <Code className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deleteMutation.mutate(item.id)} disabled={deleteMutation.isPending} className="text-destructive hover:text-destructive" data-testid={`button-delete-integration-${item.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {testingId === item.id && <div className="text-xs text-muted-foreground animate-pulse">Sending request…</div>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Test Result Panel */}
        {testResult && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Test Result
                {testResult.status && statusBadge(testResult.status)}
                {testResult.elapsed && <span className="text-xs text-muted-foreground">{testResult.elapsed}ms</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {testResult.error ? (
                <p className="text-destructive text-sm">{testResult.error}</p>
              ) : (
                <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64">{JSON.stringify(testResult.body, null, 2)}</pre>
              )}
            </CardContent>
          </Card>
        )}

        {/* Snippet Modal */}
        {snippet && snippetId && (
          <Dialog open={!!snippet} onOpenChange={() => { setSnippet(null); setSnippetId(null); }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Code className="w-4 h-4 text-primary" />Code Snippet</DialogTitle></DialogHeader>
              <pre className="text-xs bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">{snippet}</pre>
              <Button onClick={() => { navigator.clipboard.writeText(snippet); toast({ title: "Copied to clipboard" }); }}>Copy</Button>
            </DialogContent>
          </Dialog>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm); setTestResult(null); } }}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Integration" : "Add Integration"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. OpenWeather API" data-testid="input-integration-name" />
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
                  <Select value={form.authType} onValueChange={v => setForm(f => ({ ...f, authType: v }))}>
                    <SelectTrigger data-testid="select-integration-auth"><SelectValue /></SelectTrigger>
                    <SelectContent>{AUTH_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
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
                {(form.authType === "bearer" || form.authType === "basic") && (
                  <div className="col-span-2 space-y-1">
                    <Label>{form.authType === "bearer" ? "Bearer Token" : "user:password"}</Label>
                    <Input type="password" value={form.authValue} onChange={e => setForm(f => ({ ...f, authValue: e.target.value }))} placeholder={form.authType === "bearer" ? "eyJ..." : "username:password"} data-testid="input-integration-authvalue" />
                  </div>
                )}
                <div className="col-span-2 space-y-1">
                  <Label>Custom Headers (JSON)</Label>
                  <Textarea value={form.headers} onChange={e => setForm(f => ({ ...f, headers: e.target.value }))} placeholder={'{"Accept": "application/json"}'} rows={2} className="font-mono text-xs" data-testid="input-integration-headers" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Description</Label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this API do?" data-testid="input-integration-description" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSubmit} disabled={!form.name || !form.baseUrl || createMutation.isPending || updateMutation.isPending} className="flex-1" data-testid="button-save-integration">
                  {createMutation.isPending || updateMutation.isPending ? "Saving…" : editing ? "Update" : "Create Integration"}
                </Button>
                {editing && (
                  <Button variant="outline" onClick={() => handleTest(editing.id)} disabled={testingId === editing.id} data-testid="button-test-integration-modal">
                    <TestTube className="w-4 h-4 mr-1" />{testingId === editing.id ? "Testing…" : "Test"}
                  </Button>
                )}
              </div>
              {testResult && (
                <div className={`p-3 rounded-lg text-xs font-mono ${testResult.error ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                  {testResult.error ? `Error: ${testResult.error}` : `HTTP ${testResult.status} · ${testResult.elapsed}ms\n${JSON.stringify(testResult.body, null, 2).slice(0, 500)}`}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
