import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bot, Plus, Trash2, Copy, Check, Code2, MessageSquare, Globe, Settings2 as Settings,
  Eye, EyeOff, Loader2, ExternalLink, Zap, Key, BookOpen, Palette, ScanLine, Sparkles
} from "lucide-react";
import type { ChatbotWidget } from "@shared/schema";

const SENSITIVE_CATEGORIES = [
  { id: "staff_contacts", label: "Staff personal phone numbers & home addresses" },
  { id: "hr_records", label: "Employee salaries, HR records & disciplinary matters" },
  { id: "passwords", label: "System passwords, login credentials & access codes" },
  { id: "server_details", label: "Database details, server IPs & internal infrastructure" },
  { id: "legal_cases", label: "Ongoing legal proceedings, investigations & court cases" },
  { id: "bank_details", label: "Bank account numbers, financial account details" },
  { id: "citizen_ids", label: "Citizens' personal ID numbers, NINs & private data" },
  { id: "audit_reports", label: "Internal audit reports & confidential investigations" },
  { id: "budget_details", label: "Confidential budgets, procurement details & vendor contracts" },
  { id: "security_protocols", label: "Security procedures, emergency protocols & access routes" },
  { id: "draft_policies", label: "Unpublished policy drafts & internal memos" },
  { id: "private_emails", label: "Private staff email addresses & internal communications" },
];

function buildOmitInstructions(selected: string[]): string {
  if (selected.length === 0) return "";
  const labels = SENSITIVE_CATEGORIES.filter(c => selected.includes(c.id)).map(c => c.label);
  return `\n\n## SENSITIVE — DO NOT DISCUSS\nNever answer questions about or reveal any information related to:\n${labels.map(l => `- ${l}`).join("\n")}\n\nIf asked about any of the above, respond: "I'm sorry, that information is confidential. Please contact us directly for assistance."`;
}

const EMBED_SNIPPET = (apiKey: string) =>
  `<!-- Afro AI Chat Widget -->\n<script src="https://afroaigroup.com/widget.js" data-key="${apiKey}" async></script>`;

