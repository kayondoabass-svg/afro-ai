import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ApplicationDetails from "./ApplicationDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDownToLine, ChevronLeft, ChevronRight, Mail, RefreshCw, Search, ShieldCheck, Wallet } from "lucide-react";
import type { Money, Programme, ProgrammeDetail, Workspace } from "./programme-types";
import { displayField, money, safeTitle } from "./programme-types";

interface FounderList {
  items: Workspace[];
  total: number;
  page: number;
  pageSize: number;
  rangeBasis?: string;
  stats: {
    applications: number;
    pending: number;
    approved: number;
    rejected: number;
    active: number;
    suspended: number;
    clicks: number;
    signups: number;
    payingCustomers: number;
    finance: Money[];
    emailsPending: number;
    emailsUncertain: number;
  };
  checkedAt: string;
}

function decodeError(error: unknown) {
  const message = error instanceof Error ? error.message : "The request failed.";
  const match = message.match(/^\d+:\s*(\{[\s\S]*\})$/);
  if (match) {
    try { return JSON.parse(match[1]).message || message; } catch { return message; }
  }
  return message;
}

function items(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
}

function moneyLabel(key: string) {
  if (!/cents$/i.test(key)) return safeTitle(key);
  const amountName = key.replace(/_?cents$/i, "").replace(/[_-]/g, " ");
  return `${safeTitle(amountName)} (formatted currency)`;
}

function rangeBasisLabel(value?: string) {
  const normalized = (value || "application_submission_date").toLowerCase().replace(/[_-]/g, " ");
  return normalized.includes("application") || normalized.includes("submission") || normalized.includes("submitted")
    ? "application submission date"
    : normalized;
}

function getFounderDeepLink(): { programme: Programme; applicationId: number } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const programme = params.get("programme");
  const applicationId = Number(params.get("application"));
  if ((programme === "affiliate" || programme === "business") && Number.isSafeInteger(applicationId) && applicationId > 0) {
    return { programme, applicationId };
  }
  return null;
}

function deepLinkPlaceholder(programme: Programme, applicationId: number): Workspace {
  return {
    programme,
    applicationId,
    displayName: `Application #${applicationId}`,
    status: "pending",
    role: "owner",
    reviewNotes: null,
    tier: null,
    commissionPercent: programme === "business" ? 20 : 10,
    registrationStatus: "unverified",
    registrationNumber: null,
    registrationCountry: null,
    payoutMethod: null,
    referralLink: null,
    stats: { clicks: 0, signups: 0, payingCustomers: 0, finance: [] },
  };
}

