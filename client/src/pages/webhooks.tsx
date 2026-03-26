import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Zap, TestTube, CheckCircle, XCircle, Clock, Lock, Globe } from "lucide-react";

interface Webhook {
  id: number;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  isActive: boolean;
  publishedAppId: number | null;
  lastTriggeredAt: string | null;
  lastStatus: number | null;
  createdAt: string;
}
interface PublishedApp { id: number; title: string; subdomain: string; }

const ALL_EVENTS = [
  { value: "form.submitted", label: "Form Submitted", desc: "Triggered when a form in your app receives a submission" },
  { value: "app.viewed", label: "App Viewed", desc: "Triggered when someone visits your published app" },
  { value: "marketplace.cloned", label: "Marketplace Clone", desc: "Triggered when someone clones your app from the marketplace" },
];

const emptyForm = { name: "", url: "", events: [] as string[], secret: "", publishedAppId: "" };

function EventToggle({ event, selected, onToggle }: { event: typeof ALL_EVENTS[0]; selected: boolean; onToggle: () => void }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selected ? "border-primary/50 bg-primary/5" : "border-border hover:border-border/80"}`} onClick={onToggle}>
      <div className={`w-4 h-4 rounded border-2 mt-0.5 flex items-center justify-center shrink-0 transition-colors ${selected ? "bg-primary border-primary" : "border-muted-foreground"}`}>
        {selected && <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </div>
      <div>
        <p className="text-sm font-medium">{event.label}</p>
        <p className="text-xs text-muted-foreground">{event.desc}</p>
        <code className="text-xs text-primary mt-0.5 block">{event.value}</code>
      </div>
    </div>
  );
}

export default function WebhooksPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; status: number }>>({});

  const { data: webhooks = [], isLoading } = useQuery<Webhook[]>({ queryKey: ["/api/webhooks"] });
  const { data: apps = [] } = useQuery<PublishedApp[]>({ queryKey: ["/api/published-apps"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/webhooks", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] }); setOpen(false); setForm(emptyForm); toast({ title: "Webhook created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/webhooks/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] }); setOpen(false); setEditing(null); setForm(emptyForm); toast({ title: "Webhook updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => apiRequest("PATCH", `/api/webhooks/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/webhooks/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] }); toast({ title: "Webhook deleted" }); },
  });

  function openNew() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function openEdit(w: Webhook) {
    setEditing(w);
    setForm({ name: w.name, url: w.url, events: w.events, secret: w.secret || "", publishedAppId: w.publishedAppId?.toString() || "" });
    setOpen(true);
  }

  function toggleEvent(event: string) {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }));
  }

  async function handleTest(id: number) {
    setTestingId(id);
    try {
      const res = await apiRequest("POST", `/api/webhooks/${id}/test`, {});
      const data = await res.json();
      setTestResults(r => ({ ...r, [id]: { ok: data.ok, status: data.status } }));
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      toast({ title: data.ok ? "Test delivered successfully" : `Test sent — HTTP ${data.status}` });
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  }

  function handleSubmit() {
    const payload = { ...form, publishedAppId: form.publishedAppId ? parseInt(form.publishedAppId) : null, secret: form.secret || null };
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
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Zap className="w-6 h-6 text-primary" /> Webhooks
            </h1>
            <p className="text-muted-foreground mt-1">Get notified in real-time when events happen in your apps. Connect to Slack, Discord, Zapier, or any service.</p>
          </div>
          <Button onClick={openNew} data-testid="button-add-webhook" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" /> Add Webhook
          </Button>
        </div>

        {/* Event reference */}
        <Card className="border-border bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Available Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {ALL_EVENTS.map(e => (
                <div key={e.value} className="space-y-1">
                  <code className="text-xs text-primary">{e.value}</code>
                  <p className="text-xs text-muted-foreground">{e.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : webhooks.length === 0 ? (
          <Card className="border-dashed border-2 border-border bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Zap className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No webhooks configured</h3>
              <p className="text-muted-foreground mb-4 max-w-sm">Send real-time event data to Slack, Discord, Zapier, Make, or any HTTP endpoint when things happen in your apps.</p>
              <Button onClick={openNew} data-testid="button-add-first-webhook"><Plus className="w-4 h-4 mr-2" />Create your first webhook</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {webhooks.map(w => (
              <Card key={w.id} className={`border-border transition-colors ${w.isActive ? "hover:border-primary/40" : "opacity-60"}`} data-testid={`card-webhook-${w.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{w.name}</span>
                        {!w.isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                        {w.secret && <Lock className="w-3.5 h-3.5 text-muted-foreground" title="HMAC signed" />}
                      </div>
                      <p className="text-xs font-mono text-muted-foreground truncate bg-muted/50 px-2 py-1 rounded">{w.url}</p>
                      <div className="flex flex-wrap gap-1">
                        {w.events.map(e => <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>)}
                        {w.events.length === 0 && <span className="text-xs text-muted-foreground">No events selected</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {w.lastStatus && statusBadge(w.lastStatus)}
                        {w.lastTriggeredAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last: {new Date(w.lastTriggeredAt).toLocaleString()}</span>}
                        {w.publishedAppId && <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{apps.find(a => a.id === w.publishedAppId)?.subdomain}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={w.isActive} onCheckedChange={v => toggleMutation.mutate({ id: w.id, isActive: v })} data-testid={`switch-webhook-${w.id}`} />
                      <Button size="sm" variant="outline" onClick={() => handleTest(w.id)} disabled={testingId === w.id} data-testid={`button-test-webhook-${w.id}`}>
                        <TestTube className="w-3.5 h-3.5 mr-1" />{testingId === w.id ? "…" : "Test"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(w)} data-testid={`button-edit-webhook-${w.id}`}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => deleteMutation.mutate(w.id)} className="text-destructive hover:text-destructive" data-testid={`button-delete-webhook-${w.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Webhook" : "Add Webhook"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Slack Notifications" data-testid="input-webhook-name" />
              </div>
              <div className="space-y-1">
                <Label>Endpoint URL *</Label>
                <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://hooks.slack.com/..." data-testid="input-webhook-url" />
              </div>
              <div className="space-y-2">
                <Label>Events to Listen To *</Label>
                <div className="space-y-2">
                  {ALL_EVENTS.map(e => (
                    <EventToggle key={e.value} event={e} selected={form.events.includes(e.value)} onToggle={() => toggleEvent(e.value)} />
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Target App (optional)</Label>
                <Select value={form.publishedAppId || "all"} onValueChange={v => setForm(f => ({ ...f, publishedAppId: v === "all" ? "" : v }))}>
                  <SelectTrigger data-testid="select-webhook-app"><SelectValue placeholder="All apps" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All apps</SelectItem>
                    {apps.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1"><Lock className="w-3.5 h-3.5" />Secret (for HMAC signing)</Label>
                <Input type="password" value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} placeholder="Optional — signs payloads with X-Afroai-Signature" data-testid="input-webhook-secret" />
                <p className="text-xs text-muted-foreground">Verify delivery authenticity using <code>sha256=HMAC(secret, body)</code></p>
              </div>
              <Button onClick={handleSubmit} disabled={!form.name || !form.url || form.events.length === 0 || createMutation.isPending || updateMutation.isPending} className="w-full" data-testid="button-save-webhook">
                {createMutation.isPending || updateMutation.isPending ? "Saving…" : editing ? "Update Webhook" : "Create Webhook"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
