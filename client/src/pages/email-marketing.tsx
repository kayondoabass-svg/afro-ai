import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { EmailSubscriber, EmailCampaign } from "@shared/schema";
import {
  Mail, Users, Plus, Trash2, Send, Copy, Download, Pencil,
  UserCheck, UserX, Upload, BarChart2, Wand2, CheckCircle2, Clock
} from "lucide-react";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export default function EmailMarketingPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);

  // Subscribers state
  const [subEmail, setSubEmail] = useState("");
  const [subName, setSubName] = useState("");
  const [subSearch, setSubSearch] = useState("");

  // Campaign state
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [editCampaign, setEditCampaign] = useState<EmailCampaign | null>(null);
  const [previewCampaign, setPreviewCampaign] = useState<EmailCampaign | null>(null);
  const [camForm, setCamForm] = useState({ name: "", subject: "", htmlContent: "" });

  const { data: subscribers = [], isLoading: loadingSubs } = useQuery<EmailSubscriber[]>({ queryKey: ["/api/email/subscribers"] });
  const { data: campaigns = [], isLoading: loadingCams } = useQuery<EmailCampaign[]>({ queryKey: ["/api/email/campaigns"] });

  const addSubMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/subscribers", { email: subEmail, name: subName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/subscribers"] });
      setSubEmail(""); setSubName("");
      toast({ title: "Subscriber added!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSubMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/email/subscribers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/subscribers"] });
      toast({ title: "Subscriber removed" });
    },
  });

  const toggleSubMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/email/subscribers/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/email/subscribers"] }),
  });

  const saveCamMutation = useMutation({
    mutationFn: () => editCampaign
      ? apiRequest("PUT", `/api/email/campaigns/${editCampaign.id}`, camForm)
      : apiRequest("POST", "/api/email/campaigns", camForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/campaigns"] });
      setCampaignDialog(false);
      setEditCampaign(null);
      setCamForm({ name: "", subject: "", htmlContent: "" });
      toast({ title: editCampaign ? "Campaign updated!" : "Campaign created!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCamMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/email/campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/campaigns"] });
      toast({ title: "Campaign deleted" });
    },
  });

  const openCreateCam = () => {
    setEditCampaign(null);
    setCamForm({ name: "", subject: "", htmlContent: "" });
    setCampaignDialog(true);
  };

  const openEditCam = (cam: EmailCampaign) => {
    setEditCampaign(cam);
    setCamForm({ name: cam.name, subject: cam.subject, htmlContent: cam.htmlContent });
    setCampaignDialog(true);
  };

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const rows = text.split("\n").slice(1).filter(r => r.trim());
      let added = 0;
      for (const row of rows) {
        const [email, name] = row.split(",").map(s => s.trim().replace(/"/g, ""));
        if (email && email.includes("@")) {
          try {
            await apiRequest("POST", "/api/email/subscribers", { email, name: name || null });
            added++;
          } catch {}
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/email/subscribers"] });
      toast({ title: `Imported ${added} subscriber${added !== 1 ? "s" : ""}` });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const exportCSV = () => {
    const rows = [["Email", "Name", "Status", "Subscribed At"]];
    subscribers.forEach(s => rows.push([s.email, s.name || "", s.status, formatDate(s.subscribedAt)]));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "subscribers.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const copyHTML = (html: string) => {
    navigator.clipboard.writeText(html);
    toast({ title: "HTML copied!", description: "Paste into Mailchimp, Brevo, Gmail, or any email sender." });
  };

  const downloadHTML = (cam: EmailCampaign) => {
    const blob = new Blob([cam.htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${cam.name}.html`; a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSubs = subscribers.filter(s =>
    s.email.toLowerCase().includes(subSearch.toLowerCase()) || (s.name || "").toLowerCase().includes(subSearch.toLowerCase())
  );
  const activeSubs = subscribers.filter(s => s.status === "active").length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b p-4 md:p-6 bg-background">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Email Marketing</h1>
        </div>
        <p className="text-sm text-muted-foreground">Manage subscribers and create email campaigns.</p>

        {/* Stats */}
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-primary" />
            <span className="font-semibold">{subscribers.length}</span>
            <span className="text-muted-foreground">Subscribers</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <UserCheck className="w-4 h-4 text-green-500" />
            <span className="font-semibold">{activeSubs}</span>
            <span className="text-muted-foreground">Active</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Send className="w-4 h-4 text-blue-400" />
            <span className="font-semibold">{campaigns.length}</span>
            <span className="text-muted-foreground">Campaigns</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <Tabs defaultValue="subscribers" className="h-full flex flex-col">
          <TabsList className="mx-4 md:mx-6 mt-3 w-fit">
            <TabsTrigger value="subscribers" className="gap-2" data-testid="tab-subscribers">
              <Users className="w-3.5 h-3.5" />Subscribers
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="gap-2" data-testid="tab-campaigns">
              <Send className="w-3.5 h-3.5" />Campaigns
            </TabsTrigger>
          </TabsList>

          {/* ===== SUBSCRIBERS TAB ===== */}
          <TabsContent value="subscribers" className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 mt-3">
            {/* Add subscriber + actions */}
            <Card className="mb-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Add Subscriber</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Input placeholder="Email address *" value={subEmail} onChange={e => setSubEmail(e.target.value)} className="flex-1 min-w-[200px]" data-testid="input-subscriber-email" />
                  <Input placeholder="Name (optional)" value={subName} onChange={e => setSubName(e.target.value)} className="flex-1 min-w-[160px]" data-testid="input-subscriber-name" />
                  <Button onClick={() => addSubMutation.mutate()} disabled={!subEmail || addSubMutation.isPending} className="gap-2" data-testid="button-add-subscriber">
                    <Plus className="w-4 h-4" />Add
                  </Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => fileRef.current?.click()} data-testid="button-import-csv">
                    <Upload className="w-3.5 h-3.5" />Import CSV
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV} disabled={subscribers.length === 0} data-testid="button-export-csv">
                    <Download className="w-3.5 h-3.5" />Export CSV
                  </Button>
                  <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={importCSV} />
                  <p className="text-xs text-muted-foreground self-center">CSV format: email, name (header row required)</p>
                </div>
              </CardContent>
            </Card>

            {/* Search */}
            <Input placeholder="Search subscribers..." value={subSearch} onChange={e => setSubSearch(e.target.value)} className="mb-3 max-w-sm" data-testid="input-search-subscribers" />

            {/* Subscriber list */}
            {loadingSubs ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
            ) : filteredSubs.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">{subSearch ? "No subscribers match your search." : "No subscribers yet. Add one above or import a CSV."}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSubs.map(sub => (
                  <div key={sub.id} data-testid={`row-subscriber-${sub.id}`} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${sub.status === "active" ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"}`}>
                      {(sub.name || sub.email)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{sub.name || sub.email}</p>
                      {sub.name && <p className="text-xs text-muted-foreground truncate">{sub.email}</p>}
                    </div>
                    <Badge variant={sub.status === "active" ? "default" : "secondary"} className="text-xs capitalize hidden sm:inline-flex">{sub.status}</Badge>
                    <p className="text-xs text-muted-foreground hidden md:block">{formatDate(sub.subscribedAt)}</p>
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0"
                      onClick={() => toggleSubMutation.mutate({ id: sub.id, status: sub.status === "active" ? "unsubscribed" : "active" })}
                      title={sub.status === "active" ? "Unsubscribe" : "Reactivate"}
                      data-testid={`button-toggle-sub-${sub.id}`}
                    >
                      {sub.status === "active" ? <UserX className="w-3.5 h-3.5 text-muted-foreground" /> : <UserCheck className="w-3.5 h-3.5 text-green-500" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => deleteSubMutation.mutate(sub.id)} data-testid={`button-delete-sub-${sub.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ===== CAMPAIGNS TAB ===== */}
          <TabsContent value="campaigns" className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 mt-3">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Create HTML email campaigns. Export and send via Mailchimp, Brevo, Gmail, or any email service.</p>
              </div>
              <Button onClick={openCreateCam} className="gap-2 ml-4 flex-shrink-0" data-testid="button-create-campaign">
                <Plus className="w-4 h-4" />New Campaign
              </Button>
            </div>

            {/* Send method notice */}
            <Card className="mb-4 border-primary/20 bg-primary/5">
              <CardContent className="p-4 flex items-start gap-3">
                <Send className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">How to send campaigns</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Build your email HTML here with AI assistance, then export and send via: <strong>Brevo</strong> (free 300/day), <strong>Mailchimp</strong>, <strong>Gmail HTML send</strong>, or your own SMTP server.</p>
                </div>
              </CardContent>
            </Card>

            {loadingCams ? (
              <div className="grid gap-4 sm:grid-cols-2">{[1, 2].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12">
                <Send className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No campaigns yet. Create your first email campaign.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {campaigns.map(cam => (
                  <Card key={cam.id} data-testid={`card-campaign-${cam.id}`} className="hover:border-primary/40 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0 mr-2">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={cam.status === "sent" ? "default" : "secondary"} className="text-xs gap-1">
                              {cam.status === "sent" ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                              {cam.status}
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-sm truncate">{cam.name}</h3>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">Subject: {cam.subject}</p>
                        </div>
                        <BarChart2 className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
                        {formatDate(cam.createdAt)}
                        {cam.htmlContent && <span className="ml-2 text-green-500/80">• Has content</span>}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => openEditCam(cam)} data-testid={`button-edit-campaign-${cam.id}`}>
                          <Pencil className="w-3 h-3" />Edit
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setPreviewCampaign(cam)} data-testid={`button-preview-campaign-${cam.id}`}>
                          <Send className="w-3 h-3" />Preview
                        </Button>
                        {cam.htmlContent && (
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => copyHTML(cam.htmlContent)} data-testid={`button-copy-campaign-${cam.id}`}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        )}
                        {cam.htmlContent && (
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => downloadHTML(cam)} data-testid={`button-download-campaign-${cam.id}`}>
                            <Download className="w-3 h-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => deleteCamMutation.mutate(cam.id)} data-testid={`button-delete-campaign-${cam.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create/Edit Campaign Dialog */}
      <Dialog open={campaignDialog} onOpenChange={setCampaignDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editCampaign ? "Edit Campaign" : "New Email Campaign"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Campaign Name *</Label>
              <Input placeholder="e.g. August Newsletter" value={camForm.name} onChange={e => setCamForm(f => ({ ...f, name: e.target.value }))} data-testid="input-campaign-name" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Email Subject *</Label>
              <Input placeholder="e.g. Big news from our team 🎉" value={camForm.subject} onChange={e => setCamForm(f => ({ ...f, subject: e.target.value }))} data-testid="input-campaign-subject" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-sm font-medium">Email HTML Content</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-primary hover:text-primary" onClick={() => { setCampaignDialog(false); sessionStorage.setItem("email_campaign_context", "true"); setLocation("/chat"); }} data-testid="button-generate-email-ai">
                  <Wand2 className="w-3 h-3" />Generate with AI
                </Button>
              </div>
              <Textarea
                placeholder="Paste your email HTML here, or use 'Generate with AI' to create it in the chat..."
                value={camForm.htmlContent}
                onChange={e => setCamForm(f => ({ ...f, htmlContent: e.target.value }))}
                className="min-h-[240px] font-mono text-xs resize-y"
                data-testid="textarea-campaign-html"
              />
              <p className="text-xs text-muted-foreground mt-1">Tip: Ask the AI to write a professional email for your campaign, then paste the HTML here.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setCampaignDialog(false)} className="flex-1" data-testid="button-cancel-campaign">Cancel</Button>
              <Button onClick={() => saveCamMutation.mutate()} disabled={!camForm.name || !camForm.subject || saveCamMutation.isPending} className="flex-1" data-testid="button-save-campaign">
                {saveCamMutation.isPending ? "Saving..." : editCampaign ? "Update" : "Create Campaign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewCampaign !== null} onOpenChange={() => setPreviewCampaign(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              {previewCampaign?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mb-3">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => previewCampaign && copyHTML(previewCampaign.htmlContent)} data-testid="button-preview-copy">
              <Copy className="w-3.5 h-3.5" />Copy HTML
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => previewCampaign && downloadHTML(previewCampaign)} data-testid="button-preview-download">
              <Download className="w-3.5 h-3.5" />Download
            </Button>
          </div>
          <div className="flex-1 rounded-lg border overflow-hidden bg-white min-h-[400px]">
            {previewCampaign?.htmlContent ? (
              <iframe srcDoc={previewCampaign.htmlContent} className="w-full h-full min-h-[400px]" sandbox="allow-same-origin" title="Email preview" />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">No HTML content yet. Edit the campaign to add content.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