export default function ChatbotsPage() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<ChatbotWidget | null>(null);
  const [showKey, setShowKey] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ChatbotWidget | null>(null);
  const [form, setForm] = useState({
    name: "", websiteUrl: "", knowledgeBase: "", primaryColor: "#D4A017",
    greeting: "Hi! How can I help you today?", widgetTitle: "AI Assistant",
    placeholder: "Type your question...",
  });
  const [scanning, setScanning] = useState(false);
  const [omitCategories, setOmitCategories] = useState<string[]>([]);
  const [showOmitList, setShowOmitList] = useState(false);
  const [createdWidget, setCreatedWidget] = useState<ChatbotWidget | null>(null);

  const toggleOmit = (id: string) =>
    setOmitCategories(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const scanUrl = async (url: string, onResult: (kb: string) => void) => {
    if (!url) return;
    setScanning(true);
    try {
      const r = await apiRequest("POST", "/api/chatbots/scan-url", { url });
      const data = await r.json();
      if (data.knowledge) {
        onResult(data.knowledge);
        toast({ title: "Website scanned!", description: "Knowledge base auto-filled. Review and add any missing details." });
      } else {
        toast({ title: "Scan failed", description: data.message || "Could not read website.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Scan failed", description: "Could not reach the website.", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const { data: widgets = [], isLoading } = useQuery<ChatbotWidget[]>({ queryKey: ["/api/chatbots"] });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/chatbots", data).then(r => r.json()),
    onSuccess: (w) => {
      queryClient.setQueryData(["/api/chatbots"], (old: any) => Array.isArray(old) ? [w, ...old] : [w]);
      queryClient.invalidateQueries({ queryKey: ["/api/chatbots"] });
      setSelected(w);
      setCreatedWidget(w);
      setOmitCategories([]);
      setShowOmitList(false);
      setForm({ name: "", websiteUrl: "", knowledgeBase: "", primaryColor: "#D4A017", greeting: "Hi! How can I help you today?", widgetTitle: "AI Assistant", placeholder: "Type your question..." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/chatbots/${id}`, data).then(r => r.json()),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbots"] });
      setSelected(updated);
      toast({ title: "Saved", description: "Changes updated successfully." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/chatbots/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbots"] });
      setDeleteConfirm(null);
      if (selected?.id === deleteConfirm?.id) setSelected(null);
      toast({ title: "Deleted", description: "Chatbot removed." });
    },
  });

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/60 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Chatbot API</h1>
            <p className="text-xs text-muted-foreground">Embed AI customer service on any website</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-2" data-testid="button-create-chatbot">
          <Plus className="w-4 h-4" /> New Chatbot
        </Button>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : widgets.length === 0 && !selected ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
              <Bot className="w-10 h-10 text-primary" />
            </div>
            <div className="max-w-md">
              <h2 className="text-xl font-bold mb-2">Embed AI on Any Website</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Create an AI chatbot for any business — government portals, agencies, shops. Give them an API key, they paste one line of code, and their customers get instant AI support 24/7.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 max-w-sm">
              {[
                { icon: Key, label: "API Key" },
                { icon: Code2, label: "1-Line Embed" },
                { icon: Zap, label: "Instant AI" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/30">
                  <Icon className="w-5 h-5 text-primary" />
                  <span className="text-xs font-medium">{label}</span>
                </div>
              ))}
            </div>
            <Button onClick={() => setShowCreate(true)} className="gap-2" data-testid="button-create-first-chatbot">
              <Plus className="w-4 h-4" /> Create Your First Chatbot
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 h-full">
            {/* Widget list */}
            <div className="border-r border-border/60 overflow-auto p-4 space-y-3">
              {widgets.map((w) => (
                <Card
                  key={w.id}
                  className={`cursor-pointer transition-all hover:border-primary/40 ${selected?.id === w.id ? "border-primary/60 bg-primary/5" : ""}`}
                  onClick={() => setSelected(w)}
                  data-testid={`card-chatbot-${w.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ backgroundColor: w.primaryColor + "30", border: `1px solid ${w.primaryColor}50` }}>
                          <div className="w-full h-full flex items-center justify-center">
                            <Bot className="w-4 h-4" style={{ color: w.primaryColor }} />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{w.name}</p>
                          {w.websiteUrl && <p className="text-xs text-muted-foreground truncate">{w.websiteUrl}</p>}
                        </div>
                      </div>
                      <Badge variant={w.isActive ? "default" : "secondary"} className="text-xs flex-shrink-0">
                        {w.isActive ? "Live" : "Off"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {w.conversationCount} chats</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button variant="outline" className="w-full gap-2 text-sm" onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" /> Add Another
              </Button>
            </div>

            {/* Widget detail */}
            {selected ? (
              <div className="col-span-2 overflow-auto">
                <WidgetDetail
                  widget={selected}
                  onUpdate={(data) => updateMutation.mutate({ id: selected.id, data })}
                  onDelete={() => setDeleteConfirm(selected)}
                  isUpdating={updateMutation.isPending}
                  copy={copy}
                  copied={copied}
                  showKey={showKey[selected.id] || false}
                  onToggleKey={() => setShowKey(prev => ({ ...prev, [selected.id]: !prev[selected.id] }))}
                />
              </div>
            ) : (
              <div className="col-span-2 flex items-center justify-center text-muted-foreground text-sm">
                Select a chatbot to view its settings and embed code
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate || !!createdWidget} onOpenChange={(open) => { if (!open) { setShowCreate(false); setCreatedWidget(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
          {createdWidget ? (
            /* ── SUCCESS STEP ── */
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-green-400">
                  <Check className="w-5 h-5" /> Chatbot Ready!
                </DialogTitle>
                <DialogDescription>Copy the code below and paste it into your website.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm space-y-1">
                  <p className="font-semibold text-green-400">Your chatbot is live</p>
                  <p className="text-xs text-muted-foreground">Paste one line of code into any website and the chat bubble appears instantly.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Step 1 — Copy this code</Label>
                  <div className="relative">
                    <pre className="bg-muted/60 rounded-xl p-4 text-xs font-mono overflow-x-auto border border-border/60 whitespace-pre-wrap break-all leading-relaxed pr-20">
{EMBED_SNIPPET(createdWidget.apiKey)}
                    </pre>
                    <Button
                      size="sm" variant="secondary"
                      className="absolute top-2 right-2 gap-1.5 text-xs"
                      onClick={() => copy(EMBED_SNIPPET(createdWidget.apiKey), "new-embed")}
                      data-testid="button-copy-new-embed"
                    >
                      {copied === "new-embed" ? <><Check className="w-3.5 h-3.5 text-green-500" />Copied!</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-2 text-xs">
                  <p className="font-semibold text-sm">Step 2 — Paste into the website HTML</p>
                  <p className="text-muted-foreground">Open the website's HTML file (or CMS editor) and paste the code just before the <code className="bg-muted px-1 rounded">&lt;/body&gt;</code> closing tag.</p>
                  <div className="bg-muted/60 rounded-lg p-3 font-mono text-xs border border-border/40 space-y-0.5">
                    <div className="text-muted-foreground">  &lt;p&gt;Your page content&lt;/p&gt;</div>
                    <div className="text-green-400 font-semibold">  &lt;script src="afroaigroup.com/widget.js" data-key="..."&gt;&lt;/script&gt;  ← paste here</div>
                    <div className="text-muted-foreground">&lt;/body&gt;</div>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1">
                  <p className="font-semibold text-amber-400">No developer? No problem.</p>
                  <p className="text-muted-foreground">If you use WordPress, Wix, Squarespace, or Webflow — go to the site settings, find "Custom Code" or "Footer Code", and paste there.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreatedWidget(null); setShowCreate(false); }}>
                  Done
                </Button>
                <Button onClick={() => { setCreatedWidget(null); setShowCreate(false); }} className="gap-2">
                  <Settings className="w-4 h-4" /> Open Settings
                </Button>
              </DialogFooter>
            </>
          ) : (
          /* ── CREATE FORM ── */
          <>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bot className="w-5 h-5 text-primary" /> Create New Chatbot</DialogTitle>
            <DialogDescription>Set up a chatbot and get an API key to embed on any website.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Organisation / Chatbot Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Uganda Revenue Authority" data-testid="input-chatbot-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Website URL</Label>
              <div className="flex gap-2">
                <Input value={form.websiteUrl} onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))} placeholder="https://example.gov.ug" data-testid="input-chatbot-url" className="flex-1" />
                <Button
                  type="button" variant="outline" size="sm"
                  disabled={!form.websiteUrl || scanning}
                  onClick={() => scanUrl(form.websiteUrl, (kb) => setForm(f => ({ ...f, knowledgeBase: kb + buildOmitInstructions(omitCategories) })))}
                  className="gap-1.5 whitespace-nowrap text-xs border-primary/50 text-primary hover:bg-primary/10"
                  data-testid="button-auto-scan"
                >
                  {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                  {scanning ? "Scanning…" : "Auto Scan"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Click Auto Scan to read your website and fill the knowledge base automatically.</p>
            </div>

            {/* Sensitive info omit list */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
              <button type="button" className="flex items-center justify-between w-full" onClick={() => setShowOmitList(v => !v)}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="text-red-400">🔒</span> Sensitive Information to Omit
                  {omitCategories.length > 0 && <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">{omitCategories.length} blocked</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">{showOmitList ? "Hide ▲" : "Show ▼"}</span>
              </button>
              {showOmitList && (
                <div className="space-y-2 pt-1 border-t border-border/40">
                  <p className="text-xs text-muted-foreground">Tick categories the AI should never reveal or discuss, even if asked directly.</p>
                  {SENSITIVE_CATEGORIES.map(cat => (
                    <label key={cat.id} className="flex items-start gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={omitCategories.includes(cat.id)}
                        onChange={() => toggleOmit(cat.id)}
                        className="mt-0.5 accent-red-500 w-4 h-4 flex-shrink-0"
                      />
                      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">{cat.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Widget Title</Label>
              <Input value={form.widgetTitle} onChange={e => setForm(f => ({ ...f, widgetTitle: e.target.value }))} placeholder="AI Assistant" />
            </div>
            <div className="space-y-1.5">
              <Label>Greeting Message</Label>
              <Input value={form.greeting} onChange={e => setForm(f => ({ ...f, greeting: e.target.value }))} placeholder="Hi! How can I help you today?" />
            </div>
            <div className="space-y-1.5">
              <Label>Brand Color</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="w-10 h-10 rounded cursor-pointer border border-border" />
                <Input value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="flex-1" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Knowledge Base</Label>
              <Textarea
                value={form.knowledgeBase}
                onChange={e => setForm(f => ({ ...f, knowledgeBase: e.target.value }))}
                placeholder={`Paste all information about this organisation here:\n- Services offered\n- Contact details\n- Opening hours\n- FAQs\n- Policies\n- Prices\n\nThe AI will ONLY answer questions based on this content.`}
                className="min-h-[150px] text-sm"
                data-testid="input-chatbot-knowledge"
              />
              <p className="text-xs text-muted-foreground">The AI will answer questions ONLY from this knowledge base. More detail = smarter answers.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(form)} disabled={!form.name.trim() || createMutation.isPending} data-testid="button-create-chatbot-submit">
              {createMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : <><Key className="w-4 h-4 mr-2" />Generate API Key</>}
            </Button>
          </DialogFooter>
          </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteConfirm?.name}"?</DialogTitle>
            <DialogDescription>This will permanently delete the chatbot and its API key. Any websites using this key will stop working.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WidgetDetail({ widget, onUpdate, onDelete, isUpdating, copy, copied, showKey, onToggleKey }: {
  widget: ChatbotWidget;
  onUpdate: (data: any) => void;
  onDelete: () => void;
  isUpdating: boolean;
  copy: (text: string, key: string) => void;
  copied: string | null;
  showKey: boolean;
  onToggleKey: () => void;
}) {
  const { toast } = useToast();
  const [edit, setEdit] = useState({ ...widget });
  const [kbScanning, setKbScanning] = useState(false);
  const [kbOmitCats, setKbOmitCats] = useState<string[]>([]);
  const [kbShowOmit, setKbShowOmit] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean; message: string } | null>(null);

  const toggleKbOmit = (id: string) =>
    setKbOmitCats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const scanForKb = async () => {
    const url = edit.websiteUrl;
    if (!url) return;
    setKbScanning(true);
    try {
      const r = await apiRequest("POST", "/api/chatbots/scan-url", { url });
      const data = await r.json();
      if (data.knowledgeBase) {
        setEdit(f => ({ ...f, knowledgeBase: data.knowledgeBase + buildOmitInstructions(kbOmitCats) }));
        toast({ title: "Website scanned", description: `${data.knowledgeBase.length.toLocaleString()} chars extracted. Review and save.` });
      } else {
        toast({ title: "Scan failed", description: data.error || "Could not read that URL.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Scan failed", description: "Could not reach that URL.", variant: "destructive" });
    } finally {
      setKbScanning(false);
    }
  };

  const verifyInstallation = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const r = await apiRequest("POST", `/api/chatbots/${widget.id}/verify`, {});
      const data = await r.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({ verified: false, message: "Could not run verification. Please try again." });
    } finally {
      setVerifying(false);
    }
  };

  const embedCode = EMBED_SNIPPET(widget.apiKey);
  const previewUrl = `https://afroaigroup.com/widget.js?key=${widget.apiKey}`;

  return (
    <Tabs defaultValue="embed" className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 pt-4 pb-0 border-b border-border/60">
        <div className="flex items-center gap-2 pb-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: widget.primaryColor + "25" }}>
            <Bot className="w-4 h-4" style={{ color: widget.primaryColor }} />
          </div>
          <span className="font-semibold text-sm">{widget.name}</span>
        </div>
        <TabsList className="mb-3 h-8">
          <TabsTrigger value="embed" className="text-xs gap-1.5"><Code2 className="w-3.5 h-3.5" />Embed</TabsTrigger>
          <TabsTrigger value="settings" className="text-xs gap-1.5"><Settings className="w-3.5 h-3.5" />Settings</TabsTrigger>
          <TabsTrigger value="knowledge" className="text-xs gap-1.5"><BookOpen className="w-3.5 h-3.5" />Knowledge</TabsTrigger>
        </TabsList>
      </div>

      {/* EMBED TAB */}
      <TabsContent value="embed" className="flex-1 overflow-auto p-6 space-y-6 mt-0">
        {/* API Key */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Key className="w-4 h-4 text-primary" />API Key</CardTitle>
            <CardDescription className="text-xs">Keep this secret. Share only with your developer or technical team.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={showKey ? widget.apiKey : "afroai_" + "•".repeat(40)}
                readOnly
                className="font-mono text-xs"
                data-testid="input-api-key"
              />
              <Button size="icon" variant="ghost" onClick={onToggleKey} data-testid="button-toggle-key">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => copy(widget.apiKey, "key")} data-testid="button-copy-key">
                {copied === "key" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Embed Code */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Code2 className="w-4 h-4 text-primary" />Embed Code</CardTitle>
            <CardDescription className="text-xs">Paste this single line before the closing &lt;/body&gt; tag on any website.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <pre className="bg-muted/50 rounded-xl p-4 text-xs font-mono overflow-x-auto border border-border/60 whitespace-pre-wrap break-all leading-relaxed">
                {embedCode}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2 gap-1.5 text-xs"
                onClick={() => copy(embedCode, "embed")}
                data-testid="button-copy-embed"
              >
                {copied === "embed" ? <><Check className="w-3.5 h-3.5 text-green-500" />Copied!</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-muted/30 rounded-xl p-3 space-y-1">
                <p className="font-semibold">Step 1</p>
                <p className="text-muted-foreground">Copy the code above</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 space-y-1">
                <p className="font-semibold">Step 2</p>
                <p className="text-muted-foreground">Paste before &lt;/body&gt; on the website</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 space-y-1">
                <p className="font-semibold">Step 3</p>
                <p className="text-muted-foreground">A chat bubble appears instantly</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 space-y-1">
                <p className="font-semibold">Step 4</p>
                <p className="text-muted-foreground">Customers get AI answers 24/7</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Verify Installation */}
        <Card className={verifyResult ? (verifyResult.verified ? "border-green-500/40" : "border-red-500/40") : ""}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-sm flex items-center gap-1.5">
                  <ScanLine className="w-4 h-4 text-primary" /> Verify Installation
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {widget.websiteUrl
                    ? `Check if the script is live on ${widget.websiteUrl}`
                    : "Add a website URL in Settings, then verify"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={verifying || !widget.websiteUrl}
                onClick={verifyInstallation}
                className="gap-1.5 flex-shrink-0 border-primary/40 text-primary hover:bg-primary/10"
                data-testid="button-verify-installation"
              >
                {verifying
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking…</>
                  : <><ScanLine className="w-3.5 h-3.5" />Verify Now</>}
              </Button>
            </div>
            {verifyResult && (
              <div className={`rounded-lg p-3 text-sm flex items-start gap-2.5 ${
                verifyResult.verified
                  ? "bg-green-500/10 border border-green-500/30 text-green-400"
                  : "bg-red-500/10 border border-red-500/30 text-red-400"
              }`}>
                {verifyResult.verified
                  ? <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  : <Loader2 className="w-4 h-4 flex-shrink-0 mt-0.5 hidden" />}
                {!verifyResult.verified && <span className="text-red-400 font-bold flex-shrink-0">✕</span>}
                <span className="text-xs leading-relaxed">{verifyResult.message}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status toggle */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Widget Status</p>
              <p className="text-xs text-muted-foreground">{widget.isActive ? "Active — responding to visitors" : "Inactive — widget is hidden"}</p>
            </div>
            <Switch
              checked={widget.isActive}
              onCheckedChange={(v) => onUpdate({ isActive: v })}
              data-testid="switch-widget-active"
            />
          </CardContent>
        </Card>

        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            <strong>{widget.conversationCount}</strong> total conversations
          </p>
          <Button variant="destructive" size="sm" onClick={onDelete} className="gap-1.5 text-xs">
            <Trash2 className="w-3.5 h-3.5" /> Delete Chatbot
          </Button>
        </div>
      </TabsContent>

      {/* SETTINGS TAB */}
      <TabsContent value="settings" className="flex-1 overflow-auto p-6 space-y-5 mt-0">
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input value={edit.name} onChange={e => setEdit(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Website URL</Label>
          <Input value={edit.websiteUrl || ""} onChange={e => setEdit(f => ({ ...f, websiteUrl: e.target.value }))} placeholder="https://example.gov.ug" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Widget Title</Label>
          <Input value={edit.widgetTitle} onChange={e => setEdit(f => ({ ...f, widgetTitle: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Greeting Message</Label>
          <Input value={edit.greeting} onChange={e => setEdit(f => ({ ...f, greeting: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Input Placeholder</Label>
          <Input value={edit.placeholder} onChange={e => setEdit(f => ({ ...f, placeholder: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" />Brand Color</Label>
          <div className="flex gap-2 items-center">
            <input type="color" value={edit.primaryColor} onChange={e => setEdit(f => ({ ...f, primaryColor: e.target.value }))} className="w-10 h-10 rounded cursor-pointer border border-border" />
            <Input value={edit.primaryColor} onChange={e => setEdit(f => ({ ...f, primaryColor: e.target.value }))} className="flex-1" />
            <div className="w-10 h-10 rounded-lg border border-border" style={{ backgroundColor: edit.primaryColor }} />
          </div>
        </div>
        {/* Branding */}
        <div className="rounded-xl border border-border/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">"Powered by Afro AI" badge</p>
              <p className="text-xs text-muted-foreground">Show a small badge at the bottom of the chat window</p>
            </div>
            <Switch
              checked={edit.showBranding !== false}
              onCheckedChange={(v) => setEdit(f => ({ ...f, showBranding: v }))}
              data-testid="switch-show-branding"
            />
          </div>
          {edit.showBranding === false && (
            <div className="space-y-1.5">
              <Label className="text-xs">White-label name (shown instead)</Label>
              <Input
                value={(edit as any).whiteLabelName || ""}
                onChange={e => setEdit(f => ({ ...f, whiteLabelName: e.target.value } as any))}
                placeholder="e.g. URA Smart Assistant"
              />
              <p className="text-xs text-muted-foreground">Leave blank to show no branding at all.</p>
            </div>
          )}
          {edit.showBranding !== false && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border/40 pt-2">
              <span>Preview:</span>
              <a className="text-[#666] no-underline">Powered by <strong className="text-[#D4A017]">Afro AI</strong></a>
              <span className="ml-auto text-green-500 font-medium">Free marketing for you ✓</span>
            </div>
          )}
        </div>

        <Button onClick={() => onUpdate({ name: edit.name, websiteUrl: edit.websiteUrl, widgetTitle: edit.widgetTitle, greeting: edit.greeting, placeholder: edit.placeholder, primaryColor: edit.primaryColor, showBranding: edit.showBranding !== false, whiteLabelName: (edit as any).whiteLabelName || null })} disabled={isUpdating} className="w-full">
          {isUpdating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Settings"}
        </Button>
      </TabsContent>

      {/* KNOWLEDGE TAB */}
      <TabsContent value="knowledge" className="flex-1 overflow-auto p-6 space-y-4 mt-0">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm space-y-1">
          <p className="font-semibold text-amber-400">How the Knowledge Base works</p>
          <p className="text-xs text-muted-foreground">The AI reads ONLY what you write here. Add every service, FAQ, policy, price, and contact detail. The more detail, the smarter it answers.</p>
        </div>

        {/* Auto Scan */}
        {edit.websiteUrl && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5"><ScanLine className="w-4 h-4 text-primary" /> Auto Scan Website</p>
                <p className="text-xs text-muted-foreground mt-0.5">Scan <span className="font-mono text-primary/80 break-all">{edit.websiteUrl}</span> and auto-fill the knowledge base with extracted content.</p>
              </div>
              <Button
                size="sm" variant="outline"
                disabled={kbScanning}
                onClick={scanForKb}
                className="gap-1.5 flex-shrink-0 border-primary/40 text-primary hover:bg-primary/10"
                data-testid="button-kb-auto-scan"
              >
                {kbScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {kbScanning ? "Scanning…" : "Scan Now"}
              </Button>
            </div>
          </div>
        )}

        {/* Sensitive info omit list */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
          <button type="button" className="flex items-center justify-between w-full" onClick={() => setKbShowOmit(v => !v)}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-red-400">🔒</span> Sensitive Information to Block
              {kbOmitCats.length > 0 && <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">{kbOmitCats.length} blocked</Badge>}
            </div>
            <span className="text-xs text-muted-foreground">{kbShowOmit ? "Hide ▲" : "Configure ▼"}</span>
          </button>
          {kbShowOmit && (
            <div className="space-y-2.5 pt-2 border-t border-border/40">
              <p className="text-xs text-muted-foreground">Select categories the AI should <strong>never</strong> reveal or discuss — even if asked directly. After selecting, click <strong>Scan Now</strong> or add the instruction block manually.</p>
              {SENSITIVE_CATEGORIES.map(cat => (
                <label key={cat.id} className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={kbOmitCats.includes(cat.id)}
                    onChange={() => toggleKbOmit(cat.id)}
                    className="mt-0.5 accent-red-500 w-4 h-4 flex-shrink-0"
                  />
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">{cat.label}</span>
                </label>
              ))}
              {kbOmitCats.length > 0 && (
                <Button
                  size="sm" variant="outline"
                  className="w-full mt-1 border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                  onClick={() => setEdit(f => ({ ...f, knowledgeBase: (f.knowledgeBase || "").replace(/\n\n## SENSITIVE — DO NOT DISCUSS[\s\S]*$/, "") + buildOmitInstructions(kbOmitCats) }))}
                >
                  Apply Block List to Knowledge Base
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Organisation Knowledge Base</Label>
          <Textarea
            value={edit.knowledgeBase || ""}
            onChange={e => setEdit(f => ({ ...f, knowledgeBase: e.target.value }))}
            placeholder={`Examples of what to include:\n\n## Services\n- Tax registration (TIN number): Monday–Friday 8am–5pm\n- VAT refund: Apply online at ura.go.ug\n\n## Contact\n- Phone: 0417444444\n- Email: support@ura.go.ug\n- Location: Nakawa, Kampala\n\n## FAQs\nQ: How long does TIN take?\nA: 2–5 working days\n\nQ: Can I pay tax online?\nA: Yes, at efris.ura.go.ug`}
            className="min-h-[280px] font-mono text-xs"
            data-testid="textarea-knowledge-base"
          />
          <p className="text-xs text-muted-foreground">{(edit.knowledgeBase || "").length.toLocaleString()} characters</p>
        </div>
        <Button onClick={() => onUpdate({ knowledgeBase: edit.knowledgeBase })} disabled={isUpdating} className="w-full">
          {isUpdating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : <><BookOpen className="w-4 h-4 mr-2" />Save Knowledge Base</>}
        </Button>
      </TabsContent>
    </Tabs>
  );
}
