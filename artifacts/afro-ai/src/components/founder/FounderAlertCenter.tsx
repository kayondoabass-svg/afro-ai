import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BellRing, Check, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AlertSettings = {
  enabled: boolean;
  recipientIds: number[];
  members: { id: number; name: string; email: string }[];
  lastCheckedAt: string | null;
  lastError: string | null;
};
type AlertHistory = {
  rows: {
    alert_id: string;
    title: string;
    severity: "warning" | "error";
    section: string;
    state: string;
    opened_at: string;
    resolved_at: string | null;
    acknowledged_at: string | null;
  }[];
};
type CurrentAlert = { id: string; title: string; severity: "warning" | "error"; section: string };

function timestamp(value: string | null) {
  if (!value) return "Not reported";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not reported" : date.toLocaleString();
}

export function FounderAlertCenter({ isFounder }: { isFounder: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [recipientIds, setRecipientIds] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const overviewQuery = useQuery<{ alerts: CurrentAlert[] }>({ queryKey: ["/api/founder/overview"], enabled: isFounder });
  const settingsQuery = useQuery<AlertSettings>({ queryKey: ["/api/founder/alert-settings"], enabled: isFounder });
  const historyQuery = useQuery<AlertHistory>({ queryKey: ["/api/founder/alert-history"], enabled: isFounder });

  useEffect(() => {
    if (settingsQuery.data) {
      setEnabled(settingsQuery.data.enabled);
      setRecipientIds(settingsQuery.data.recipientIds);
    }
  }, [settingsQuery.data]);

  const refreshFounderData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/founder/alert-settings"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/founder/alert-history"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/founder/overview"] }),
    ]);
  };
  const saveMutation = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/founder/alert-settings", { enabled, recipientIds })).json(),
    onSuccess: async () => {
      setFeedback({ kind: "success", message: "Notification preferences saved." });
      await refreshFounderData();
    },
    onError: (error: Error) => setFeedback({ kind: "error", message: error.message.replace(/^\d{3}:\s*/, "") || "Preferences could not be saved." }),
  });
  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) =>
      (await apiRequest("POST", `/api/founder/alerts/${encodeURIComponent(alertId)}/acknowledge`)).json(),
    onSuccess: async () => {
      setFeedback({ kind: "success", message: "Alert acknowledged." });
      await refreshFounderData();
    },
    onError: (error: Error) => setFeedback({ kind: "error", message: error.message.replace(/^\d{3}:\s*/, "") || "Alert could not be acknowledged." }),
  });

  if (!isFounder) return null;
  const members = settingsQuery.data?.members ?? [];
  const alerts = overviewQuery.data?.alerts ?? [];
  const historyRows = historyQuery.data?.rows ?? [];
  return (
    <section aria-label="Founder alert controls" className="grid items-start gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><BellRing className="h-4 w-4 text-primary" />Alert notifications</CardTitle>
          <CardDescription>Opt in to delivery for operational alerts. Founder delivery is automatic; these choices do not grant dashboard access.</CardDescription>
        </CardHeader>
        <CardContent>
          {settingsQuery.isPending ? <div className="space-y-3" aria-label="Loading notification settings"><div className="h-5 w-2/3 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded bg-muted" /></div>
            : settingsQuery.isError ? <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 p-3"><span className="text-sm">Notification settings unavailable.</span><Button variant="outline" size="sm" onClick={() => settingsQuery.refetch()}>Retry</Button></div>
              : settingsQuery.data ? <>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 focus-within:ring-2 focus-within:ring-ring">
                  <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" aria-label="Enable founder alert notifications" />
                  <span><span className="block text-sm font-medium">Enable notifications</span><span className="mt-0.5 block text-xs text-muted-foreground">The founder remains an automatic recipient when enabled.</span></span>
                </label>
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active team recipients</p>
                  {members.length ? <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                    {members.map(member => <label key={member.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/45 focus-within:ring-2 focus-within:ring-ring">
                      <input type="checkbox" checked={recipientIds.includes(member.id)} onChange={event => setRecipientIds(current => event.target.checked ? current.includes(member.id) ? current : [...current, member.id] : current.filter(id => id !== member.id))} aria-label={`Notify ${member.name}`} className="h-4 w-4 accent-primary" />
                      <span className="min-w-0 flex-1 truncate">{member.name}</span><span className="max-w-[55%] truncate text-xs text-muted-foreground">{member.email}</span>
                    </label>)}
                  </div> : <p className="mt-2 rounded-md bg-muted/35 p-3 text-xs text-muted-foreground">No eligible active team members are available. Founder recipient remains automatic.</p>}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
                  <Button onClick={() => { setFeedback(null); saveMutation.mutate(); }} disabled={saveMutation.isPending}><ShieldCheck className="mr-2 h-4 w-4" />{saveMutation.isPending ? "Saving…" : "Save preferences"}</Button>
                  <span className="text-xs text-muted-foreground">Last checked {timestamp(settingsQuery.data.lastCheckedAt)}</span>
                </div>
                {settingsQuery.data.lastError && <p role="status" className="mt-3 rounded-md border border-amber-600/20 bg-amber-500/5 p-2.5 text-xs text-amber-900 dark:text-amber-200">Latest delivery check: {settingsQuery.data.lastError}</p>}
              </> : <p className="text-sm text-muted-foreground">Settings have not been reported.</p>}
          {feedback && <p role={feedback.kind === "error" ? "alert" : "status"} className={`mt-3 text-sm ${feedback.kind === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>{feedback.message}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div><CardTitle className="text-base">Alert history</CardTitle><CardDescription>Alerts remain recorded whether email notifications are enabled or not.</CardDescription></div>
            <Button variant="outline" size="sm" aria-label="Refresh alert history" onClick={() => { void settingsQuery.refetch(); void historyQuery.refetch(); }} disabled={settingsQuery.isFetching || historyQuery.isFetching}><RefreshCw className={`h-4 w-4 ${historyQuery.isFetching ? "animate-spin" : ""}`} /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {historyQuery.isPending ? <div className="space-y-2" aria-label="Loading alert history">{[0, 1, 2].map(key => <div key={key} className="h-12 animate-pulse rounded bg-muted/40" />)}</div>
            : historyQuery.isError ? <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 p-3"><span className="text-sm">Alert history unavailable.</span><Button variant="outline" size="sm" onClick={() => historyQuery.refetch()}>Retry</Button></div>
              : historyRows.length ? <div className="max-h-[420px] divide-y divide-border/60 overflow-y-auto">
                {historyRows.map(row => {
                  const current = alerts.find(alert => alert.id === row.alert_id);
                  const canAcknowledge = Boolean(current && !row.acknowledged_at);
                  return <div key={row.alert_id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-start">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${row.severity === "error" ? "bg-destructive" : "bg-amber-600"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{row.title}</p><Badge variant={row.severity === "error" ? "destructive" : "secondary"}>{row.severity}</Badge><Badge variant="outline">{row.state}</Badge></div>
                      <p className="mt-1 text-xs text-muted-foreground">{row.section} · opened {timestamp(row.opened_at)}</p>
                      {row.resolved_at && <p className="mt-1 text-xs text-muted-foreground">Resolved {timestamp(row.resolved_at)}</p>}
                      {row.acknowledged_at && <p className="mt-1 text-xs text-muted-foreground">Acknowledged {timestamp(row.acknowledged_at)}</p>}
                    </div>
                    {canAcknowledge && <Button variant="outline" size="sm" onClick={() => { setFeedback(null); acknowledgeMutation.mutate(row.alert_id); }} disabled={acknowledgeMutation.isPending}><Check className="mr-1.5 h-3.5 w-3.5" />Acknowledge</Button>}
                  </div>;
                })}
              </div> : <div className="rounded-lg border border-dashed p-5 text-center"><CircleAlert className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No alert history yet</p><p className="mt-1 text-xs text-muted-foreground">New operational alerts will appear here, including when notifications are off.</p></div>}
        </CardContent>
      </Card>
    </section>
  );
}