function csvDownload(response: Response, filename: string) {
  response.blob().then((blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

export default function FounderProgrammes() {
  const { toast } = useToast();
  const [deepLink] = useState(getFounderDeepLink);
  const [programme, setProgramme] = useState<Programme>(deepLink?.programme || "affiliate");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Workspace | null>(() => deepLink ? deepLinkPlaceholder(deepLink.programme, deepLink.applicationId) : null);
  const deepLinkApplied = useRef(false);
  const [notes, setNotes] = useState("");
  const [tier, setTier] = useState<"authorized" | "premium" | "premier">("authorized");
  const [registrationVerified, setRegistrationVerified] = useState(false);
  const [commissionIds, setCommissionIds] = useState<number[]>([]);
  const [payoutCurrency, setPayoutCurrency] = useState("");
  const [payoutMethod, setPayoutMethod] = useState<"bank" | "mobile_money">("bank");
  const [payoutReference, setPayoutReference] = useState("");
  const [payoutConfirmation, setPayoutConfirmation] = useState(false);
  const [resendConfirm, setResendConfirm] = useState("");
  const params = useMemo(() => {
    const search = new URLSearchParams({ programme, page: String(page) });
    if (q.trim()) search.set("q", q.trim());
    if (status) search.set("status", status);
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    return search.toString();
  }, [programme, page, q, status, from, to]);
  const list = useQuery<FounderList>({
    queryKey: [`/api/founder/programmes?${params}`],
    select: (report) => {
      if(!report || !Array.isArray(report.items) || !report.stats ||
        typeof report.stats.applications!=="number" || !Array.isArray(report.stats.finance))
        throw new Error("The programme report response is incomplete. Please retry.");
      return report;
    },
  });
  const detail = useQuery<ProgrammeDetail>({
    queryKey: [`/api/founder/programmes/${selected?.programme}/${selected?.applicationId}`],
    enabled: !!selected,
  });
  const selectedRecord = detail.data?.workspace || selected;
  useEffect(() => {
    if (!deepLink || deepLinkApplied.current || !detail.data?.workspace) return;
    const target = detail.data.workspace;
    if (target.programme !== deepLink.programme || target.applicationId !== deepLink.applicationId) return;
    deepLinkApplied.current = true;
    setSelected(target);
    setNotes(target.reviewNotes || "");
    setTier((target.tier as typeof tier) || "authorized");
    window.setTimeout(() => document.getElementById("selected-programme")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 0);
  }, [deepLink, detail.data]);
  const invalidate = () => queryClient.invalidateQueries({
      predicate: (query) => String(query.queryKey[0]).startsWith("/api/founder/programmes"),
    });
  const review = useMutation({
    mutationFn: ({ decision, extra = {} }: { decision: string; extra?: Record<string, unknown> }) => apiRequest(
      "POST",
      `/api/founder/programmes/${selected?.programme}/${selected?.applicationId}/review`,
      { decision, notes, ...extra },
    ),
    onSuccess: async (_data, variables) => {
      const decision = variables.decision;
      toast({ title: `Application ${decision.replace("_", " ")}` });
      await invalidate();
    },
    onError: (error) => toast({ title: "Review action failed", description: decodeError(error), variant: "destructive" }),
  });
  const payout = useMutation({
    mutationFn: () => apiRequest("POST", `/api/founder/programmes/${selected?.programme}/${selected?.applicationId}/payouts`, {
      currency: payoutCurrency, commissionIds, method: payoutMethod, reference: payoutReference.trim(), confirmation: "PAID MANUALLY",
    }),
    onSuccess: () => { setCommissionIds([]); setPayoutReference(""); setPayoutConfirmation(false); toast({ title: "Offline payment recorded", description: "The ledger was updated; no transfer was initiated." }); invalidate(); },
    onError: (error) => toast({ title: "Payment record failed", description: decodeError(error), variant: "destructive" }),
  });
  const adjust = useMutation({
    mutationFn: ({ id, reason }: { id: number | string; reason: string }) => apiRequest("POST", `/api/founder/programmes/${selected?.programme}/${selected?.applicationId}/commissions/${id}/adjust`, { reason }),
    onSuccess: () => { toast({ title: "Commission adjustment recorded" }); invalidate(); },
    onError: (error) => toast({ title: "Adjustment failed", description: decodeError(error), variant: "destructive" }),
  });
  const resend = useMutation({
    mutationFn: (id: number | string) => apiRequest("POST", `/api/founder/programmes/emails/${id}/resend`, { confirmation: "RESEND" }),
    onSuccess: () => { setResendConfirm(""); toast({ title: "Email resend requested", description: "Check the delivery status; acceptance does not confirm delivery." }); invalidate(); },
    onError: (error) => toast({ title: "Resend failed", description: decodeError(error), variant: "destructive" }),
  });

  const selectWorkspace = (workspace: Workspace) => {
    setSelected(workspace);
    setNotes(workspace.reviewNotes || "");
    setTier((workspace.tier as typeof tier) || "authorized");
    setRegistrationVerified(false);
    setCommissionIds([]);
    setPayoutCurrency("");
  };
  const doExport = async (kind: "commissions" | "payouts") => {
    if (!selected) return;
    try {
      const response = await apiRequest("GET", `/api/founder/programmes/${selected.programme}/${selected.applicationId}/export?kind=${kind}`);
      csvDownload(response, `${selected.programme}-${selected.applicationId}-${kind}.csv`);
    } catch (error) { toast({ title: "Export unavailable", description: decodeError(error), variant: "destructive" }); }
  };
  const commissionRows = items(detail.data?.commissions);
  const payoutCurrencies = Array.from(new Set(commissionRows.filter((row) => ["pending", "approved"].includes(String(row.status))).map((row) => String(row.currency || "")).filter(Boolean)));
  const registrationComplete = Boolean(detail.data?.workspace.registrationNumber?.trim() && detail.data?.workspace.registrationCountry?.trim());
  const payoutEligible = commissionRows.filter((row) => ["pending", "approved"].includes(String(row.status)) && String(row.currency) === payoutCurrency && Number.isFinite(Number(row.id)));
  const reviewAction = (decision: string, extra?: Record<string, unknown>) => review.mutate({ decision, extra });
  const filterTo = (next: string) => { setStatus(next); setPage(1); };
  const openEmailRecords = () => {
    const workspace = selected || list.data?.items[0];
    if (!workspace) return;
    if (!selected) selectWorkspace(workspace);
    window.setTimeout(() => document.getElementById("programme-email-events")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
  };

  return (
    <section className="space-y-4" id="founder-programmes">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Programme operations</p><h2 className="mt-1 text-xl font-semibold">Affiliates & business partners</h2><p className="mt-1 text-sm text-muted-foreground">Review applications, keep a clear email trail and record payments made offline.</p></div>
        <div className="flex gap-2"><Button size="sm" variant={programme === "affiliate" ? "default" : "outline"} onClick={() => { setProgramme("affiliate"); setSelected(null); setPage(1); }}>Affiliate</Button><Button size="sm" variant={programme === "business" ? "default" : "outline"} onClick={() => { setProgramme("business"); setSelected(null); setPage(1); }}>Business</Button></div>
      </div>
      {list.isLoading ? <div className="grid sm:grid-cols-3 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : list.isError ? <Card><CardContent className="p-6 flex items-center justify-between gap-4"><p className="text-sm text-destructive">{decodeError(list.error)}</p><Button variant="outline" onClick={() => list.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></CardContent></Card> : list.data && <>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Summary label="Applications" value={list.data.stats.applications} onClick={() => filterTo("")} />
          <Summary label="Pending review" value={list.data.stats.pending} onClick={() => filterTo("pending")} />
          <Summary label="Approved" value={list.data.stats.approved} onClick={() => filterTo("approved")} />
          <Summary label="Rejected" value={list.data.stats.rejected} onClick={() => filterTo("rejected")} />
          <Summary label="Active" value={list.data.stats.active} onClick={() => filterTo("active")} />
          <Summary label="Suspended" value={list.data.stats.suspended} onClick={() => filterTo("suspended")} />
          <Summary label="Clicks" value={list.data.stats.clicks} />
          <Summary label="Sign-ups" value={list.data.stats.signups} />
          <Summary label="Paying customers" value={list.data.stats.payingCustomers} />
          <Summary label="Pending email jobs" value={list.data.stats.emailsPending} onClick={openEmailRecords} />
          <Summary label="Uncertain email jobs" value={list.data.stats.emailsUncertain} onClick={openEmailRecords} />
           <div className="rounded-lg border bg-card p-3 col-span-2 sm:col-span-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Finance by currency · formatted from cents</p>{list.data.stats.finance.map((item) => <p key={item.currency} className="mt-1 text-xs">{item.currency}: {money(item.earnedCents, item.currency)} earned</p>)}<p className="mt-2 text-[10px] text-muted-foreground">The figures are formatted currency amounts; source ledger values are stored in cents.</p></div>
        </div>
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <label className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search name or email" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} /></label>
            <select className="rounded-md border bg-background px-3 py-2 text-sm" value={status} onChange={(event) => filterTo(event.target.value)}><option value="">All statuses</option>{["pending", "approved", "rejected", "information_required", "active", "suspended"].map((item) => <option key={item}>{item}</option>)}</select>
            <label className="text-xs text-muted-foreground">Applied from<Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
            <label className="text-xs text-muted-foreground">Applied to<Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
            <Button variant="outline" onClick={() => list.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          </div>
          <p className="text-xs text-muted-foreground">Date range basis: {rangeBasisLabel(list.data.rangeBasis)}. Financial totals aggregate the applications selected by this filter; they are not filtered by transaction date.</p>
          <div className="divide-y">{list.data.items.map((workspace) => <button type="button" key={`${workspace.programme}-${workspace.applicationId}`} onClick={() => selectWorkspace(workspace)} className={`w-full rounded-md px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.applicationId === workspace.applicationId && selected.programme === workspace.programme ? "bg-primary/5" : ""}`}>
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-sm">{workspace.displayName}</span><Badge variant="outline">{workspace.status}</Badge><Badge variant="secondary">{workspace.role}</Badge><span className="ml-auto text-xs text-muted-foreground">{workspace.programme} · #{workspace.applicationId}</span></div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{workspace.stats.clicks} clicks</span><span>{workspace.stats.signups} sign-ups</span><span>{workspace.stats.payingCustomers} paying</span><span>{workspace.commissionPercent}% · {workspace.tier || "tier unassigned"}</span><span>Registration {workspace.registrationStatus}</span></div>
          </button>)}{!list.data.items.length && <p className="py-8 text-center text-sm text-muted-foreground">No records match these filters.</p>}</div>
          <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{list.data.total} records · checked {new Date(list.data.checkedAt).toLocaleString()}</p><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" />Previous</Button><span className="text-xs">Page {list.data.page}</span><Button size="sm" variant="outline" disabled={list.data.page * list.data.pageSize >= list.data.total} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button></div></div>
        </CardContent></Card>
      </>}
      {selected && (detail.isLoading ? <div className="grid gap-3 sm:grid-cols-2" id="selected-programme"><Skeleton className="h-72" /><Skeleton className="h-72" /></div> : <div className="grid xl:grid-cols-[0.9fr_1.1fr] gap-4" id="selected-programme">
        <div className="space-y-4">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Application review · {selectedRecord?.displayName}</CardTitle></CardHeader><CardContent className="space-y-3">
            {detail.isLoading ? <Skeleton className="h-20" /> : detail.isError ? <div className="flex items-center justify-between text-sm"><span className="text-destructive">{decodeError(detail.error)}</span><Button size="sm" variant="outline" onClick={() => detail.refetch()}>Retry</Button></div> : <p className="text-xs text-muted-foreground">Programme: {selectedRecord?.programme} · Status: {selectedRecord?.status} · Registration: {selectedRecord?.registrationStatus}</p>}
            <label className="block text-xs text-muted-foreground">Founder review notes<Textarea rows={3} className="mt-1" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            {selected.programme === "business" && <><div className="grid sm:grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3"><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Registration number</p><p className="mt-1 text-sm font-medium break-words">{detail.data?.workspace.registrationNumber || selected.registrationNumber || "Not provided"}</p></div><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Registration country</p><p className="mt-1 text-sm font-medium break-words">{detail.data?.workspace.registrationCountry || selected.registrationCountry || "Not provided"}</p></div></div><label className="block text-sm">Founder-assigned tier<select className="mt-1 block w-full rounded-md border bg-background px-3 py-2" value={tier} onChange={(event) => setTier(event.target.value as typeof tier)}><option value="authorized">Authorized — 20%</option><option value="premium">Premium — 30%</option><option value="premier">Premier — 40%</option></select></label><label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={registrationVerified} disabled={!registrationComplete} onChange={(event) => setRegistrationVerified(event.target.checked)} className="mt-0.5" />I verified the submitted business registration number and country and deliberately confirm this tier. The applicant's requested tier does not determine the approved rate.</label>{!registrationComplete && <p className="text-xs text-destructive">Registration number and country are required before business approval.</p>}</>}
            <div className="grid grid-cols-2 gap-2">{selectedRecord?.status === "pending" || selectedRecord?.status === "information_required" ? <><Button disabled={review.isPending || (selected.programme === "business" && (!registrationVerified || !registrationComplete))} onClick={() => reviewAction("approved", selected.programme === "business" ? { tier, registrationVerified: true } : {})}>Approve</Button><Button variant="outline" disabled={review.isPending} onClick={() => reviewAction("information_required")}>Request information</Button><Button variant="destructive" disabled={review.isPending} onClick={() => reviewAction("rejected")}>Reject</Button></> : selectedRecord?.status === "suspended" ? <Button disabled={review.isPending} onClick={() => reviewAction("active")}>Reactivate</Button> : selectedRecord && ["approved", "active"].includes(selectedRecord.status) ? <><Button variant="outline" disabled={review.isPending} onClick={() => reviewAction("suspended")}>Suspend</Button>{selected.programme === "business" && <Button variant="outline" disabled={review.isPending || !registrationVerified || !registrationComplete} onClick={() => reviewAction("approved", { tier, registrationVerified: true })}>Update approved tier</Button>}</> : <p className="col-span-2 text-xs text-muted-foreground">No review actions are available for this status.</p>}</div>
            <p className="text-[11px] text-muted-foreground">Affiliate commission is 10%. Business tiers are fixed at 20%, 30% and 40%. Approval never sends a payout.</p>
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Submitted application details</CardTitle></CardHeader><CardContent><ApplicationDetails application={detail.data?.application} /></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" />Record an offline payout</CardTitle></CardHeader><CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Send payment outside Afro AI first. This records only a completed manual payment; it cannot initiate a transfer.</p>
            <div className="grid sm:grid-cols-2 gap-2"><label className="text-xs">Currency<select className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" value={payoutCurrency} onChange={(event) => { setPayoutCurrency(event.target.value); setCommissionIds([]); }}><option value="">Select currency</option>{payoutCurrencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label className="text-xs">Method<select className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value as typeof payoutMethod)}><option value="bank">Bank</option><option value="mobile_money">Mobile money</option></select></label></div>
            <Input placeholder="Offline payment reference" value={payoutReference} onChange={(event) => setPayoutReference(event.target.value)} />
            <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">{payoutEligible.map((commission, index) => { const id = Number(commission.id); return <label key={id} className="flex items-center gap-2 py-1 text-xs"><input type="checkbox" checked={commissionIds.includes(id)} onChange={(event) => setCommissionIds((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))} />Commission #{id} · {String(commission.currency)} {displayField(commission, "amount_cents")} · {displayField(commission, "status")}</label>; })}{!payoutEligible.length && <p className="p-2 text-xs text-muted-foreground">Choose a currency with pending or approved commissions.</p>}</div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={payoutConfirmation} onChange={(event) => setPayoutConfirmation(event.target.checked)} className="mt-0.5" />I confirm I already sent this payment manually outside Afro AI.</label>
            <Button className="w-full" disabled={!payoutCurrency || !commissionIds.length || !payoutReference.trim() || !payoutConfirmation || payout.isPending} onClick={() => payout.mutate()}>{payout.isPending ? "Recording…" : "Record payment made manually"}</Button>
          </CardContent></Card>
        </div>
        <div className="space-y-4">
          {detail.data?.truncated && <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><strong>Limited detail response.</strong> This view is capped at 500 rows. Use the commission and payout CSV exports below for complete ledger history.</div>}
          <RecordCard title="Customers" rows={items(detail.data?.customers)} onExport={undefined} />
          <RecordCard title="Commissions" rows={commissionRows} onExport={() => doExport("commissions")} onAdjust={(row) => {
            const reason = window.prompt("Reason for reversing this erroneous or refunded commission:");
            if (reason?.trim() && row.id != null) adjust.mutate({ id: row.id as string | number, reason: reason.trim() });
          }} />
          <RecordCard title="Payouts" rows={items(detail.data?.payouts)} onExport={() => doExport("payouts")} />
          <RecordCard title="Leads" rows={items(detail.data?.leads)} />
          <RecordCard title="Members" rows={(detail.data?.members || []).map((member) => ({ id: member.id, email: member.email, role: member.role, status: member.status }))} />
          <RecordCard title="Invitations" rows={(detail.data?.invitations || []).map((item) => ({ id: item.id, email: item.email, role: item.role, status: item.status, expires_at: item.expires_at }))} />
          <Card id="programme-email-events"><CardHeader><CardTitle className="text-base flex gap-2 items-center"><Mail className="w-4 h-4" />Email events</CardTitle></CardHeader><CardContent><MetadataRows rows={items(detail.data?.emails)} empty="No email records are available." onResend={(row) => {
            if (resendConfirm !== String(row.id)) { setResendConfirm(String(row.id)); return; }
            if (row.id != null) resend.mutate(row.id as number | string);
          }} resendConfirm={resendConfirm} /></CardContent></Card>
          <RecordCard title="Audit history" rows={items(detail.data?.audit)} />
          <Card><CardHeader><CardTitle className="text-base">Resources</CardTitle></CardHeader><CardContent><MetadataRows rows={(detail.data?.resources || []).map((resource) => ({ id: resource.id, title: resource.title, description: resource.description, url: resource.url }))} empty="No resources are available." /></CardContent></Card>
        </div>
      </div>)}
    </section>
  );
}

function Summary({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return <Card><CardContent className="p-3">{onClick ? <button type="button" onClick={onClick} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"><p className="text-lg font-semibold">{value}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p></button> : <><p className="text-lg font-semibold">{value}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p></>}</CardContent></Card>;
}

function RecordCard({ title, rows, onExport, onAdjust }: { title: string; rows: Record<string, unknown>[]; onExport?: () => void; onAdjust?: (row: Record<string, unknown>) => void }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between gap-2"><CardTitle className="text-base">{title}</CardTitle>{onExport && <Button size="sm" variant="outline" onClick={onExport}><ArrowDownToLine className="mr-1 h-3.5 w-3.5" />CSV</Button>}</CardHeader><CardContent><MetadataRows rows={rows} empty={`No ${title.toLowerCase()} records.`} onAdjust={onAdjust} /></CardContent></Card>;
}

function MetadataRows({ rows, empty, onResend, resendConfirm, onAdjust }: { rows: Record<string, unknown>[]; empty: string; onResend?: (row: Record<string, unknown>) => void; resendConfirm?: string; onAdjust?: (row: Record<string, unknown>) => void }) {
  if (!rows.length) return <p className="py-4 text-sm text-muted-foreground">{empty}</p>;
  return <div className="divide-y">{rows.map((row, index) => {
    const id = String(row.id ?? index);
    const status = String(row.status || row.state || "");
    const canResend = onResend && ["pending", "queued", "uncertain"].includes(status);
     return <div key={id} className="py-3"><div className="flex flex-wrap justify-between items-start gap-2"><div className="flex items-center text-xs font-medium">#{id} {status && <Badge variant="outline" className="ml-1">{status}</Badge>}</div>{canResend && <Button size="sm" variant="outline" onClick={() => onResend(row)}>{resendConfirm === id ? "Confirm RESEND" : "Resend email"}</Button>}{onAdjust && ["pending", "approved"].includes(status) && <Button size="sm" variant="outline" onClick={() => onAdjust(row)}>Reverse commission</Button>}</div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{Object.entries(row).filter(([key, value]) => key !== "id" && (typeof value !== "object" || value === null)).slice(0, 7).map(([key, value]) => <span key={key} className="text-[11px] break-words"><span className="text-muted-foreground">{moneyLabel(key)}: </span>{displayField(row, key)}</span>)}</div>{canResend && <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-400">A resend could create a duplicate. Confirm only when a fresh send is appropriate. Accepted is not the same as delivered.</p>}</div>;
  })}</div>;
}
