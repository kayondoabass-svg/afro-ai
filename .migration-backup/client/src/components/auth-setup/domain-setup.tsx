import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { normalizeSendingDomain, readableApiError } from "@shared/customer-api-setup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check, CircleAlert, Globe2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

export interface AuthDomain {
  id: string;
  domain: string;
  status: "pending" | "verified";
  created_at: number;
  verified_at: number | null;
  last_checked_at: number | null;
  verification: { type: "TXT"; name: string; value: string; ttl: number };
}

interface DomainResponse { domains: AuthDomain[] }

export function DomainSetup({ tenantId }: { tenantId: string }) {
  const path = `/cf-auth/v1/admin/tenants/${tenantId}/domains`;
  const [domainInput, setDomainInput] = useState("");
  const [formError, setFormError] = useState("");
  const [feedback, setFeedback] = useState("");
  const { data, isLoading, error, refetch, isFetching } = useQuery<DomainResponse>({
    queryKey: [path],
    enabled: !!tenantId,
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [path] });
    queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants", tenantId] });
  };
  const addDomain = useMutation({
    mutationFn: async (domain: string) => (await apiRequest("POST", path, { domain })).json() as Promise<AuthDomain>,
    onSuccess: () => { setDomainInput(""); setFormError(""); setFeedback("Domain added. Publish the TXT record below, then check DNS."); invalidate(); },
    onError: (e) => setFormError(readableApiError(e, "Could not add this domain. Check the hostname and try again.")),
  });
  const verify = useMutation({
    mutationFn: async (domainId: string) => (await apiRequest("POST", `${path}/${encodeURIComponent(domainId)}/verify`)).json() as Promise<{ verified: boolean; domain: AuthDomain; message: string }>,
    onSuccess: (result) => { setFeedback(result.message || (result.verified ? "DNS ownership verified." : "The TXT record has not propagated yet.")); invalidate(); },
    onError: (e) => setFeedback(readableApiError(e, "DNS verification is temporarily unavailable. Try again shortly.")),
  });
  const remove = useMutation({
    mutationFn: async (domainId: string) => apiRequest("DELETE", `${path}/${encodeURIComponent(domainId)}`),
    onSuccess: () => { setFeedback("Domain proof removed. This project's matching origins are no longer authorized."); invalidate(); },
    onError: (e) => setFeedback(readableApiError(e, "Could not remove this domain.")),
  });
  const domains = data?.domains ?? [];
  const verifiedCount = domains.filter((d) => d.status === "verified").length;

  return <section className="space-y-4" aria-labelledby="domain-setup-title">
    <Card className="overflow-hidden">
      <div className="h-1 bg-primary" />
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-primary/10 p-2 text-primary"><Globe2 className="h-5 w-5" /></span>
          <div>
            <CardTitle id="domain-setup-title">1. Prove you own your website</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">Add the website hostname and publish the TXT record at your DNS provider. This proof authorizes website origins for this project; it is not email-sending DNS.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => {
          event.preventDefault();
          try {
            const domain = normalizeSendingDomain(domainInput);
            addDomain.mutate(domain);
          } catch (error) {
            setFormError(readableApiError(error, "Enter a bare website hostname, such as app.example.com. Do not include https://, a path, or an email address.").replace(/sending domain/gi, "website domain"));
          }
        }}>
          <Input aria-label="Website domain" aria-invalid={!!formError} value={domainInput} onChange={(e) => { setDomainInput(e.target.value); setFormError(""); }} placeholder="app.example.com" className="sm:max-w-md" />
          <Button type="submit" disabled={!domainInput.trim() || addDomain.isPending}><Plus className="mr-2 h-4 w-4" />{addDomain.isPending ? "Adding…" : "Add website"}</Button>
        </form>
        {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
        {feedback && <Alert variant={verify.isError || remove.isError ? "destructive" : "default"} role="status"><AlertDescription>{feedback}</AlertDescription></Alert>}
        <div className="flex items-center justify-between border-t pt-4 text-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span><strong>{verifiedCount}</strong> verified {verifiedCount === 1 ? "domain" : "domains"}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
        {isLoading ? <div className="space-y-3" aria-label="Loading domains"><div className="h-20 animate-pulse rounded-lg bg-muted" /><div className="h-20 animate-pulse rounded-lg bg-muted" /></div>
          : error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium"><CircleAlert className="h-4 w-4" />Couldn't load your domains</p><p className="mt-1 text-muted-foreground">{readableApiError(error, "Try again to load domain status.")}</p><Button className="mt-3" variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
          </div>
          : domains.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center">
            <Globe2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="font-medium">No website domain added</p><p className="mt-1 text-sm text-muted-foreground">Add one above to generate its ownership TXT proof.</p>
          </div>
          : <div className="space-y-3">{domains.map((item) => <article key={item.id} className="rounded-xl border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2"><span className="truncate font-medium">{item.domain}</span>
                {item.status === "verified" ? <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" />Verified</Badge> : <Badge variant="outline">Pending DNS</Badge>}
              </div>
              <div className="flex gap-2">
                {item.status !== "verified" && <Button size="sm" variant="outline" onClick={() => verify.mutate(item.id)} disabled={verify.isPending}><RefreshCw className={`mr-2 h-4 w-4 ${verify.isPending ? "animate-spin" : ""}`} />Check DNS</Button>}
                <Button size="icon" variant="ghost" aria-label={`Remove ${item.domain}`} title="Remove domain" disabled={remove.isPending} onClick={() => {
                  if (window.confirm(`Remove ${item.domain} from this project? This removes only this project's ownership proof and matching allowed origins. Website sign-in calls from this domain will stop working.`)) remove.mutate(item.id);
                }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            {item.status === "pending" && <div className="mt-4 grid gap-3 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-[90px_1fr]">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Record type</p><code>{item.verification.type}</code></div>
              <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name / host</p><code className="break-all">{item.verification.name}</code></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">TTL</p><code>{item.verification.ttl}</code></div>
              <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">TXT value</p><code className="break-all">{item.verification.value}</code></div>
              <p className="sm:col-span-2 text-xs text-muted-foreground">Add this TXT record with your DNS provider. DNS propagation can take time; check again after it has propagated. A pending result is not a verification.</p>
            </div>}
            {item.status === "verified" && item.verified_at && <p className="mt-2 text-xs text-muted-foreground">Ownership confirmed {new Date(item.verified_at * 1000).toLocaleString()}</p>}
          </article>)}</div>}
        <p className="text-xs text-muted-foreground">Email confirmation is separate: Afro Auth sends signup confirmation links from the platform sender. You do not need to buy or verify an email-sending domain for your users to confirm their accounts.</p>
      </CardContent>
    </Card>
  </section>;
}
