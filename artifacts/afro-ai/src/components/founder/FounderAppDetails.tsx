import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, CheckCircle, CircleAlert, ExternalLink, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { safeFounderAppHref } from "@/components/founder/FounderOperations";

export type FounderAppDetailsData = {
  app: { id: number | string; title?: string | null; subdomain?: string | null; customDomain?: string | null; appStatus?: string | null; suspendReason?: string | null; suspendedAt?: string | null; createdAt?: string | null; updatedAt?: string | null };
  owner: { id?: string | null; email?: string | null; firstName?: string | null; lastName?: string | null; plan?: string | null } | null;
  projects: null | { id: number | string; name?: string | null; type?: string | null; status?: string | null }[];
  payments: null | { id: number | string; plan?: string | null; amount?: number | string | null; currency?: string | null; status?: string | null; payment_method?: string | null; created_at?: string | null }[];
  ussd: null | { id: number | string; plan?: string | null; status?: string | null; created_at?: string | null }[];
  events: null | { id: number | string; action?: string | null; reason?: string | null; actor_id?: string | null; created_at?: string | null; email_status?: string | null; email_error?: string | null; provider?: string | null; provider_message_id?: string | null }[];
  ussdApps?: null | { id: number | string; name?: string | null; is_active?: boolean | null; sessions_used?: number | null; created_at?: string | null }[];
  unavailableSections?: string[];
  relatedRecordsScope?: string | null;
  historyNote?: string | null;
  hosting: { freePeriodDays?: number; projectPreserved?: boolean; dailyAllowance?: string } | null;
};

export const founderAppDetailsKey = (appId: number | string) => ["/api/admin/published-apps", String(appId), "details"] as const;

