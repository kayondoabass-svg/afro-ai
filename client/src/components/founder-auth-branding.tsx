import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AUTH_PACKAGES } from "@shared/auth-packages";
import { readableApiError } from "@shared/customer-api-setup";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type FounderBranding = {
  project: { id: string; name: string; slug?: string; owner_user_id?: string };
  entitlement: { plan: string; source: string; expiresAt: string | null; paymentId: number | null };
  settings: Record<string, unknown>;
  domains: { id: number | string; domain: string; status: string }[];
  recentMail: { purpose: string; outcome: string; reason: string | null; message_id: string | null; created_at: string | number }[];
  audit: { actor_id?: string; action: string; metadata?: unknown; created_at: string | number }[];
};

const PLAN_OPTIONS = AUTH_PACKAGES.map((pkg) => ({
  key: pkg.key,
  label: `${pkg.name} · ${pkg.usd === 0 ? "Free" : `$${pkg.usd} / month`}`,
}));

function dateValue(value: string | number) {
  const date = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  return Number.isNaN(date.getTime()) ? "Not reported" : date.toLocaleString();
}

function inputDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function displaySettings(settings: Record<string, unknown>) {
  return Object.entries(settings).filter(([key, value]) =>
    typeof value === "string" && value.trim() && !/html$/i.test(key),
  ) as [string, string][];
}

