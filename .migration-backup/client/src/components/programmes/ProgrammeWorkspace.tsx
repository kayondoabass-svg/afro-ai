import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ApplicationDetails from "./ApplicationDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowDownToLine, ArrowRight, Building2, Check, CircleAlert, Copy,
  ExternalLink, Mail, MousePointerClick, Plus, RefreshCw,
  Users, Wallet,
} from "lucide-react";
import type { Invitation, Member, PayoutMethod, Programme, ProgrammeDetail, Resource, Workspace } from "./programme-types";
import { displayField, money, safeTitle } from "./programme-types";

type MeResponse = { workspaces: Workspace[]; checkedAt: string };

function listValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "The request could not be completed.";
  const match = message.match(/^\d+:\s*(\{[\s\S]*\})$/);
  if (match) {
    try { return JSON.parse(match[1]).message || message; } catch { return message; }
  }
  return message;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isExternalResource(url: string) {
  if (!/^https?:\/\//i.test(url)) return false;
  try { return new URL(url).origin !== window.location.origin; } catch { return false; }
}

export default function ProgrammeWorkspace({ programmeFilter }: { programmeFilter?: Programme }) {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>("bank");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [registrationCountry, setRegistrationCountry] = useState("");
  const [response, setResponse] = useState("");
  const [lead, setLead] = useState({ name: "", email: "", phone: "", company: "", message: "" });
  const [newLeadAssignedUserId, setNewLeadAssignedUserId] = useState("");
  const [invite, setInvite] = useState({ email: "", role: "sales" });
  const [inviteToken, setInviteToken] = useState("");
  const [copied, setCopied] = useState(false);

  const me = useQuery<MeResponse>({ queryKey: ["/api/programmes/me"] });
  const visible = useMemo(
    () => (me.data?.workspaces || []).filter((workspace) => !programmeFilter || workspace.programme === programmeFilter),
    [me.data?.workspaces, programmeFilter],
  );
  const active = visible.find((workspace) => workspace.applicationId === selectedId) || visible[0];
  const detail = useQuery<ProgrammeDetail>({
    queryKey: ["/api/programmes", active?.programme, active?.applicationId],
    enabled: !!active,
  });
  const base = active ? `/api/programmes/${active.programme}/${active.applicationId}` : "";
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/programmes/me"] });
    if (active) queryClient.invalidateQueries({ queryKey: ["/api/programmes", active.programme, active.applicationId] });
  };

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (token) setInviteToken(token);
  }, [location]);
  useEffect(() => {
    if (!active) return;
    setPayoutMethod(active.payoutMethod || "bank");
    setRegistrationNumber(active.registrationNumber || "");
    setRegistrationCountry(active.registrationCountry || "");
    setResponse("");
  }, [active?.programme, active?.applicationId]);

  const acceptInvite = useMutation({
    mutationFn: () => apiRequest("POST", "/api/programmes/invitations/accept", { token: inviteToken }),
    onSuccess: () => {
      toast({ title: "Invitation accepted", description: "Your workspace access is ready." });
      setInviteToken("");
      navigate("/programme-portal");
      queryClient.invalidateQueries({ queryKey: ["/api/programmes/me"] });
    },
    onError: (error) => toast({ title: "Could not accept invitation", description: safeError(error), variant: "destructive" }),
  });
  const saveProfile = useMutation({
    mutationFn: () => apiRequest("PATCH", `${base}/profile`, {
      payoutMethod,
      ...(active?.programme === "business" && active.role === "owner" && !(
        active.registrationStatus === "verified" && ["approved", "active"].includes(active.status)
      ) ? { registrationNumber: registrationNumber.trim(), registrationCountry: registrationCountry.trim() } : {}),
      ...(response.trim() ? { response: response.trim() } : {}),
    }),
    onSuccess: () => {
      const sentResponse = Boolean(response.trim() && active?.status === "information_required");
      if (sentResponse) setResponse("");
      toast(sentResponse
        ? { title: "Response submitted", description: "Your application has returned to pending review." }
        : { title: "Workspace details saved" });
      invalidate();
    },
    onError: (error) => toast({ title: "Could not save details", description: safeError(error), variant: "destructive" }),
  });
  const createLead = useMutation({
    mutationFn: () => apiRequest("POST", `${base}/leads`, {
      name: lead.name.trim(), email: lead.email.trim(),
      ...(lead.phone.trim() ? { phone: lead.phone.trim() } : {}),
      ...(lead.company.trim() ? { company: lead.company.trim() } : {}),
      ...(lead.message.trim() ? { message: lead.message.trim() } : {}),
      ...(newLeadAssignedUserId && active && ["owner", "admin"].includes(active.role) ? { assignedUserId: newLeadAssignedUserId } : {}),
    }),
    onSuccess: () => { setLead({ name: "", email: "", phone: "", company: "", message: "" }); setNewLeadAssignedUserId(""); toast({ title: "Lead added" }); invalidate(); },
    onError: (error) => toast({ title: "Could not add lead", description: safeError(error), variant: "destructive" }),
  });
  const updateLead = useMutation({
    mutationFn: ({ id, status, notes, assignedUserId }: { id: number | string; status: string; notes?: string; assignedUserId?: string }) =>
      apiRequest("PATCH", `${base}/leads/${id}`, {
        status,
        ...(notes === undefined ? {} : { notes }),
        ...(assignedUserId === undefined ? {} : { assignedUserId }),
      }),
    onSuccess: () => { toast({ title: "Lead updated" }); invalidate(); },
    onError: (error) => toast({ title: "Could not update lead", description: safeError(error), variant: "destructive" }),
  });
  const sendInvite = useMutation({
    mutationFn: () => apiRequest("POST", `/api/programmes/business/${active?.applicationId}/invitations`, { email: invite.email.trim(), role: invite.role }),
    onSuccess: () => { setInvite({ email: "", role: "sales" }); toast({ title: "Invitation sent" }); invalidate(); },
    onError: (error) => toast({ title: "Could not invite teammate", description: safeError(error), variant: "destructive" }),
  });
  const revokeInvite = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/programmes/business/${active?.applicationId}/invitations/${id}`),
    onSuccess: () => { toast({ title: "Invitation revoked" }); invalidate(); },
    onError: (error) => toast({ title: "Could not revoke invitation", description: safeError(error), variant: "destructive" }),
  });
  const updateMember = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { role?: string; status?: "active" | "removed" } }) =>
      apiRequest("PATCH", `/api/programmes/business/${active?.applicationId}/members/${id}`, payload),
    onSuccess: () => { toast({ title: "Team access updated" }); invalidate(); },
    onError: (error) => toast({ title: "Could not update access", description: safeError(error), variant: "destructive" }),
  });

  const exportCsv = async (kind: "commissions" | "payouts") => {
    try {
      const res = await apiRequest("GET", `${base}/export?kind=${kind}`);
      downloadBlob(await res.blob(), `${active?.programme}-${kind}.csv`);
    } catch (error) {
      toast({ title: "Export unavailable", description: safeError(error), variant: "destructive" });
    }
  };

  if (inviteToken) {
    return (
      <main className="min-h-[70dvh] flex items-center justify-center p-4">
        <Card className="w-full max-w-lg border-primary/20">
          <CardHeader><div className="w-12 h-12 rounded-xl bg-primary/10 text-primary grid place-items-center"><Mail className="w-5 h-5" /></div><CardTitle>Join a programme workspace</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">This invitation is tied to your signed-in Afro AI account. Accept it to open the invited team workspace.</p>
            <Button className="w-full" onClick={() => acceptInvite.mutate()} disabled={acceptInvite.isPending || !inviteToken}>
              {acceptInvite.isPending ? "Accepting invitation…" : "Accept invitation"} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-xs text-muted-foreground">If you were not expecting this invitation, you can leave this page without accepting.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (me.isLoading) {
    return <main className="max-w-6xl mx-auto w-full p-4 sm:p-8 space-y-4"><Skeleton className="h-32 w-full" /><div className="grid sm:grid-cols-3 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-64" /></main>;
  }
  if (me.isError) {
    const isVerification = safeError(me.error).includes("403");
    return <main className="max-w-3xl mx-auto w-full p-4 sm:p-8"><Card><CardContent className="p-8 text-center space-y-4">
      <CircleAlert className="h-10 w-10 text-primary mx-auto" />
      <h1 className="text-xl font-semibold">{isVerification ? "Verify your email to continue" : "Workspace could not be loaded"}</h1>
      <p className="text-sm text-muted-foreground">{isVerification ? "Your email must be verified before programme access can be checked. Verify it, then retry here." : safeError(me.error)}</p>
      <Button variant="outline" onClick={() => me.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
    </CardContent></Card></main>;
  }
  if (!visible.length) {
    return <main className="max-w-4xl mx-auto w-full p-4 sm:p-8">
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.045] p-7 sm:p-10">
        <p className="text-xs tracking-[0.2em] uppercase text-primary font-semibold">Afro AI programmes</p>
        <h1 className="mt-3 max-w-xl text-3xl sm:text-4xl font-semibold tracking-tight">Your partner work starts here.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">Submitted applications remain under review until the Afro AI team approves them. Referral links only become available after approval.</p>
        <div className="mt-7 flex flex-wrap gap-3"><Button asChild><Link href="/affiliate">Affiliate programme</Link></Button><Button asChild variant="outline"><Link href="/become-partner">Business partner programme</Link></Button></div>
      </div>
    </main>;
  }

  const workspace = detail.data?.workspace || active;
  const isBusiness = workspace.programme === "business";
  const canManageTeam = isBusiness && (workspace.role === "owner" || workspace.role === "admin");
  const owner = workspace.role === "owner";
  const canEditBusinessIdentity = isBusiness && owner && !(workspace.registrationStatus === "verified" && ["approved", "active"].includes(workspace.status));
  const canManageLeads = isBusiness && ["owner", "admin", "sales"].includes(workspace.role);
  const canExport = ["owner", "finance"].includes(workspace.role);
  const detailData = detail.data;
  const customers = listValue(detailData?.customers);
  const commissions = listValue(detailData?.commissions);
  const leads = listValue(detailData?.leads);
  const payouts = listValue(detailData?.payouts);
  const activeMembers = (detailData?.members || []).filter((member) => member.status === "active");
  const canAssignLeads = isBusiness && ["owner", "admin"].includes(workspace.role);

  const copyReferral = async () => {
    if (!workspace.referralLink) return;
    try {
      await navigator.clipboard.writeText(workspace.referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      toast({ title: "Referral link copied" });
    } catch { toast({ title: "Could not copy link", variant: "destructive" }); }
  };
  const renderRows = (rows: Record<string, unknown>[], empty: string) => rows.length ? (
    <div className="divide-y divide-border/70">{rows.map((row, index) => {
      const identifier = String(row.id ?? index);
      const entries = Object.entries(row).filter(([key, value]) => !["id", "user_id", "application_id"].includes(key) && (typeof value !== "object" || value === null)).slice(0, 6);
      return <article key={identifier} className="py-3 grid gap-1 sm:grid-cols-2" data-testid={`programme-row-${identifier}`}>
        <p className="text-xs font-mono text-muted-foreground">{row.id == null ? `Record ${index + 1}` : `#${identifier}`}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 sm:justify-end">{entries.map(([key, value]) => <span key={key} className="text-xs"><span className="text-muted-foreground">{safeTitle(key)}: </span>{displayField(row, key)}</span>)}</div>
      </article>;
    })}</div>
  ) : <p className="text-sm text-muted-foreground py-8 text-center">{empty}</p>;
  const resourceDownload = async (resource: Resource) => {
    if (isExternalResource(resource.url)) {
      window.open(resource.url, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const res = await apiRequest("GET", resource.url);
      const blob = await res.blob();
      downloadBlob(blob, `${resource.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`);
    } catch (error) { toast({ title: "Resource unavailable", description: safeError(error), variant: "destructive" }); }
  };

  return (
    <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-9 space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-primary/10 to-transparent pointer-events-none" />
        <div className="relative p-5 sm:p-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary" /><span className="text-xs uppercase tracking-[0.18em] text-primary font-semibold">{isBusiness ? "Business partner" : "Affiliate"} workspace</span></div>
            <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight">{workspace.displayName}</h1>
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{workspace.status}</Badge><Badge variant="secondary">{workspace.role}</Badge>{workspace.tier && <Badge variant="outline">{safeTitle(workspace.tier)} · {workspace.commissionPercent}%</Badge>}{isBusiness && <Badge variant={workspace.registrationStatus === "verified" ? "default" : "outline"}>{workspace.registrationStatus === "verified" ? "Registration verified" : "Registration not verified"}</Badge>}</div>
          </div>
          {visible.length > 1 && <label className="text-xs text-muted-foreground">Workspace<select className="mt-1 block w-full min-w-52 rounded-md border bg-background px-3 py-2 text-sm text-foreground" value={workspace.applicationId} onChange={(event) => setSelectedId(Number(event.target.value))}>{visible.map((item) => <option key={item.applicationId} value={item.applicationId}>{item.displayName} · {item.programme}</option>)}</select></label>}
        </div>
      </header>

      {workspace.reviewNotes && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Review note</p><p className="mt-1 text-sm">{workspace.reviewNotes}</p></div>}
      {!workspace.referralLink && workspace.status !== "approved" && workspace.status !== "active" && <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm"><strong>Application under review.</strong> Your referral link will appear here after approval.</div>}
      {workspace.referralLink && <Card className="border-primary/25 bg-primary/[0.035]"><CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row gap-3 sm:items-center"><div className="min-w-0 flex-1"><p className="text-xs uppercase tracking-wider text-muted-foreground">Approved referral link</p><p className="mt-1 break-all font-mono text-sm text-primary">{workspace.referralLink}</p></div><Button variant="outline" onClick={copyReferral}>{copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}{copied ? "Copied" : "Copy link"}</Button></CardContent></Card>}

      {detail.isError && <div className="flex items-center justify-between rounded-lg border border-destructive/30 p-4 text-sm"><span>Workspace data did not load. No missing values have been estimated.</span><Button size="sm" variant="outline" onClick={() => detail.refetch()}>Retry</Button></div>}
      {detailData?.truncated && <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><strong>Showing a limited history.</strong> This workspace response is truncated to 500 rows. Commission and payout CSV exports are available to owners and finance members; do not treat these tables as complete history.</div>}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric icon={<MousePointerClick />} label="Link clicks" value={workspace.stats.clicks} />
        <Metric icon={<Users />} label="Sign-ups" value={workspace.stats.signups} />
        <Metric icon={<Building2 />} label="Paying customers" value={workspace.stats.payingCustomers} />
        <Metric icon={<Wallet />} label="Earned by currency" value={workspace.stats.finance.map((item) => money(item.earnedCents, item.currency)).join(" · ") || "No ledger yet"} />
      </section>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="commissions">Commissions</TabsTrigger><TabsTrigger value="customers">Customers</TabsTrigger>
          {isBusiness && <TabsTrigger value="leads">Leads</TabsTrigger>}{isBusiness && <TabsTrigger value="team">Team</TabsTrigger>}
          <TabsTrigger value="payouts">Payouts</TabsTrigger><TabsTrigger value="resources">Resources</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Earnings by currency</CardTitle></CardHeader><CardContent>
            {workspace.stats.finance.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{workspace.stats.finance.map((item) => <div key={item.currency} className="rounded-lg border p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">{item.currency}</p><p className="mt-2 text-lg font-semibold">{money(item.earnedCents, item.currency)} earned</p><dl className="mt-3 grid grid-cols-2 gap-y-2 text-xs"><span className="text-muted-foreground">Pending</span><span>{money(item.pendingCents, item.currency)}</span><span className="text-muted-foreground">Approved</span><span>{money(item.approvedCents, item.currency)}</span><span className="text-muted-foreground">Paid</span><span>{money(item.paidCents, item.currency)}</span><span className="text-muted-foreground">Reversed</span><span>{money(item.reversedCents, item.currency)}</span></dl></div>)}</div> : <p className="text-sm text-muted-foreground">No earnings data has been recorded yet.</p>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Payout preference and business profile</CardTitle></CardHeader><CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Afro AI reviews payouts and pays manually. Payment details are confirmed privately before payment. Never enter account numbers, bank passwords, PINs or one-time codes here.</p>
            <label className="block max-w-md text-sm">Preferred payout method<select value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value as PayoutMethod)} className="mt-1 block w-full rounded-md border bg-background px-3 py-2"><option value="bank">Bank</option><option value="mobile_money">Mobile money</option></select></label>
            {isBusiness && owner && <div className="grid sm:grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-4">
              <label className="text-sm">Business registration number{canEditBusinessIdentity ? <Input className="mt-1" value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} autoComplete="off" /> : <span className="mt-1 block break-words font-medium">{workspace.registrationNumber || "Not provided"}</span>}</label>
              <label className="text-sm">Registration country{canEditBusinessIdentity ? <Input className="mt-1" value={registrationCountry} onChange={(event) => setRegistrationCountry(event.target.value)} /> : <span className="mt-1 block break-words font-medium">{workspace.registrationCountry || "Not provided"}</span>}</label>
              {!canEditBusinessIdentity && <p className="sm:col-span-2 text-xs text-muted-foreground">Verified business registration is locked after approval. Contact Afro AI if a correction is needed.</p>}
            </div>}
            {workspace.status === "information_required" && owner && <div className="space-y-2"><p className="text-sm font-medium">Response to requested information</p><Textarea aria-label="Response to requested information" value={response} onChange={(event) => setResponse(event.target.value)} rows={4} placeholder="Add the requested information for the review team." /><p className="text-xs text-muted-foreground">Submitting this response returns your application to pending review.</p></div>}
            <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending || (workspace.status === "information_required" && owner && !response.trim())}>{saveProfile.isPending ? "Saving…" : workspace.status === "information_required" && owner ? "Submit response for review" : "Save profile"}</Button>
          </CardContent></Card>
          {owner && <Card><CardHeader><CardTitle className="text-base">Submitted application details</CardTitle></CardHeader><CardContent><ApplicationDetails application={detailData?.application} /></CardContent></Card>}
        </TabsContent>
        <TabsContent value="commissions"><Ledger title="Commission ledger" rows={commissions} empty="No commission records are available." onExport={canExport ? () => exportCsv("commissions") : undefined} /></TabsContent>
        <TabsContent value="customers"><Card><CardHeader><CardTitle className="text-base">Attributed customers</CardTitle></CardHeader><CardContent>{renderRows(customers, "No customer records are available.")}</CardContent></Card></TabsContent>
        {isBusiness && <TabsContent value="leads"><div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-4"><Card><CardHeader><CardTitle className="text-base">Add a lead</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); createLead.mutate(); }}><Input placeholder="Name *" value={lead.name} onChange={(event) => setLead({ ...lead, name: event.target.value })} required /><Input type="email" placeholder="Email *" value={lead.email} onChange={(event) => setLead({ ...lead, email: event.target.value })} required /><Input placeholder="Phone (optional)" value={lead.phone} onChange={(event) => setLead({ ...lead, phone: event.target.value })} /><Input placeholder="Company (optional)" value={lead.company} onChange={(event) => setLead({ ...lead, company: event.target.value })} /><Textarea placeholder="Context (optional)" value={lead.message} onChange={(event) => setLead({ ...lead, message: event.target.value })} />{canAssignLeads && <label className="block text-sm">Assign to active member<select aria-label="Assign new lead" className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" value={newLeadAssignedUserId} onChange={(event) => setNewLeadAssignedUserId(event.target.value)}><option value="">Leave unassigned</option>{activeMembers.map((member) => <option key={member.id} value={member.user_id}>{member.email} · {member.role}</option>)}</select></label>}<Button type="submit" disabled={createLead.isPending || !canManageLeads}><Plus className="mr-2 h-4 w-4" />{createLead.isPending ? "Adding…" : "Add lead"}</Button></form></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Lead pipeline</CardTitle></CardHeader><CardContent className="space-y-3">{leads.length ? leads.map((item, index) => <LeadCard key={String(item.id ?? index)} row={item} canEdit={canManageLeads} canAssign={canAssignLeads} members={activeMembers} onAssign={(id, assignedUserId) => updateLead.mutate({ id, status: String(item.status || "new"), assignedUserId })} onUpdate={(id, status) => updateLead.mutate({ id, status })} onSaveNotes={(id, notes) => updateLead.mutate({ id, status: String(item.status || "new"), notes })} />) : <p className="text-sm text-muted-foreground text-center py-8">No leads are available.</p>}</CardContent></Card></div></TabsContent>}
        {isBusiness && <TabsContent value="team"><div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-4"><Card><CardHeader><CardTitle className="text-base">Invite a teammate</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">Workspace roles are separate from Afro AI internal team roles. Only the owner can invite admins or finance members and remove either role.</p><Input type="email" placeholder="Teammate email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} /><select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })}><option value="sales">Sales</option>{owner && <><option value="admin">Admin</option><option value="finance">Finance</option></>}</select><Button onClick={() => sendInvite.mutate()} disabled={!canManageTeam || !invite.email || sendInvite.isPending}><Mail className="mr-2 h-4 w-4" />{sendInvite.isPending ? "Sending…" : "Send invitation"}</Button>{!canManageTeam && <p className="text-xs text-muted-foreground">Your role does not have team-management access.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">People and invitations</CardTitle></CardHeader><CardContent className="space-y-5"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Members</p><div className="divide-y">{(detailData?.members || []).map((member: Member) => <MemberRow key={member.id} member={member} owner={owner} canManage={canManageTeam} onRole={(role) => updateMember.mutate({ id: member.id, payload: { role } })} onRemove={() => updateMember.mutate({ id: member.id, payload: { status: "removed" } })} />)}{!detailData?.members?.length && <p className="py-4 text-sm text-muted-foreground">No member records available.</p>}</div></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invitations</p><div className="divide-y">{(detailData?.invitations || []).map((item: Invitation) => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm">{item.email}</p><p className="text-xs text-muted-foreground">{item.role} · {item.status} · expires {new Date(item.expires_at).toLocaleDateString()}</p></div>{canManageTeam && <Button size="sm" variant="outline" disabled={revokeInvite.isPending} onClick={() => revokeInvite.mutate(item.id)}>Revoke</Button>}</div>)}{!detailData?.invitations?.length && <p className="py-4 text-sm text-muted-foreground">No open invitations.</p>}</div></div></CardContent></Card></div></TabsContent>}
        <TabsContent value="payouts"><Ledger title="Manual payout history" rows={payouts} empty="No payout records are available." onExport={canExport ? () => exportCsv("payouts") : undefined} /><p className="mt-3 text-xs text-muted-foreground">Payouts are made manually by the Afro AI team. This workspace never initiates a transfer.</p></TabsContent>
        <TabsContent value="resources"><Card><CardHeader><CardTitle className="text-base">Programme resources</CardTitle></CardHeader><CardContent><div className="divide-y">{(detailData?.resources || []).map((resource) => { const isExternal = isExternalResource(resource.url); return <div key={resource.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="font-medium text-sm">{resource.title}</p><p className="text-xs text-muted-foreground">{resource.description}</p></div><Button variant="outline" size="sm" onClick={() => resourceDownload(resource)}>{isExternal ? <ExternalLink className="mr-2 h-4 w-4" /> : <ArrowDownToLine className="mr-2 h-4 w-4" />}{isExternal ? "Open resource" : "Download"}</Button></div>; })}{!detailData?.resources?.length && <p className="py-6 text-sm text-muted-foreground">No resources are available for this workspace.</p>}</div></CardContent></Card></TabsContent>
        <TabsContent value="activity"><div className="grid lg:grid-cols-2 gap-4"><Card><CardHeader><CardTitle className="text-base">Email delivery status</CardTitle></CardHeader><CardContent>{renderRows(listValue(detailData?.emails), "No programme email events are available.")}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Workspace audit</CardTitle></CardHeader><CardContent>{renderRows(listValue(detailData?.audit), "No audit events are available.")}</CardContent></Card></div></TabsContent>
      </Tabs>
      {detail.isLoading && <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-muted-foreground"><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span><span className="text-xs">{label}</span></div><p className="mt-2 text-lg font-semibold break-words">{value}</p></CardContent></Card>;
}

function Ledger({ title, rows, empty, onExport }: { title: string; rows: Record<string, unknown>[]; empty: string; onExport?: () => void }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle className="text-base">{title}</CardTitle>{onExport && <Button size="sm" variant="outline" onClick={onExport}><ArrowDownToLine className="mr-2 h-4 w-4" />Export CSV</Button>}</CardHeader><CardContent>{rows.length ? <div className="divide-y">{rows.map((row, index) => {
    const id = String(row.id ?? index);
    const entries = Object.entries(row).filter(([key, value]) => key !== "id" && (typeof value !== "object" || value === null)).slice(0, 7);
    return <div key={id} className="py-3"><p className="text-xs font-mono text-muted-foreground">{row.id == null ? `Record ${index + 1}` : `#${id}`}</p><div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">{entries.map(([key, value]) => <p key={key} className="text-xs break-words"><span className="text-muted-foreground">{safeTitle(key)} </span>{displayField(row, key)}</p>)}</div></div>;
  })}</div> : <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>;
}

function LeadCard({ row, canEdit, canAssign, members, onAssign, onUpdate, onSaveNotes }: {
  row: Record<string, unknown>;
  canEdit: boolean;
  canAssign: boolean;
  members: Member[];
  onAssign: (id: number | string, assignedUserId: string) => void;
  onUpdate: (id: number | string, status: string) => void;
  onSaveNotes: (id: number | string, notes: string) => void;
}) {
  const [notes, setNotes] = useState(String(row.notes || ""));
  const id = row.id as string | number | undefined;
  const assignedUserId = String(row.assigned_user_id || "");
  const status = String(row.status || "new");
  return <article className="rounded-lg border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-sm">{displayField(row, "name")}</p><p className="text-xs text-muted-foreground">{displayField(row, "email")} · {displayField(row, "company")}</p></div><select aria-label={`Update lead ${id ?? "record"} status`} disabled={!canEdit || id == null} className="rounded-md border bg-background px-2 py-1 text-xs" value={status} onChange={(event) => id != null && onUpdate(id, event.target.value)}>{["new", "contacted", "qualified", "converted", "lost"].map((item) => <option key={item}>{item}</option>)}</select></div>{Boolean(row.message) && <p className="mt-2 text-xs text-muted-foreground">{displayField(row, "message")}</p>}{canAssign && <label className="mt-3 block text-xs text-muted-foreground">Assigned member<select aria-label={`Assign lead ${id ?? "record"}`} disabled={id == null || !canAssign} className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground" value={assignedUserId} onChange={(event) => { if (id != null && event.target.value) onAssign(id, event.target.value); }}><option value="" disabled>{assignedUserId ? "No active member found" : "Select an active member"}</option>{members.map((member) => <option key={member.id} value={member.user_id}>{member.email} · {member.role}</option>)}{assignedUserId && !members.some((member) => member.user_id === assignedUserId) && <option value={assignedUserId}>Current assignment</option>}</select></label>}<div className="mt-3 flex flex-col sm:flex-row gap-2"><Textarea aria-label="Internal lead notes" rows={2} disabled={!canEdit} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Internal follow-up notes" /><Button variant="outline" size="sm" disabled={!canEdit || id == null} onClick={() => id != null && onSaveNotes(id, notes)}>Save notes</Button></div></article>;
}

function MemberRow({ member, owner, canManage, onRole, onRemove }: { member: Member; owner: boolean; canManage: boolean; onRole: (role: string) => void; onRemove: () => void }) {
  const canEditThis = canManage && member.role !== "owner" && (owner || !["admin", "finance"].includes(member.role));
  return <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3"><div className="min-w-0"><p className="truncate text-sm">{member.email}</p><p className="text-xs text-muted-foreground">{member.role} · {member.status}</p></div>{canEditThis && <div className="flex gap-2"><select aria-label={`Change role for ${member.email}`} className="rounded-md border bg-background px-2 py-1 text-xs" value={member.role} onChange={(event) => onRole(event.target.value)}>{owner && <><option value="admin">Admin</option><option value="finance">Finance</option></>}<option value="sales">Sales</option></select><Button size="sm" variant="outline" onClick={onRemove}>Remove</Button></div>}</div>;
}