export function safeTime(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
const text = (v: unknown, fallback = "Not recorded") => (v === null || v === undefined || v === "" ? fallback : String(v));

export function emailStatusLabel(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (!s) return "No email recorded";
  if (s === "accepted" || s === "sent") return "Accepted by provider, delivery not confirmed";
  if (s === "pending" || s === "queued" || s === "scheduled") return "Queued — delivery not confirmed";
  if (s === "sending") return "Sending — delivery not confirmed";
  if (s === "uncertain") return "Delivery unconfirmed — review required";
  if (s === "not_requested") return "No email requested for this event";
  if (s === "delivered") return "Delivered (provider confirmed)";
  if (s === "failed" || s === "error" || s === "bounced") return "Not delivered";
  if (s === "skipped") return "Not sent";
  return s;
}

function Block({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
function Row({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium" data-testid={testId}>{value}</span>
    </div>
  );
}
const Unavailable = ({ name }: { name: string }) => <p role="status" className="rounded-md border border-amber-600/30 bg-amber-500/[0.05] px-3 py-3 text-xs text-amber-800 dark:text-amber-300" data-testid={`unavailable-${name}`}>This lookup is unavailable right now. No records are inferred.</p>;
const count = (list: unknown[] | null | undefined) => (Array.isArray(list) ? String(list.length) : "unavailable");
const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">{children}</p>;

export function FounderAppDetails({ appId, isFounder, open, onOpenChange }: {
  appId: number | string | null; isFounder: boolean; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);
  const enabled = isFounder && open && appId !== null && appId !== "";

  useEffect(() => { setReason(""); setConfirmSuspend(false); setConfirmReactivate(false); }, [appId]);

  const query = useQuery<FounderAppDetailsData>({
    queryKey: founderAppDetailsKey(appId ?? ""),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: enabled ? 30_000 : false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/published-apps/${encodeURIComponent(String(appId))}/details`);
      return res.json();
    },
  });

  const invalidate = () => {
    if (appId !== null) void queryClient.invalidateQueries({ queryKey: founderAppDetailsKey(appId) });
    void queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/founder/overview"] });
    void queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/founder/records/apps") });
  };

  const suspend = useMutation({
    mutationFn: async (r: string) => { await apiRequest("POST", `/api/admin/published-apps/${encodeURIComponent(String(appId))}/suspend`, { reason: r }); },
    onSuccess: () => { invalidate(); setReason(""); setConfirmSuspend(false); toast({ title: "App suspended", description: "Reason recorded. Owner email is sent in the background." }); },
    onError: (e: any) => toast({ title: "Suspension failed", description: e?.message || "The app was not suspended.", variant: "destructive" }),
  });
  const reactivate = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/admin/published-apps/${encodeURIComponent(String(appId))}/reactivate`); },
    onSuccess: () => { invalidate(); setConfirmReactivate(false); toast({ title: "App reactivated", description: "The app is back online." }); },
    onError: (e: any) => toast({ title: "Reactivation failed", description: e?.message || "The app was not reactivated.", variant: "destructive" }),
  });

  const d = enabled ? query.data : undefined;
  const app = d?.app;
  const suspended = app?.appStatus === "suspended";
  const href = app ? safeFounderAppHref(app as Record<string, unknown>) : null;
  const trimmed = reason.trim();
  const reasonValid = trimmed.length >= 5 && trimmed.length <= 1000;
  const off = (key: string, list: unknown) => !Array.isArray(list) || Boolean(d?.unavailableSections?.includes(key));
  const ownerName = d?.owner ? [d.owner.firstName, d.owner.lastName].filter(Boolean).join(" ") : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg" data-testid="sheet-app-details">
        <SheetHeader className="sticky top-0 z-10 border-b bg-background/95 px-5 py-4 text-left backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Published app</p>
          <SheetTitle className="pr-6 text-lg" data-testid="text-app-details-title">{app ? text(app.title, `App ${app.id}`) : appId ? `App ${appId}` : "App details"}</SheetTitle>
          <SheetDescription>Founder-only view. Credentials and provider secrets are never shown.</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-5 py-5">
          {query.isPending && enabled ? (
            <div className="space-y-3" aria-label="Loading app details">{[0, 1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/50" />)}</div>
          ) : query.isError ? (
            <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/30 p-4">
              <div className="flex gap-2"><CircleAlert className="h-5 w-5 text-destructive" /><div><p className="font-medium">App details could not be loaded</p><p className="text-sm text-muted-foreground">Nothing is inferred while the details endpoint is unavailable.</p></div></div>
              <Button variant="outline" size="sm" onClick={() => query.refetch()} data-testid="button-retry-app-details"><RefreshCw className="mr-2 h-3.5 w-3.5" />Retry</Button>
            </div>
          ) : d && app ? (
            <>
              <div className={`rounded-xl border p-4 ${suspended ? "border-destructive/40 bg-destructive/[0.04]" : "border-emerald-600/30 bg-emerald-500/[0.04]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={suspended ? "destructive" : "secondary"} data-testid="status-app">{suspended ? "Suspended" : text(app.appStatus, "Status not recorded")}</Badge>
                  {href && <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" data-testid="link-app-live">Live site<ExternalLink className="h-3 w-3" /></a>}
                </div>
                {suspended && <div className="mt-3 space-y-1 text-sm">
                  <p data-testid="text-suspend-reason"><span className="text-muted-foreground">Reason: </span>{app.suspendReason?.trim() ? app.suspendReason : "No reason was recorded for this suspension."}</p>
                  <p className="text-xs text-muted-foreground" data-testid="text-suspended-at">Suspended {safeTime(app.suspendedAt)}</p>
                </div>}
              </div>

              <Block title="App" testId="section-app">
                <div>
                  <Row label="ID" value={<span className="font-mono">{String(app.id)}</span>} />
                  <Row label="Subdomain" value={text(app.subdomain)} testId="text-app-subdomain" />
                  <Row label="Custom domain" value={text(app.customDomain, "None")} />
                  <Row label="Created" value={safeTime(app.createdAt)} testId="text-app-created" />
                  <Row label="Updated" value={safeTime(app.updatedAt)} />
                </div>
              </Block>

              {d.relatedRecordsScope && <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="text-related-scope">{d.relatedRecordsScope}</p>}
              <Block title="Owner" testId="section-owner">
                {d.unavailableSections?.includes("owner") ? <Unavailable name="owner" /> : d.owner ? <div>
                  <Row label="Email" value={text(d.owner.email)} testId="text-owner-email" />
                  <Row label="Name" value={ownerName || "Not recorded"} />
                  <Row label="Plan" value={text(d.owner.plan)} />
                  <Row label="User ID" value={<span className="font-mono text-xs">{text(d.owner.id)}</span>} />
                </div> : <Empty>Owner record not found.</Empty>}
              </Block>

              <Block title={`Projects (${count(d.projects)})`} testId="section-projects">
                {off("projects", d.projects) ? <Unavailable name="projects" /> : d.projects?.length ? <ul className="space-y-1.5">{d.projects.map(p => <li key={p.id} className="flex justify-between gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm"><span className="truncate">{text(p.name, `Project ${p.id}`)}</span><span className="shrink-0 text-xs text-muted-foreground">{[p.type, p.status].filter(Boolean).join(" · ") || "Not recorded"}</span></li>)}</ul> : <Empty>No projects linked to this owner.</Empty>}
              </Block>

              <Block title={`Owner payments (${count(d.payments)})`} testId="section-payments">
                {off("payments", d.payments) ? <Unavailable name="payments" /> : d.payments?.length ? <ul className="space-y-1.5">{d.payments.map(p => <li key={p.id} className="rounded-md bg-muted/30 px-3 py-2 text-sm"><div className="flex justify-between gap-2"><span className="capitalize">{text(p.plan, "Plan not recorded")}</span><span className="font-mono">{p.amount ?? "?"} {p.currency || ""}</span></div><p className="text-xs text-muted-foreground">{text(p.status)} · {text(p.payment_method, "method not recorded")} · {safeTime(p.created_at)}</p></li>)}</ul> : <Empty>No payments recorded for this owner.</Empty>}
              </Block>

              <Block title={`Owner USSD subscriptions (${count(d.ussd)})`} testId="section-ussd">
                <p className="text-xs text-muted-foreground" data-testid="text-ussd-disclaimer">A subscription record is billing data only. It does not prove a USSD code is connected or live.</p>
                {off("ussd", d.ussd) ? <Unavailable name="ussd" /> : d.ussd?.length ? <ul className="space-y-1.5">{d.ussd.map(u => <li key={u.id} className="flex justify-between gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm"><span className="capitalize">{text(u.plan)}</span><span className="text-xs text-muted-foreground">{text(u.status)} · {safeTime(u.created_at)}</span></li>)}</ul> : <Empty>No USSD subscriptions.</Empty>}
              </Block>

              {d.historyNote && <p className="-mb-4 text-xs text-muted-foreground" data-testid="text-history-note">{d.historyNote}</p>}
              <Block title={`Suspension history (${count(d.events)})`} testId="section-events">
                {off("events", d.events) ? <Unavailable name="events" /> : d.events?.length ? <ol className="space-y-2">{d.events.map(e => <li key={e.id} className="rounded-md border px-3 py-2 text-sm" data-testid={`event-${e.id}`}>
                  <div className="flex justify-between gap-2"><span className="font-medium capitalize">{text(e.action, "Action not recorded")}</span><span className="text-xs text-muted-foreground">{safeTime(e.created_at)}</span></div>
                  <p className="mt-1 text-xs">{e.reason?.trim() ? e.reason : "Reason not recorded"}</p>
                  <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-event-email-${e.id}`}>Owner email: {emailStatusLabel(e.email_status)}{e.provider ? ` via ${e.provider}` : ""}</p>
                  {e.email_error && <p className="mt-1 break-words text-xs text-destructive">{e.email_error.slice(0, 200)}</p>}
                </li>)}</ol> : <Empty>No suspension or reactivation events recorded.</Empty>}
              </Block>

              <Block title={`Owner USSD apps (${count(d.ussdApps)})`} testId="section-ussd-apps">
                {off("ussdApps", d.ussdApps) ? <Unavailable name="ussdApps" /> : d.ussdApps?.length ? <ul className="space-y-1.5">{d.ussdApps.map(u => <li key={u.id} className="flex justify-between gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm" data-testid={`ussd-app-${u.id}`}><span className="truncate">{text(u.name, `USSD app ${u.id}`)}</span><span className="shrink-0 text-xs text-muted-foreground">{u.is_active === true ? "Marked active" : u.is_active === false ? "Inactive" : "State not recorded"} · {u.sessions_used ?? "?"} sessions · {safeTime(u.created_at)}</span></li>)}</ul> : <Empty>No USSD apps for this owner.</Empty>}
                <p className="text-xs text-muted-foreground">Shortcode and provider configuration are not included in this data.</p>
              </Block>

              <Block title="Hosting policy" testId="section-hosting">
                <div>
                  <Row label="Free hosting period" value={d.hosting?.freePeriodDays != null ? `${d.hosting.freePeriodDays} days` : "Not reported"} />
                  <Row label="Project preserved on suspension" value={d.hosting?.projectPreserved === true ? "Yes" : d.hosting?.projectPreserved === false ? "No" : "Not reported"} />
                </div>
                {d.hosting?.dailyAllowance && <p className="text-xs text-muted-foreground">{d.hosting.dailyAllowance}</p>}
              </Block>

              <Block title={suspended ? "Reactivate" : "Suspend"} testId="section-action">
                {suspended ? (
                  <div className="space-y-3 rounded-lg border p-3">
                    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmReactivate} onChange={e => setConfirmReactivate(e.target.checked)} data-testid="checkbox-confirm-reactivate" />I confirm this app should go back online.</label>
                    <Button className="w-full" disabled={!confirmReactivate || reactivate.isPending} onClick={() => reactivate.mutate()} data-testid="button-confirm-reactivate"><CheckCircle className="mr-2 h-4 w-4" />{reactivate.isPending ? "Reactivating..." : "Reactivate app"}</Button>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border border-destructive/30 p-3">
                    <p className="flex gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />The app goes offline. The project itself is preserved.</p>
                    <label className="block text-xs font-medium" htmlFor="suspend-reason">Reason (shared with the owner)</label>
                    <Textarea id="suspend-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} placeholder="Explain why this app is being suspended" data-testid="input-suspend-reason" />
                    <p className="text-[11px] text-muted-foreground" data-testid="text-reason-hint">{trimmed.length}/1000 characters, at least 5. The owner is emailed in the background; delivery is not confirmed here.</p>
                    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmSuspend} onChange={e => setConfirmSuspend(e.target.checked)} data-testid="checkbox-confirm-suspend" />I confirm this app should be taken offline.</label>
                    <Button variant="destructive" className="w-full" disabled={!reasonValid || !confirmSuspend || suspend.isPending} onClick={() => suspend.mutate(trimmed)} data-testid="button-confirm-suspend"><Ban className="mr-2 h-4 w-4" />{suspend.isPending ? "Suspending..." : "Suspend app"}</Button>
                  </div>
                )}
              </Block>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
