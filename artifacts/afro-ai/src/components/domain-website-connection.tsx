import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import type { DomainManagerDetails, ManagedDomain } from "./domain-manager";

interface PublishedApp {
  id: number;
  title: string;
  subdomain: string;
  customDomain: string | null;
  customDomainVerified: boolean;
}
type Connection = { appId: number; hostname: string; verified: boolean };
type Operation = { kind: "connect"; appId: number; hostname: string } | { kind: "verify"; appId: number; hostname: string };
const APPS = "/api/published-apps";
const gold = "bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-semibold";
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Please try again.";

export default function DomainWebsiteConnection({ domain, website }: {
  domain: ManagedDomain;
  website: DomainManagerDetails["website"];
}) {
  const client = useQueryClient();
  const allowed = domain.source === "external" ? domain.status === "verified" : domain.status === "active";
  const [appId, setAppId] = useState<number | null>(null);
  const [hostnameChoice, setHostnameChoice] = useState<"www" | "exact" | null>(null);
  const [saved, setSaved] = useState<Connection | null>(null);
  const [replacement, setReplacement] = useState<{ operation: Operation; previous: string; appName: string } | null>(null);
  const [notice, setNotice] = useState<{ message: string; verified: boolean } | null>(null);
  const apps = useQuery<PublishedApp[]>({
    queryKey: [APPS],
    enabled: allowed,
    queryFn: async () => {
      const result = await (await apiRequest("GET", APPS)).json();
      if (!Array.isArray(result) || !result.every(app => app && Number.isInteger(app.id) &&
        typeof app.subdomain === "string")) throw new Error("Published apps are unavailable.");
      return result;
    },
  });
  const appList = apps.data ?? [];
  const wwwHostname = domain.domainName.startsWith("www.") ? domain.domainName : `www.${domain.domainName}`;
  const belongsHere = (hostname: string | null) => !!hostname && (hostname === domain.domainName || hostname === wwwHostname);
  const existing = appList.find(app => belongsHere(app.customDomain));
  const selected = appList.find(app => app.id === appId) ?? existing ?? appList[0];
  const choice = hostnameChoice ?? (domain.domainName.startsWith("www.") || selected?.customDomain === domain.domainName ? "exact" : "www");
  const hostname = choice === "www" ? wwwHostname : domain.domainName;
  const connection = saved?.appId === selected?.id ? saved : selected && belongsHere(selected.customDomain) ?
    { appId: selected.id, hostname: selected.customDomain!, verified: selected.customDomainVerified === true } : null;
  const mutation = useMutation({
    mutationFn: async (operation: Operation) => {
      const result = await (await apiRequest("POST", `${APPS}/${operation.appId}/${operation.kind === "connect" ? "connect-domain" : "verify-domain"}`,
        operation.kind === "connect" ? { domain: operation.hostname } : {})).json();
      if (operation.kind === "connect" && (result?.success !== true || typeof result.domain !== "string")) {
        throw new Error(result?.message || "The domain connection could not be saved.");
      }
      if (operation.kind === "verify" && typeof result?.verified !== "boolean") throw new Error("Verification result unavailable. Try again.");
      return result as { domain?: string; message?: string; verified?: boolean };
    },
    onSuccess: (result, operation) => {
      const next = {
        appId: operation.appId,
        hostname: operation.kind === "connect" ? result.domain! : operation.hostname,
        verified: operation.kind === "verify" && result.verified === true,
      };
      setSaved(next);
      setReplacement(null);
      setNotice({
        verified: next.verified,
        message: operation.kind === "connect" ? "Connection saved. Configure DNS below, then verify the website connection." :
          next.verified ? "Website domain verified by the server." : result.message || "DNS has not verified yet. Check the record and try again after propagation.",
      });
      client.setQueryData<PublishedApp[]>([APPS], old => old?.map(app => app.id === operation.appId ?
        { ...app, customDomain: next.hostname, customDomainVerified: next.verified } : app));
      // Preserve the saved hostname locally: the manager's website lookup is exact-domain only,
      // while a user may deliberately connect www instead of the apex.
      void client.invalidateQueries({ queryKey: [`/api/domain-manager/${encodeURIComponent(domain.id)}`], exact: true });
    },
  });
  const connect = () => {
    if (!selected || !allowed) return;
    mutation.reset(); setNotice(null);
    const operation: Operation = { kind: "connect", appId: selected.id, hostname };
    const current = saved?.appId === selected.id ? saved.hostname : selected.customDomain;
    if (current && current !== hostname) setReplacement({ operation, previous: current, appName: selected.title || selected.subdomain });
    else mutation.mutate(operation);
  };
  return <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-4">
    <div><h4 className="font-semibold">Website connection</h4><p className="mt-2 text-sm text-muted-foreground">Choose one of your published apps, save the hostname, then configure DNS and verify it here. Saving alone does not connect a live website.</p></div>
    {website && !saved && <dl className="space-y-2 text-sm">
      <div><dt className="text-xs text-muted-foreground">Project</dt><dd>{website.appName}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Domain connection</dt><dd>{website.verified ? "Verified" : "Not verified"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Existing DNS target</dt><dd className="font-mono text-xs break-all">{website.dnsTarget}</dd></div>
    </dl>}
    {!allowed ? <p className="text-sm text-yellow-200/80">{domain.source === "external" ? "Verify domain ownership above before connecting a published app." : "Your Afro AI registration must be active before you can connect a website."}</p> :
      apps.isLoading ? <div aria-label="Loading published apps" className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /></div> :
      apps.isError ? <div role="alert" className="text-sm space-y-3"><p className="text-red-300">{errorMessage(apps.error)}</p><Button variant="outline" onClick={() => { void apps.refetch(); }}>Retry published apps</Button></div> :
      !selected ? <div className="rounded-lg border border-dashed border-yellow-500/25 p-4">
        <h5 className="font-medium text-sm">Publish your first app</h5><p className="text-sm text-muted-foreground mt-1">Build an app in the workspace and publish it. It will then appear here for domain connection.</p>
        <Button asChild className={`${gold} mt-3`}><a href="/chat">Build and publish an app</a></Button>
      </div> : <div className="space-y-4">
        <div><Label htmlFor={`website-app-${domain.id}`}>Published app</Label>
          <select id={`website-app-${domain.id}`} className="w-full mt-1 rounded-md border border-white/10 bg-white/5 p-2 text-sm" value={selected.id} disabled={mutation.isPending} onChange={e => {
            setAppId(Number(e.target.value)); setHostnameChoice(null); setNotice(null); mutation.reset();
          }}>
            {appList.map(app => <option key={app.id} value={app.id} className="bg-zinc-900">{app.title || app.subdomain} · {app.subdomain}.afroaigroup.com</option>)}
          </select>
          {selected.customDomain && <p className="mt-2 text-xs text-muted-foreground">App's current custom domain: <span className="font-mono break-all">{selected.customDomain}</span></p>}
        </div>
        <div><Label htmlFor={`website-hostname-${domain.id}`}>Website hostname</Label>
          <select id={`website-hostname-${domain.id}`} className="w-full mt-1 rounded-md border border-white/10 bg-white/5 p-2 text-sm" value={choice} disabled={mutation.isPending} onChange={e => setHostnameChoice(e.target.value as "www" | "exact")}>
            {!domain.domainName.startsWith("www.") && <option value="www" className="bg-zinc-900">{wwwHostname} — recommended for CNAME</option>}
            <option value="exact" className="bg-zinc-900">{domain.domainName} — exact hostname</option>
          </select>
        </div>
        <Button className={gold} disabled={mutation.isPending || connection?.hostname === hostname} onClick={connect}>{mutation.isPending && mutation.variables?.kind === "connect" ? "Saving connection…" : "Save website connection"}</Button>
        {connection && <div className="border border-yellow-500/25 bg-yellow-500/5 rounded-lg p-4 space-y-3">
          <p className="text-sm">Saved hostname: <strong className="font-mono break-all">{connection.hostname}</strong></p>
          <p className="text-sm">{connection.verified ? "Website DNS verified by server" : "Website DNS not verified"}</p>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>In your {domain.source === "external" ? "registrar or DNS provider" : "authoritative DNS provider"} settings, use the following target. Nameserver changes alone will not connect this website.</p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded bg-white/5 p-3 text-xs">
              <dt>Hostname</dt><dd className="font-mono break-all">{connection.hostname === wwwHostname && connection.hostname !== domain.domainName ? "www" : connection.hostname}</dd>
              <dt>Target</dt><dd className="font-mono">afroaigroup.com</dd>
            </dl>
            <p>For www or another subdomain, add a <strong className="text-foreground">CNAME → afroaigroup.com</strong>. If this hostname is the apex (root domain), use your provider's ALIAS/ANAME or CNAME flattening only if supported; standard apex CNAME records are not supported by many providers.</p>
            <p>Use the www option if your provider cannot flatten the apex. Do not invent an A-record IP address. DNS changes can take up to 24 hours to appear; apex flattening may not pass the current CNAME-based verification.</p>
          </div>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => {
            mutation.reset(); setNotice(null); mutation.mutate({ kind: "verify", appId: connection.appId, hostname: connection.hostname });
          }}>{mutation.isPending && mutation.variables?.kind === "verify" ? "Checking website DNS…" : "Verify website connection"}</Button>
        </div>}
      </div>}
    {notice && <p role="status" className={`rounded-lg border p-3 text-sm ${notice.verified ? "border-green-400/30 text-green-300" : "border-yellow-500/25 text-yellow-200/80"}`}>{notice.message}</p>}
    {mutation.isError && !replacement && <p role="alert" className="text-sm text-red-300 break-words">{errorMessage(mutation.error)}</p>}
    <Dialog open={replacement !== null} onOpenChange={open => { if (!open && !mutation.isPending) setReplacement(null); }}>
      <DialogContent className="bg-zinc-900 border-yellow-500/25">
        <DialogHeader><DialogTitle>Replace this app's custom domain?</DialogTitle><DialogDescription>
          {replacement?.appName} is currently connected to {replacement?.previous}. Saving {replacement?.operation.hostname} replaces that connection and resets verification. Visitors using the old hostname may lose access. Existing DNS records will not be deleted.
        </DialogDescription></DialogHeader>
        {mutation.isError && <p role="alert" className="text-sm text-red-300">{errorMessage(mutation.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => setReplacement(null)}>Cancel</Button>
          <Button className={gold} disabled={mutation.isPending} onClick={() => { if (replacement) mutation.mutate(replacement.operation); }}>{mutation.isPending ? "Replacing…" : "Replace connection"}</Button></div>
      </DialogContent>
    </Dialog>
  </section>;
}