import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Check, CircleAlert, Clipboard, Globe2, Loader2, MessageSquareText, RefreshCw,
  ScanLine, ShieldCheck, ShieldEllipsis, Trash2,
} from "lucide-react";
import type {
  ChatbotDomain, ChatbotInstallationResult, ChatbotVerification,
} from "@shared/chatbot-verification";

const testPrompt = "Hello, what can you help me with?";
const queryKey = (id: number) => [`/api/chatbots/${id}/verification`];

function apiError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  const match = message.match(/:\s*(\{[\s\S]*\})$/);
  if (match) {
    try {
      const body = JSON.parse(match[1]);
      if (typeof body.message === "string") return body.message;
    } catch { /* use readable fallback */ }
  }
  return message.replace(/^\d+:\s*/, "") || fallback;
}

function timeLabel(value: string | null) {
  if (!value) return "Not checked yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ChatbotVerificationPanel({ chatbotId }: { chatbotId: number }) {
  const [hostname, setHostname] = useState("");
  const [feedback, setFeedback] = useState("");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const path = `/api/chatbots/${chatbotId}`;
  const query = useQuery<ChatbotVerification>({
    queryKey: queryKey(chatbotId),
    enabled: !!chatbotId,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKey(chatbotId) });
  const addDomain = useMutation({
    mutationFn: async (value: string) => (await apiRequest("POST", `${path}/domains`, { hostname: value })).json() as Promise<ChatbotDomain>,
    onSuccess: () => { setHostname(""); setFeedback("Website added. Publish the TXT record, then check DNS."); refresh(); },
    onError: (error) => setFeedback(apiError(error, "Could not add this website. Check the hostname and try again.")),
  });
  const checkDomain = useMutation({
    mutationFn: async (domainId: string) => (await apiRequest("POST", `${path}/domains/${encodeURIComponent(domainId)}/check`)).json() as Promise<{ verified: boolean; message: string }>,
    onSuccess: (result) => { setFeedback(result.message || (result.verified ? "Ownership verified." : "TXT record not found yet.")); refresh(); },
    onError: (error) => setFeedback(apiError(error, "DNS check could not be completed. Try again.")),
  });
  const removeDomain = useMutation({
    mutationFn: (domainId: string) => apiRequest("DELETE", `${path}/domains/${encodeURIComponent(domainId)}`),
    onSuccess: () => { setFeedback("Ownership proof removed."); refresh(); },
    onError: (error) => setFeedback(apiError(error, "Could not remove this website proof.")),
  });
  const installation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `${path}/verify`, {})).json() as Promise<ChatbotInstallationResult>,
    onSuccess: (result) => { setFeedback(result.message || (result.verified ? "Installation found." : "Installation was not detected.")); refresh(); },
    onError: (error) => setFeedback(apiError(error, "Installation check could not be completed. Try again.")),
  });
  const visitorTest = useMutation({
    mutationFn: async () => (await apiRequest("POST", `${path}/verification/test`, { consent: true, message: testPrompt })).json() as Promise<{ reply: string; testHistorySaved: boolean }>,
    onSuccess: (result) => {
      const persistenceNote = result.testHistorySaved
        ? " Verification status was saved."
        : " Reply received, but verification status could not be saved. Do not retry automatically; check the saved status later.";
      setFeedback(result.reply ? `Test reply: ${result.reply}${persistenceNote}` : `Test reply received.${persistenceNote}`);
      refresh();
    },
    onError: (error) => setFeedback(apiError(error, "Visitor test could not be completed.")),
  });
  const enforce = useMutation({
    mutationFn: () => apiRequest("POST", `${path}/verification/enforce`),
    onSuccess: () => { setFeedback("Approved-origin enforcement is now enabled."); refresh(); },
    onError: (error) => setFeedback(apiError(error, "Could not enable approved-origin enforcement.")),
  });

  const data = query.data;
  const currentWebsiteVerified = !!data?.websiteHostname && data.domains.some((domain) =>
    domain.hostname.toLowerCase() === data.websiteHostname?.toLowerCase() && domain.status === "verified");
  const chatbotDisabled = data?.statusLabel.trim().toLowerCase() === "disabled";
  const pending = addDomain.isPending || checkDomain.isPending || removeDomain.isPending || installation.isPending || visitorTest.isPending || enforce.isPending;

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(id);
      window.setTimeout(() => setCopyStatus((current) => current === id ? null : current), 1800);
    } catch {
      setFeedback("Clipboard access is unavailable. Select and copy the record manually.");
    }
  };
  const copyButton = (text: string, id: string, label: string) => (
    <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 gap-1.5 px-2 text-xs"
      onClick={() => void copy(text, id)} aria-label={`Copy ${label}`}>
      {copyStatus === id ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
      {copyStatus === id ? "Copied" : "Copy"}
    </Button>
  );
  const ownershipStatus = currentWebsiteVerified ? "Current website verified" : "Current website not verified";
  const installStatus = data?.installation ? (data.installation.verified ? "Installation found" : "Installation not found") : "Not checked";
  const replyStatus = data?.visitorTest ? (data.visitorTest.succeeded ? "Reply succeeded" : "Reply failed") : "Not tested";

  return (
    <section className="space-y-4" aria-labelledby="chatbot-verification-title" data-testid="chatbot-verification-panel">
      <Card className="overflow-hidden">
        <div className="h-1 bg-primary" />
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></span>
              <div className="min-w-0">
                <CardTitle id="chatbot-verification-title" className="text-base">Website verification</CardTitle>
                <CardDescription className="mt-1">Prove ownership, confirm the widget is installed, then try one visitor reply.</CardDescription>
              </div>
            </div>
            <Badge variant={data?.enforcement === "required" ? "default" : "outline"} className="shrink-0">
              {data?.enforcement === "required" ? "Approved origins required" : "Legacy · supported"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {feedback && <Alert variant={addDomain.isError || checkDomain.isError || removeDomain.isError || installation.isError || visitorTest.isError || enforce.isError ? "destructive" : "default"} role="status">
            <AlertDescription>{feedback}</AlertDescription>
          </Alert>}
          {query.isLoading ? <div aria-label="Loading verification" className="space-y-3">
            <div className="h-20 animate-pulse rounded-lg bg-muted" /><div className="h-12 animate-pulse rounded-lg bg-muted" />
          </div> : query.isError ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="flex items-center gap-2 text-sm font-medium"><CircleAlert className="h-4 w-4" />Verification details unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{apiError(query.error, "Try loading this panel again.")}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => query.refetch()}>Try again</Button>
          </div> : data && <>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { label: "Ownership", value: ownershipStatus, icon: ShieldCheck, ok: data.domains.some((d) => d.status === "verified") },
                { label: "Widget install", value: installStatus, icon: ScanLine, ok: !!data.installation?.verified },
                { label: "Visitor reply", value: replyStatus, icon: MessageSquareText, ok: !!data.visitorTest?.succeeded },
              ].map(({ label, value, icon: Icon, ok }) => <div key={label} className="min-w-0 rounded-lg border bg-muted/25 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</p>
                <p className={`mt-1 break-words text-sm font-medium ${ok ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{value}</p>
              </div>)}
            </div>
            <div className="space-y-3 border-t pt-4">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Globe2 className="h-4 w-4 text-primary" />Website ownership</h3>
                <p className="mt-1 text-xs text-muted-foreground">Add an exact hostname and publish its TXT record in your DNS provider. This proof is scoped to this chatbot.</p>
              </div>
              {data.websiteHostname && <p className="text-xs">Current website: <strong className="break-all">{data.websiteHostname}</strong></p>}
              <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => {
                event.preventDefault();
                const normalized = hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
                if (!normalized || normalized.includes("/") || normalized.includes(":") || /\s/.test(normalized)) {
                  setFeedback("Enter a bare hostname, such as support.example.org.");
                  return;
                }
                setFeedback("");
                addDomain.mutate(normalized);
              }}>
                <Input aria-label="Website hostname" placeholder="support.example.org" value={hostname} onChange={(event) => setHostname(event.target.value)} className="min-w-0 sm:max-w-md" />
                <Button type="submit" disabled={!hostname.trim() || pending}><Globe2 className="mr-2 h-4 w-4" />Add website</Button>
              </form>
              {data.domains.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No website proof yet. Add a hostname to generate its ownership record.</div> :
                <div className="space-y-3">{data.domains.map((domain) => <DomainItem key={domain.id} domain={domain} disabled={pending}
                  copyButton={copyButton} onCheck={() => checkDomain.mutate(domain.id)} onRemove={() => {
                    if (window.confirm(`Remove proof for ${domain.hostname}? An approved installation on this hostname may stop working.`)) removeDomain.mutate(domain.id);
                  }} />)}</div>}
              {data.enforcement === "legacy" && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-start gap-2">
                  <ShieldEllipsis className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Legacy mode stays available</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">This existing chatbot remains supported as-is. Turning on approved-origin enforcement can block embeds from unapproved websites.</p>
                    <Button size="sm" variant="outline" className="mt-3" disabled={!currentWebsiteVerified || pending}
                      onClick={() => {
                        if (window.confirm("Enable approved-origin enforcement? Embeds from websites without verified ownership may stop working.")) enforce.mutate();
                      }}>
                      {enforce.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      Enable enforcement
                    </Button>
                    {!currentWebsiteVerified && <p className="mt-2 text-xs text-muted-foreground">Verify the exact current website hostname first.</p>}
                  </div>
                </div>
              </div>}
            </div>
            <div className="grid gap-3 border-t pt-4 lg:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><ScanLine className="h-4 w-4 text-primary" />Widget installation</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Check the configured website for the installed embed. This does not test a reply.</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={pending || !data.websiteHostname} onClick={() => installation.mutate()}>
                    {installation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Check install
                  </Button>
                </div>
                {data.installation && <div className={`mt-3 rounded-md p-3 text-xs ${data.installation.verified ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                  <p className="font-medium">{data.installation.message}</p>
                  {data.installation.code && <p className="mt-1">Result code: <code>{data.installation.code}</code></p>}
                  {data.installation.url && <p className="mt-1 break-all">Checked URL: {data.installation.url}</p>}
                  <p className="mt-1">Last checked: {timeLabel(data.installation.checkedAt)}</p>
                </div>}
                {!data.installation && <p className="mt-3 text-xs text-muted-foreground">No saved installation result.</p>}
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="h-4 w-4 text-primary" />One visitor reply</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Sends one real message through the existing visitor reply pipeline and uses your existing allowance. This is not a browser-rendering check. Nothing runs automatically.</p>
                  </div>
                  <Button size="sm" disabled={pending || chatbotDisabled} onClick={() => {
                    if (window.confirm("Send one real chatbot reply to the test message? This uses your existing reply allowance.")) visitorTest.mutate();
                  }}>
                    {visitorTest.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquareText className="mr-2 h-4 w-4" />}Send one test
                  </Button>
                </div>
                {chatbotDisabled && <p className="mt-2 text-xs text-muted-foreground">Enable this chatbot before testing a visitor reply.</p>}
                {data.visitorTest && <p className="mt-3 text-xs text-muted-foreground">Last test: {data.visitorTest.succeeded ? "Reply succeeded" : "Reply failed"} · {timeLabel(data.visitorTest.checkedAt)}</p>}
              </div>
            </div>
            <div className="flex justify-end border-t pt-3">
              <Button variant="ghost" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh status</Button>
            </div>
          </>}
        </CardContent>
      </Card>
    </section>
  );
}

function DomainItem({ domain, disabled, copyButton, onCheck, onRemove }: {
  domain: ChatbotDomain;
  disabled: boolean;
  copyButton: (text: string, id: string, label: string) => JSX.Element;
  onCheck: () => void;
  onRemove: () => void;
}) {
  return <article className="rounded-lg border bg-background p-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all text-sm font-medium">{domain.hostname}</span>
          <Badge variant={domain.status === "verified" ? "secondary" : "outline"} className="gap-1">
            {domain.status === "verified" ? <><Check className="h-3 w-3" />Verified</> : "Pending DNS"}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Last DNS check: {timeLabel(domain.lastCheckedAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onCheck} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />Check DNS
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${domain.hostname}`} disabled={disabled} onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
    {domain.status === "pending" && <div className="mt-3 rounded-md bg-muted/50 p-3">
      <p className="mb-2 text-xs font-medium">Publish this DNS TXT record</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Record type", domain.verification.type, "type"],
          ["Host / name", domain.verification.name, "name"],
          ["TTL", String(domain.verification.ttl), "ttl"],
          ["TXT value", domain.verification.value, "value"],
        ].map(([label, value, key]) => <div key={key} className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <div className="mt-1 flex min-w-0 items-start gap-2">
            <code className="min-w-0 flex-1 break-all text-xs">{value}</code>
            {copyButton(value, `${domain.id}-${key}`, label.toLowerCase())}
          </div>
        </div>)}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">DNS changes can take time to propagate. A pending result is not verification.</p>
    </div>}
    {domain.status === "verified" && <p className="mt-2 text-xs text-muted-foreground">Ownership confirmed: {timeLabel(domain.verifiedAt)}</p>}
  </article>;
}
