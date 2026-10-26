import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { readableApiError } from "@shared/customer-api-setup";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CircleAlert, MailCheck, RefreshCw } from "lucide-react";

type MailStatus = "available" | "invalid_credential" | "limited" | "unavailable" | "unconfigured";
type MailOutcome = "pending" | "accepted" | "rejected" | "unknown" | "delivered" | "bounced" | "complained" | "delivery_delayed";
interface MailEvent {
  id: string | number;
  user_id: string;
  purpose: "verify" | "reset";
  outcome: MailOutcome;
  reason: string | null;
  message_id: string | null;
  created_at: number;
  updated_at: number;
}
interface MailDiagnosticsResponse {
  health: { status: MailStatus; checkedAt: number; message: string };
  events: MailEvent[];
}

const healthLabels: Record<MailStatus, string> = {
  available: "Available",
  invalid_credential: "Credential issue",
  limited: "Limited",
  unavailable: "Unavailable",
  unconfigured: "Not configured",
};

function formatTime(timestamp: number) {
  const milliseconds = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toLocaleString() : "Time unavailable";
}

export function MailDiagnostics({ tenantId, active }: { tenantId: string; active: boolean }) {
  const path = `/cf-auth/v1/admin/tenants/${encodeURIComponent(tenantId)}/mail-status`;
  const queryKey = [path];
  const { data, isLoading, error, refetch } = useQuery<MailDiagnosticsResponse>({
    queryKey,
    queryFn: async () => (await apiRequest("GET", path)).json() as Promise<MailDiagnosticsResponse>,
    enabled: !!tenantId && active,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: async () => (await apiRequest("POST", `${path}/refresh`)).json() as Promise<MailDiagnosticsResponse>,
    onSuccess: (response) => queryClient.setQueryData(queryKey, response),
    onError: () => undefined,
  });

  return <Card className="mb-4 transition-colors">
    <CardHeader>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <CardTitle className="flex items-center gap-2"><MailCheck className="h-5 w-5 text-primary" />Email delivery diagnostics</CardTitle>
          <CardDescription className="mt-1">Owner-only sender health and recorded outcomes for verification and password recovery messages.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending || !data} aria-describedby="mail-refresh-help">
          <RefreshCw className={`mr-2 h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} />
          {refresh.isPending ? "Checking delivery…" : "Refresh delivery status"}
        </Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <p id="mail-refresh-help" className="text-xs text-muted-foreground">Refresh checks up to 10 previously accepted messages. It does not send email. Sender health is cached for up to 5 minutes.</p>
      {refresh.error && <Alert role="alert" variant="destructive"><CircleAlert className="h-4 w-4" /><AlertDescription>
        {readableApiError(refresh.error, "Delivery status could not be refreshed.")} <Button variant="outline" size="sm" className="ml-2 h-7" onClick={() => refresh.mutate()}>Try again</Button>
      </AlertDescription></Alert>}
      {isLoading ? <div className="space-y-3" aria-label="Loading email diagnostics">{[1, 2].map((row) => <div key={row} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
        : error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert">
          <p className="flex items-center gap-2 font-medium"><CircleAlert className="h-4 w-4" />Diagnostics unavailable</p>
          <p className="mt-1 text-muted-foreground">{readableApiError(error, "Email diagnostics could not be loaded.")}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
        : data && <>
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">Sender health</span><Badge variant={data.health.status === "available" ? "secondary" : "outline"}>{healthLabels[data.health.status]}</Badge></div>
            <p className="text-xs text-muted-foreground">Checked {formatTime(data.health.checkedAt)}</p>
            <p className="basis-full text-sm text-muted-foreground sm:basis-auto">{data.health.message}</p>
          </div>
          <p className="text-xs text-muted-foreground">Available means the sender service reports healthy; it never proves a message was delivered or that a recipient mailbox exists.</p>
          {data.events.length === 0 ? <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <MailCheck className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="font-medium">No recorded email events</p>
            <p className="mt-1 text-sm text-muted-foreground">No verification or password-recovery events are available for this project.</p>
          </div> : <div className="space-y-2">
            <h3 className="text-sm font-semibold">Recent delivery records</h3>
            <div className="divide-y rounded-lg border">
              {data.events.map((event) => <div key={event.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between" data-testid={`mail-event-${event.id}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{event.purpose === "verify" ? "Email verification" : "Password recovery"}</Badge>
                    <Badge variant={event.outcome === "delivered" ? "secondary" : "outline"}>{event.outcome.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-2 break-all text-xs text-muted-foreground">User ID: {event.user_id}{event.message_id ? ` · Message: ${event.message_id}` : ""}</p>
                  {event.reason && <p className="mt-1 text-sm text-muted-foreground">{event.reason}</p>}
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">Updated {formatTime(event.updated_at)}</div>
              </div>)}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">Accepted means the sending provider accepted a request, not that it reached an inbox. Delivered is a provider delivery event, not proof that the address belongs to the customer or that they can access the mailbox. Mailbox verification occurs only when the customer completes the email confirmation link.</p>
          </div>}
        </>}
    </CardContent>
  </Card>;
}