export function FounderAuthBranding({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [plan, setPlan] = useState("free");
  const [expiresAt, setExpiresAt] = useState("");
  const [noExpiry, setNoExpiry] = useState(false);
  const [reason, setReason] = useState("");
  const initializedForId = useRef("");
  const url = `/api/founder/auth-projects/${encodeURIComponent(projectId)}/branding`;
  const query = useQuery<FounderBranding>({
    queryKey: [url],
    queryFn: async () => (await apiRequest("GET", url)).json(),
    enabled: Boolean(projectId),
    retry: false,
  });

  useEffect(() => {
    if (!query.data || initializedForId.current === projectId) return;
    initializedForId.current = projectId;
    setPlan(query.data.entitlement.plan);
    setExpiresAt(inputDate(query.data.entitlement.expiresAt));
    setNoExpiry(query.data.entitlement.expiresAt === null);
  }, [query.data, projectId]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 5) throw new Error("Add an audit reason of at least 5 characters.");
      if (!noExpiry && !expiresAt) throw new Error("Choose an expiry date or explicitly select no expiry.");
      const timestamp = expiresAt ? new Date(`${expiresAt}T23:59:59.000Z`).getTime() : 0;
      if (!noExpiry && (!Number.isFinite(timestamp) || timestamp <= Date.now())) throw new Error("Expiry must be a future date.");
      const expiry = noExpiry ? null : new Date(timestamp).toISOString();
      return apiRequest("PATCH", `/api/founder/auth-projects/${encodeURIComponent(projectId)}/branding-entitlement`, {
        plan, expiresAt: expiry, reason: reason.trim(),
      });
    },
    onSuccess: () => {
      setReason("");
      void queryClient.invalidateQueries({ queryKey: [url] });
      void queryClient.invalidateQueries({
        predicate: (entry) => String(entry.queryKey[0] || "").startsWith("/api/founder/records/auth-projects?"),
      });
      toast({ title: "Auth package override saved", description: "The audited entitlement applies to this owner's Auth projects." });
    },
    onError: (error) => toast({ title: "Couldn't save the override", description: readableApiError(error, "Check the plan, expiry and audit reason."), variant: "destructive" }),
  });

  if (query.isPending) return <Card aria-label="Loading founder Auth branding">
    <CardHeader><Skeleton className="h-6 w-52" /><Skeleton className="h-4 w-72" /></CardHeader>
    <CardContent className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-48 w-full" /></CardContent>
  </Card>;
  if (query.isError || !query.data) return <Card role="alert">
    <CardHeader><CardTitle className="flex items-center gap-2"><CircleAlert className="h-5 w-5 text-destructive" />Auth branding record unavailable</CardTitle>
      <CardDescription>{readableApiError(query.error, "Founder branding details could not be loaded.")}</CardDescription></CardHeader>
    <CardContent><Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></CardContent>
  </Card>;

  const data = query.data;
  const currentPlanName = PLAN_OPTIONS.find((option) => option.key === data.entitlement.plan)?.label || data.entitlement.plan;
  const safeSettings = displaySettings(data.settings);

  return <Card className="border-amber-600/25" data-testid="founder-auth-branding">
    <CardHeader className="border-b border-border/60">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Founder record · read-only details</Badge><Badge variant="secondary">{data.entitlement.source}</Badge></div>
      <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />{data.project.name} · Auth branding</CardTitle>
      <CardDescription>Record {data.project.id}{data.project.slug ? ` · ${data.project.slug}` : ""}. Do not open a customer dashboard route from this founder view; it may belong to another account.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5 p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Current package</p><p className="mt-1 font-medium">{currentPlanName}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Entitlement source</p><p className="mt-1 font-medium capitalize">{data.entitlement.source}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Expires</p><p className="mt-1 text-sm">{data.entitlement.expiresAt ? dateValue(data.entitlement.expiresAt) : "No expiry"}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Payment ID</p><p className="mt-1 font-mono text-sm">{data.entitlement.paymentId ?? "—"}</p></div>
      </div>

      <Alert className="border-amber-600/30 bg-amber-500/[0.04]">
        <AlertTriangle className="h-4 w-4 text-amber-700" />
        <AlertDescription><strong>Owner-wide override.</strong> This changes the entitlement for every Afro Auth project owned by the same account, not just the record above. It is explicitly audited. Confirm the owner and reason before saving.</AlertDescription>
      </Alert>

      <form className="grid gap-4 rounded-xl border border-amber-600/20 bg-muted/15 p-4 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm(`Apply ${plan} Auth access to all Auth projects owned by this account? This action is audited.`)) return;
        mutation.mutate();
      }}>
        <div className="space-y-2"><Label htmlFor={`founder-auth-plan-${projectId}`}>Override package</Label>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger id={`founder-auth-plan-${projectId}`}><SelectValue /></SelectTrigger>
            <SelectContent>{PLAN_OPTIONS.map((option) => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label htmlFor={`founder-auth-expiry-${projectId}`}>Expiry date (UTC)</Label><Input id={`founder-auth-expiry-${projectId}`} type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} disabled={noExpiry} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={noExpiry} onChange={(event) => setNoExpiry(event.target.checked)} />No expiry</label>
        </div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor={`founder-auth-reason-${projectId}`}>Required audit reason</Label><Textarea id={`founder-auth-reason-${projectId}`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={500} rows={3} placeholder="Document the support or operational reason for this owner-wide access change." /></div>
        <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Access follows the selected package and expires at the chosen date. This does not modify app-builder, Email API or credit plans.</p><Button type="submit" disabled={mutation.isPending || reason.trim().length < 5 || (!noExpiry && !expiresAt)}>{mutation.isPending ? "Saving audited override…" : "Save owner-wide override"}</Button></div>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2" aria-label="Branding settings">
          <h3 className="text-sm font-semibold">Saved branding settings</h3>
          {safeSettings.length ? <dl className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">{safeSettings.map(([key, value]) =>
            <div key={key} className="min-w-0"><dt className="text-xs text-muted-foreground">{key}</dt><dd className="break-all text-sm">{value}</dd></div>,
          )}</dl> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No customer branding values saved.</p>}
        </section>
        <section className="space-y-2" aria-label="Verified sender domains">
          <h3 className="text-sm font-semibold">Owned Email API sender domains</h3>
          {data.domains.length ? <ul className="space-y-2">{data.domains.map((domain) =>
            <li key={domain.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><span className="break-all text-sm">{domain.domain}</span><Badge variant={domain.status === "verified" ? "secondary" : "outline"}>{domain.status}</Badge></li>,
          )}</ul> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No owned sender domains returned.</p>}
          <p className="text-xs text-muted-foreground">A sender address must use an owned, verified Email API domain. Reply-to must match the verified account email or an owned verified sending-domain address.</p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2" aria-label="Recent Auth email activity">
          <h3 className="text-sm font-semibold">Recent Auth email activity</h3>
          {data.recentMail.length ? <ul className="space-y-2">{data.recentMail.map((mail, index) =>
            <li key={`${mail.message_id || mail.created_at}-${index}`} className="rounded-lg border p-3 text-sm"><div className="flex justify-between gap-3"><span className="capitalize">{mail.purpose} · {mail.outcome}</span><time className="shrink-0 text-xs text-muted-foreground">{dateValue(mail.created_at)}</time></div>{mail.reason && <p className="mt-1 text-xs text-muted-foreground">{mail.reason}</p>}{mail.message_id && <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{mail.message_id}</p>}</li>,
          )}</ul> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No mail events returned.</p>}
        </section>
        <section className="space-y-2" aria-label="Branding audit history">
          <h3 className="text-sm font-semibold">Branding audit history</h3>
          {data.audit.length ? <ul className="space-y-2">{data.audit.map((entry, index) =>
            <li key={`${entry.action}-${entry.created_at}-${index}`} className="rounded-lg border p-3 text-sm"><div className="flex justify-between gap-3"><span className="break-all font-medium">{entry.action}</span><time className="shrink-0 text-xs text-muted-foreground">{dateValue(entry.created_at)}</time></div>{entry.actor_id && <p className="mt-1 break-all text-xs text-muted-foreground">Actor {entry.actor_id}</p>}{Boolean(entry.metadata) && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-[11px]">{typeof entry.metadata === "string" ? entry.metadata : JSON.stringify(entry.metadata, null, 2)}</pre>}</li>,
          )}</ul> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No audit entries returned.</p>}
        </section>
      </div>
    </CardContent>
  </Card>;
}
