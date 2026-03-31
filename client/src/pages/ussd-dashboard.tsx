import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, Edit2, Copy, Check, Smartphone, Zap, Globe,
  BarChart3, Power, PowerOff, ExternalLink, Code2, Info
} from "lucide-react";

interface UssdApp {
  id: number;
  name: string;
  description: string | null;
  knowledgeBase: string | null;
  apiKey: string;
  isActive: boolean;
  sessionsUsed: number;
  createdAt: string;
}

interface UssdSubscription {
  plan: string;
  status: string;
  expiresAt: string | null;
}

const PLAN_LIMITS: Record<string, number> = { starter: 1, growth: 5, enterprise: -1 };

const emptyForm = { name: "", description: "", knowledgeBase: "" };

export default function UssdDashboardPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UssdApp | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [copied, setCopied] = useState<string | null>(null);
  const [showGateway, setShowGateway] = useState<UssdApp | null>(null);

  const { data: subscription } = useQuery<UssdSubscription | null>({
    queryKey: ["/api/ussd/subscription"],
  });

  const { data: apps = [], isLoading } = useQuery<UssdApp[]>({
    queryKey: ["/api/ussd/apps"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ussd/apps", data),
    onSuccess: async (res) => {
      const data = await res.json();
      if (data.message === "SUBSCRIPTION_REQUIRED") {
        toast({ title: "Subscription required", description: "Subscribe to a USSD plan to create apps.", variant: "destructive" });
        return;
      }
      if (data.message === "APP_LIMIT_REACHED") {
        toast({ title: "Limit reached", description: `Your ${data.plan} plan allows ${data.limit} app(s). Upgrade to create more.`, variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/ussd/apps"] });
      setOpen(false); setForm(emptyForm);
      toast({ title: "USSD App created!", description: "Your gateway is ready." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/ussd/apps/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ussd/apps"] });
      setOpen(false); setEditing(null); setForm(emptyForm);
      toast({ title: "App updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/ussd/apps/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ussd/apps"] }); toast({ title: "App deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => apiRequest("PATCH", `/api/ussd/apps/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ussd/apps"] }),
  });

  function openNew() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function openEdit(app: UssdApp) {
    setEditing(app);
    setForm({ name: app.name, description: app.description || "", knowledgeBase: app.knowledgeBase || "" });
    setOpen(true);
  }

  function handleSubmit() {
    const payload = { name: form.name, description: form.description || null, knowledgeBase: form.knowledgeBase || null };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "Copied!" });
  }

  const gatewayUrl = (app: UssdApp) => `https://afroaigroup.com/api/ussd/gateway/${app.apiKey}`;

  const planLabel = subscription?.plan ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1) : null;
  const appLimit = subscription?.plan ? PLAN_LIMITS[subscription.plan] ?? 1 : 0;

  return (
    <div className="flex-1 overflow-auto min-h-0 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Smartphone className="w-6 h-6 text-primary" /> USSD Apps
            </h1>
            <p className="text-muted-foreground mt-1">Manage your AI-powered USSD gateway apps for Africa's Talking, Pegasus, and Yo! Uganda.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {subscription ? (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                {planLabel} Plan {appLimit !== -1 ? `· ${apps.length}/${appLimit} apps` : "· Unlimited"}
              </Badge>
            ) : (
              <a href="/ussd">
                <Button size="sm" variant="outline" className="text-xs">Subscribe to create apps</Button>
              </a>
            )}
            <Button onClick={openNew} data-testid="button-create-ussd-app" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" /> New App
            </Button>
          </div>
        </div>

        {/* How it works banner */}
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="py-4 px-5">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-mono">
              <span className="text-amber-400 font-bold text-sm font-sans">How it connects:</span>
              <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded">User dials *123#</span>
              <span>→</span>
              <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded">Africa's Talking</span>
              <span>→</span>
              <span className="bg-amber-500/20 text-amber-400 px-2 py-1 rounded">Your Gateway URL</span>
              <span>→</span>
              <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded">Afro AI (GPT-4.1)</span>
              <span>→</span>
              <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded">User sees answer</span>
            </div>
          </CardContent>
        </Card>

        {/* Apps list */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map(i => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : apps.length === 0 ? (
          <Card className="border-dashed border-2 border-border bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Smartphone className="w-12 h-12 text-muted-foreground mb-4 opacity-40" />
              <h3 className="text-lg font-semibold mb-2">No USSD apps yet</h3>
              <p className="text-muted-foreground mb-4 max-w-sm text-sm">Create your first USSD app to get a gateway URL you can register with Africa's Talking, Pegasus, or Yo! Uganda.</p>
              <Button onClick={openNew} data-testid="button-create-first-ussd-app">
                <Plus className="w-4 h-4 mr-2" /> Create Your First App
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {apps.map((app) => (
              <Card key={app.id} className={`border transition-colors ${app.isActive ? "border-border hover:border-primary/40" : "border-border opacity-60"}`} data-testid={`card-ussd-app-${app.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base truncate">{app.name}</CardTitle>
                        <Badge variant="outline" className={`text-xs shrink-0 ${app.isActive ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-muted-foreground"}`}>
                          {app.isActive ? "Active" : "Paused"}
                        </Badge>
                      </div>
                      {app.description && <CardDescription className="mt-1 text-xs line-clamp-2">{app.description}</CardDescription>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {app.sessionsUsed.toLocaleString()} sessions</span>
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" /> AI-powered</span>
                  </div>

                  {/* Gateway URL */}
                  <div className="bg-muted/50 rounded-lg px-3 py-2 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Gateway URL</p>
                    <p className="text-xs font-mono text-foreground truncate">{gatewayUrl(app)}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap pt-1">
                    <Button size="sm" variant="outline" onClick={() => setShowGateway(app)} className="flex-1" data-testid={`button-setup-ussd-${app.id}`}>
                      <Code2 className="w-3.5 h-3.5 mr-1" /> Setup Guide
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => copy(gatewayUrl(app), `url-${app.id}`)} data-testid={`button-copy-url-${app.id}`}>
                      {copied === `url-${app.id}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(app)} data-testid={`button-edit-ussd-${app.id}`}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: app.id, isActive: !app.isActive })} title={app.isActive ? "Pause" : "Activate"} data-testid={`button-toggle-ussd-${app.id}`}>
                      {app.isActive ? <PowerOff className="w-3.5 h-3.5 text-amber-400" /> : <Power className="w-3.5 h-3.5 text-green-400" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { if (confirm("Delete this USSD app?")) deleteMutation.mutate(app.id); }} className="text-destructive hover:text-destructive hover:bg-destructive/10" data-testid={`button-delete-ussd-${app.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? `Edit — ${editing.name}` : "Create USSD App"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>App Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. URA Tax Assistant" data-testid="input-ussd-name" />
              </div>
              <div className="space-y-1">
                <Label>Description <span className="text-muted-foreground">(shown to users as "About")</span></Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="A tax assistant for Uganda Revenue Authority" data-testid="input-ussd-description" />
              </div>
              <div className="space-y-1">
                <Label>AI Knowledge Base</Label>
                <p className="text-xs text-muted-foreground">Paste FAQs, service info, pricing, contacts — anything the AI should know to answer user questions via USSD.</p>
                <Textarea
                  value={form.knowledgeBase}
                  onChange={e => setForm(f => ({ ...f, knowledgeBase: e.target.value }))}
                  placeholder={"Service name: URA Tax Assistant\nOffice hours: Mon-Fri 8am-5pm\nTax types: Income Tax, VAT, PAYE\nContact: 0800 117 000\n\nFAQ:\nQ: How do I file VAT?\nA: Log to efris.ura.go.ug or dial *285#"}
                  rows={8}
                  className="font-mono text-xs"
                  data-testid="textarea-ussd-knowledge"
                />
              </div>
              <Button onClick={handleSubmit} disabled={!form.name || createMutation.isPending || updateMutation.isPending} className="w-full" data-testid="button-save-ussd-app">
                {createMutation.isPending || updateMutation.isPending ? "Saving…" : editing ? "Update App" : "Create App"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Setup Guide Modal */}
        {showGateway && (
          <Dialog open={!!showGateway} onOpenChange={() => setShowGateway(null)}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-primary" /> Setup Guide — {showGateway.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-5 text-sm">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <p className="font-semibold text-green-400 mb-1">Your Gateway URL</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1 break-all">{gatewayUrl(showGateway)}</code>
                    <Button size="sm" variant="outline" onClick={() => copy(gatewayUrl(showGateway), "guide-url")}>
                      {copied === "guide-url" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Paste this as the "Callback URL" in Africa's Talking, Pegasus, or Yo! Uganda dashboard.</p>
                </div>

                <div className="space-y-3">
                  <p className="font-semibold">Step 1 — Africa's Talking Setup</p>
                  <ol className="text-muted-foreground space-y-2 list-decimal list-inside text-sm">
                    <li>Go to <a href="https://account.africastalking.com" target="_blank" className="text-primary underline">account.africastalking.com</a> and log in</li>
                    <li>Go to <strong>USSD → Create Channel</strong></li>
                    <li>Enter your shortcode (e.g. <code className="bg-muted px-1 rounded">*185*7#</code>) or request a shared code</li>
                    <li>Set <strong>Callback URL</strong> to your gateway URL above</li>
                    <li>Save and go live</li>
                  </ol>
                </div>

                <div className="space-y-3">
                  <p className="font-semibold">Step 2 — Test Locally (optional)</p>
                  <p className="text-muted-foreground text-xs">Use curl to simulate a USSD call:</p>
                  <div className="relative">
                    <pre className="bg-muted rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap border border-border">{`curl -X POST "${gatewayUrl(showGateway)}" \\
  -d "sessionId=test123" \\
  -d "serviceCode=*185*7#" \\
  -d "phoneNumber=+256700000000" \\
  -d "text="`}</pre>
                    <Button size="sm" variant="ghost" className="absolute top-2 right-2" onClick={() => copy(`curl -X POST "${gatewayUrl(showGateway)}" -d "sessionId=test123" -d "serviceCode=*185*7#" -d "phoneNumber=+256700000000" -d "text="`, "curl")}>
                      {copied === "curl" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="font-semibold">Step 3 — USSD Menu Flow</p>
                  <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs space-y-1 border border-border">
                    <p className="text-amber-400">User dials your shortcode</p>
                    <p>→ <span className="text-green-400">CON Welcome to {showGateway.name}</span></p>
                    <p className="text-muted-foreground pl-4">1. Ask AI a Question</p>
                    <p className="text-muted-foreground pl-4">2. About this Service</p>
                    <p className="text-muted-foreground pl-4">3. Contact Support</p>
                    <p className="mt-2">User presses <span className="text-blue-400">1</span></p>
                    <p>→ <span className="text-green-400">CON Ask {showGateway.name} anything:</span></p>
                    <p>User types their question</p>
                    <p>→ <span className="text-green-400">END [AI answer from your knowledge base]</span></p>
                  </div>
                </div>

                <div className="bg-muted/30 border border-border rounded-lg p-3 flex gap-2">
                  <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">USSD responses are limited to 182 characters. The AI is tuned to give short, clear answers that fit within this limit.</p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
