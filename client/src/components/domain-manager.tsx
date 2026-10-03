import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Plus, Copy, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import DomainWebsiteConnection from "./domain-website-connection";

export interface ManagedDomain {
  id: string;
  source: "afro" | "external";
  domainName: string;
  status: string;
  expiresAt: string | null;
  verifiedAt: string | null;
  pricePaid: number | null;
  registrar: string | null;
}
export interface DomainRecord {
  id?: number;
  hostname: string;
  type: string;
  answer: string;
  ttl?: number;
  priority?: number;
}
export interface DomainManagerDetails {
  domain: ManagedDomain;
  details: {
    nameservers: string[];
    locked: boolean | null;
    privacyEnabled: boolean | null;
    autoRenewEnabled: boolean | null;
    createDate: string | null;
    expireDate: string | null;
  };
  dns: { records: DomainRecord[]; errors: string[] };
  verification: { name: string; value: string } | null;
  registrarAvailable: boolean;
  message?: string;
  website: { appId: number; appName: string; verified: boolean; dnsTarget: string } | null;
  capabilities: { nameservers: boolean; dns: boolean };
}

const BASE = "/api/domain-manager";
const panel = "rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5";
const field = "bg-white/5 border-white/10";
const gold = "bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-semibold";
const date = (value: string | null) => {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Unavailable" : parsed.toLocaleString();
};
const flag = (value: boolean | null) => value === null ? "Unavailable" : value ? "Enabled" : "Disabled";
const message = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/5 p-4 text-sm">
    <p className="font-medium text-red-300">Could not complete this request</p>
    <p className="mt-1 break-words text-muted-foreground">{message(error)}</p>
    {retry && <Button variant="outline" className="mt-3" onClick={retry}>Try again</Button>}
  </div>;
}
function Loading() {
  return <div aria-label="Loading domains" className={`${panel} space-y-4`}>
    <Skeleton className="h-6 w-40" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" />
  </div>;
}
function SourceStatus({ domain }: { domain: ManagedDomain }) {
  return <div className="flex flex-wrap gap-2">
    <Badge variant="outline" className="border-yellow-500/30 text-yellow-400">{domain.source === "afro" ? "Afro AI" : "External"}</Badge>
    <Badge variant="outline" className="border-white/15 capitalize">{domain.status === "registration_review" ? "Registration review" : domain.status === "registering" ? "Registration in progress" : domain.status.replace(/_/g, " ")}</Badge>
  </div>;
}

export default function DomainManager() {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [domainName, setDomainName] = useState("");
  const [registrar, setRegistrar] = useState("");
  const domains = useQuery<{ domains: ManagedDomain[] }>({
    queryKey: [BASE],
    queryFn: async () => {
      const data = await (await apiRequest("GET", BASE)).json();
      if (!data || !Array.isArray(data.domains) || !data.domains.every((d: ManagedDomain) =>
        d && typeof d.id === "string" && typeof d.domainName === "string" && typeof d.status === "string" &&
        (d.source === "afro" || d.source === "external"))) throw new Error("Domain information is unavailable.");
      return data;
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `${BASE}/external`, {
        domainName: domainName.trim().toLowerCase(), ...(registrar.trim() ? { registrar: registrar.trim() } : {}),
      });
      return response.json();
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: [BASE], exact: true });
      const added = client.getQueryData<{ domains: ManagedDomain[] }>([BASE])?.domains.find(d => d.domainName === domainName.trim().toLowerCase());
      if (added) setSelectedId(added.id);
      setDomainName(""); setRegistrar(""); setAdding(false);
    },
  });
  const list = domains.data?.domains ?? [];
  const selected = list.find(d => d.id === selectedId) ?? list[0];
  return <div className="space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div><h2 className="text-xl font-semibold">Your domains. One workspace.</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage Afro AI registrations and track domains you bought elsewhere.</p></div>
      <Button className={`${gold} gap-2 shrink-0`} onClick={() => { add.reset(); setAdding(true); }}><Plus className="h-4 w-4" />Add external domain</Button>
    </div>
    <Dialog open={adding} onOpenChange={open => { if (!add.isPending) setAdding(open); }}>
      <DialogContent className="bg-zinc-900 border-white/10">
        <DialogHeader><DialogTitle>Add an external domain</DialogTitle><DialogDescription>Tracking does not transfer your domain. Registration and DNS changes stay with your registrar.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); add.mutate(); }}>
          <div><Label htmlFor="external-domain">Domain name</Label><Input id="external-domain" required pattern="[^ /:]+\.[^ /:]+" placeholder="yourbusiness.com" value={domainName} onChange={e => setDomainName(e.target.value)} className={`${field} mt-1`} disabled={add.isPending} /></div>
          <div><Label htmlFor="external-registrar">Registrar (optional)</Label><Input id="external-registrar" value={registrar} onChange={e => setRegistrar(e.target.value)} className={`${field} mt-1`} disabled={add.isPending} /></div>
          {add.isError && <Failure error={add.error} />}
          <Button type="submit" className={gold} disabled={add.isPending || !domainName.trim()}>{add.isPending ? "Adding…" : "Add domain"}</Button>
        </form>
      </DialogContent>
    </Dialog>
    {domains.isLoading ? <Loading /> : domains.isError ? <Failure error={domains.error} retry={() => { void domains.refetch(); }} /> : list.length === 0 ? (
      <div className={`${panel} py-12 text-center`}><Globe className="mx-auto h-10 w-10 text-yellow-400/70" />
        <h3 className="mt-4 font-semibold">No domains tracked yet</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Register a domain in Find Domains, or add one you already own. Your existing registrar stays in control.</p></div>
    ) : <div className="grid grid-cols-1 md:grid-cols-[230px_minmax(0,1fr)] gap-5 items-start">
      <nav aria-label="Your domains" className={`${panel} !p-2 space-y-1`}>
        {list.map(d => <button key={d.id} type="button" aria-pressed={selected?.id === d.id} onClick={() => setSelectedId(d.id)}
          className={`w-full text-left rounded-lg p-3 border ${selected?.id === d.id ? "border-yellow-500/30 bg-yellow-500/10" : "border-transparent hover:bg-white/5"}`}>
          <span className="block font-mono text-sm break-all mb-2">{d.domainName}</span><SourceStatus domain={d} />
        </button>)}
      </nav>
      {selected && <DomainDetails key={selected.id} id={selected.id} />}
    </div>}
  </div>;
}

type Action = { method: string; path: string; body?: unknown; title: string; warning: string };
function DomainDetails({ id }: { id: string }) {
  const client = useQueryClient();
  const path = `${BASE}/${encodeURIComponent(id)}`;
  const [confirmation, setConfirmation] = useState<Action | null>(null);
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<DomainRecord | null>(null);
  const [nsOpen, setNsOpen] = useState(false);
  const [nameservers, setNameservers] = useState("");
  const query = useQuery<DomainManagerDetails>({
    queryKey: [path],
    queryFn: async () => {
      const result = await (await apiRequest("GET", path)).json();
      if (!result?.domain || typeof result.domain.status !== "string" || !result.details ||
        !Array.isArray(result.details.nameservers) || !Array.isArray(result.dns?.records) ||
        !Array.isArray(result.dns?.errors) || !result.capabilities) throw new Error("Domain details are unavailable.");
      return result;
    },
  });
  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      const response = await apiRequest(action.method, action.path, action.body);
      if (action.path.endsWith("/verify")) return response.json() as Promise<{ verified: boolean; message: string }>;
      return null;
    },
    onSuccess: async (result, action) => {
      setNotice(result ? result.message || (result.verified ? "Ownership verified." : "TXT record not found. Check the record and try again.") : "Changes saved.");
      setConfirmation(null); setEditor(null); setNsOpen(false);
      if (action.method === "DELETE" && action.path === path) {
        await client.invalidateQueries({ queryKey: [BASE], exact: true });
        client.removeQueries({ queryKey: [path], exact: true });
      } else {
        await Promise.all([
          client.invalidateQueries({ queryKey: [BASE], exact: true }),
          client.invalidateQueries({ queryKey: [path], exact: true }),
        ]);
      }
    },
  });
  const registration = useMutation({
    mutationFn: async (orderId: string) => {
      const result = await (await apiRequest("POST", `/api/domains/activate/${orderId}`, {})).json();
      if (result?.success !== true || typeof result.order?.status !== "string") throw new Error(result?.message || "Registration status unavailable. Check My Domains before trying again.");
      return result as { success: boolean; order: { status: string } };
    },
    onSuccess: async (result) => {
      setNotice(result.order.status === "active" ? "Registration completed. You can now connect your published app." : `Registration status: ${result.order.status.replace(/_/g, " ")}.`);
      client.setQueryData<DomainManagerDetails>([path], old => old ? { ...old, domain: { ...old.domain, status: result.order.status } } : old);
      client.setQueryData<{ domains: ManagedDomain[] }>([BASE], old => old ? { domains: old.domains.map(d => d.id === id ? { ...d, status: result.order.status } : d) } : old);
      await Promise.all([client.invalidateQueries({ queryKey: [BASE], exact: true }), client.invalidateQueries({ queryKey: [path], exact: true })]);
    },
    onError: () => {
      // A registrar failure may move the order to review after an atomic claim.
      // Re-read status so a stale pending-payment view never invites another registration.
      void client.invalidateQueries({ queryKey: [BASE], exact: true });
      void client.invalidateQueries({ queryKey: [path], exact: true });
    },
  });
  const openConfirmation = (action: Action) => { mutation.reset(); setConfirmation(action); };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setNotice("Copied to clipboard."); }
    catch { setNotice("Clipboard unavailable. Select and copy the displayed text manually."); }
  };
  if (query.isLoading) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => { void query.refetch(); }} />;
  const data = query.data;
  if (!data) return <Failure error={new Error("Domain details are unavailable.")} retry={() => { void query.refetch(); }} />;
  const { domain, details, dns, verification, website } = data;
  const canDns = domain.source === "afro" && data.capabilities.dns;
  const canNs = domain.source === "afro" && domain.status === "active" && data.capabilities.nameservers;
  const saveRecord = () => {
    if (!editor) return;
    mutation.mutate({ method: editor.id !== undefined ? "PUT" : "POST", path: `${path}/dns${editor.id !== undefined ? `/${editor.id}` : ""}`,
      body: { hostname: editor.hostname.trim(), type: editor.type, answer: editor.answer.trim(), ttl: editor.ttl ?? 3600,
        ...(editor.priority !== undefined || ["MX", "SRV"].includes(editor.type) ? { priority: editor.priority ?? 0 } : {}) },
      title: "Save DNS record", warning: "" });
  };
  return <div className="min-w-0 space-y-4">
    <section className={panel}>
      <div className="flex items-start gap-3"><Globe className="h-6 w-6 text-yellow-400 shrink-0 mt-1" />
        <div className="min-w-0"><h3 className="font-mono text-lg font-semibold break-all">{domain.domainName}</h3><div className="mt-2"><SourceStatus domain={domain} /></div></div></div>
      {!data.registrarAvailable && <div className="mt-4 flex gap-2 text-sm text-yellow-200/80"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><p>{data.message || "Registrar data is unavailable. Only the information returned below can be shown."}</p></div>}
      {data.registrarAvailable && data.message && <p className="mt-3 text-sm text-muted-foreground">{data.message}</p>}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mt-5 text-sm">
        {[["Registrar", domain.registrar || "Unavailable"], ["Registered", date(details.createDate)], ["Expires", date(details.expireDate ?? domain.expiresAt)],
          ["Purchase amount", domain.pricePaid === null ? "Unavailable" : `$${(domain.pricePaid / 100).toFixed(2)}`],
          ["Provider lock", details.locked === null ? "Unavailable" : details.locked ? "Locked" : "Unlocked"],
          ["Privacy", flag(details.privacyEnabled)], ["Auto-renew", flag(details.autoRenewEnabled)], ["Ownership verified at", domain.verifiedAt ? date(domain.verifiedAt) : "Not verified"]].map(([label, value]) =>
          <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}
      </dl>
      <p className="text-xs text-muted-foreground mt-4">Provider lock, privacy and auto-renew are read-only provider information.</p>
      {domain.source === "afro" && domain.status === "pending_payment" && /^afro:\d+$/.test(id) && <div className="mt-4 rounded-lg border border-yellow-500/25 bg-yellow-500/5 p-4">
        <p className="text-sm text-muted-foreground">Already completed checkout? The server independently verifies completed payment, amount and order ownership before registering your domain. This button does not take another payment.</p>
        <Button className={`${gold} mt-3`} disabled={registration.isPending} onClick={() => { registration.reset(); registration.mutate(id.slice(5)); }}>{registration.isPending ? "Checking payment and registration…" : "Complete paid registration"}</Button>
      </div>}
      {domain.source === "afro" && domain.status === "registering" && <p role="status" className="mt-4 text-sm text-yellow-200/80">Registration is in progress. Do not retry payment. Check back for the confirmed status.</p>}
      {domain.source === "afro" && domain.status === "registration_review" && <div className="mt-4 text-sm text-yellow-200/80"><p>Registration needs support review. Do not retry payment or start a new registration for this domain.</p><Button asChild variant="outline" className="mt-3"><a href="/contact">Contact registration support</a></Button></div>}
      {registration.isError && <div className="mt-3"><Failure error={registration.error} /></div>}
      <div className="flex flex-wrap gap-2 mt-5">
        <Button variant="outline" asChild><a href="/contact">Request renewal</a></Button>
        <Button variant="outline" asChild><a href="/contact">Request transfer</a></Button>
      </div><p className="text-xs text-muted-foreground mt-2">Assisted support requests, not automated checkout. Availability is confirmed by support.</p>
    </section>
    {notice && <p role="status" className="rounded-lg border border-yellow-500/25 bg-yellow-500/5 p-3 text-sm text-yellow-200">{notice}</p>}
    {mutation.isError && !confirmation && !editor && <Failure error={mutation.error} />}
    {domain.source === "external" && <section className={panel}>
      <h4 className="font-semibold flex gap-2 items-center"><ShieldCheck className="h-4 w-4 text-yellow-400" />Ownership verification</h4>
      <p className="mt-2 text-sm text-muted-foreground">Add this TXT record in your registrar or DNS provider's DNS settings, then verify. DNS changes may take time to appear.</p>
      {verification ? <div className="mt-4 space-y-3">
        {[["TXT name", verification.name], ["TXT value", verification.value]].map(([label, value]) => <div key={label}>
          <p className="text-xs text-muted-foreground">{label}</p><div className="mt-1 flex items-start gap-2"><code className="flex-1 min-w-0 break-all rounded bg-white/5 p-2 text-xs">{value}</code>
            <Button variant="outline" size="icon" aria-label={`Copy ${label}`} onClick={() => { void copy(value); }}><Copy className="h-4 w-4" /></Button></div>
        </div>)}
        <Button className={gold} disabled={mutation.isPending} onClick={() => { mutation.reset(); mutation.mutate({ method: "POST", path: `${path}/verify`, title: "Verify ownership", warning: "" }); }}>{mutation.isPending ? "Checking…" : "Verify ownership"}</Button>
      </div> : <p className="mt-3 text-sm text-muted-foreground">Verification instructions are currently unavailable.</p>}
      <Button variant="outline" className="mt-4 block border-red-400/30 text-red-300" disabled={mutation.isPending} onClick={() => openConfirmation({
        method: "DELETE", path, title: "Remove external tracking",
        warning: `Remove ${domain.domainName} from this workspace? This only removes external tracking. It does not delete the domain, cancel registration, or change DNS at your registrar.`,
      })}>Remove tracking</Button>
    </section>}
    <section className={panel}>
      <div className="flex flex-wrap gap-3 items-center justify-between"><h4 className="font-semibold">Nameservers</h4>
        {canNs && <Button variant="outline" size="sm" disabled={mutation.isPending} onClick={() => { setNameservers(details.nameservers.join("\n")); setNsOpen(true); }}>Change nameservers</Button>}</div>
      {details.nameservers.length ? <ul className="mt-3 space-y-1">{details.nameservers.map((ns, i) => <li key={`${ns}-${i}`} className="font-mono text-xs break-all rounded bg-white/5 p-2">{ns}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Nameserver information unavailable.</p>}
      {!canNs && <p className="mt-3 text-xs text-muted-foreground">{domain.source === "external" ? "Manage nameservers at your registrar. External domains are read-only here." : "Nameserver changes are not available for this domain right now."}</p>}
    </section>
    <section className={panel}>
      <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">DNS records</h4>
        {canDns && <Button className={gold} size="sm" disabled={mutation.isPending} onClick={() => { mutation.reset(); setEditor({ hostname: "", type: "A", answer: "", ttl: 3600 }); }}>Add DNS record</Button>}</div>
      <p className="text-xs text-muted-foreground mt-2">{canDns ? "Changes update the registrar's DNS zone. They affect public DNS only when that zone is authoritative." : domain.source === "external" ? "Public DNS is read-only here. Add, edit or delete records in your registrar or DNS provider's settings." : "DNS editing is unavailable for this domain."}</p>
      {dns.errors.map((error, i) => <p key={i} role="alert" className="mt-3 text-sm text-yellow-200/80">{error}</p>)}
      {dns.records.length ? <div className="mt-4 space-y-2">{dns.records.map((record, i) => <div key={record.id ?? i} className="border border-white/10 rounded-lg p-3">
        <div className="flex flex-wrap gap-2 items-center"><Badge variant="outline" className="border-yellow-500/25 text-yellow-400 font-mono">{record.type}</Badge><span className="font-mono text-xs break-all">{record.hostname || "@"}</span></div>
        <p className="mt-2 text-xs font-mono break-all">{record.answer}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">TTL: {record.ttl ?? "Unavailable"}{record.priority !== undefined ? ` · Priority: ${record.priority}` : ""}</p>
          {canDns && record.id !== undefined && <div className="flex gap-2">
            <Button variant="outline" size="sm" aria-label={`Edit ${record.type} ${record.hostname}`} disabled={mutation.isPending} onClick={() => { mutation.reset(); setEditor({ ...record }); }}>Edit</Button>
            <Button variant="outline" size="sm" aria-label={`Delete ${record.type} ${record.hostname}`} disabled={mutation.isPending} onClick={() => openConfirmation({
              method: "DELETE", path: `${path}/dns/${record.id}`, title: "Delete DNS record", warning: `Delete the ${record.type} record for ${record.hostname || "@"}? This can interrupt your website, email or other services.`,
            })}>Delete</Button>
          </div>}
        </div>
      </div>)}</div> : <p className="mt-4 text-sm text-muted-foreground">{dns.errors.length ? "DNS records could not be fully retrieved." : "No DNS records returned."}</p>}
    </section>
    <DomainWebsiteConnection domain={domain} website={website} />
    <Dialog open={editor !== null} onOpenChange={open => { if (!open && !mutation.isPending) setEditor(null); }}>
      <DialogContent className="bg-zinc-900 border-white/10 max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editor?.id !== undefined ? "Edit DNS record" : "Add DNS record"}</DialogTitle><DialogDescription>Incorrect DNS records can interrupt your website or email. Use the values supplied by your hosting provider.</DialogDescription></DialogHeader>
        {editor && <form className="space-y-4" onSubmit={e => { e.preventDefault(); saveRecord(); }}>
          <div><Label htmlFor="dns-type">Type</Label><select id="dns-type" className={`${field} mt-1 w-full border rounded-md p-2 text-sm`} value={editor.type} onChange={e => setEditor({ ...editor, type: e.target.value })} disabled={mutation.isPending}>
            {Array.from(new Set(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", editor.type])).map(type => <option key={type} value={type} className="bg-zinc-900">{type}</option>)}
          </select></div>
          <div><Label htmlFor="dns-hostname">Hostname (blank for root)</Label><Input id="dns-hostname" className={field} value={editor.hostname} onChange={e => setEditor({ ...editor, hostname: e.target.value })} disabled={mutation.isPending} /></div>
          <div><Label htmlFor="dns-answer">Answer</Label><Input id="dns-answer" className={field} required value={editor.answer} onChange={e => setEditor({ ...editor, answer: e.target.value })} disabled={mutation.isPending} /></div>
          <div><Label htmlFor="dns-ttl">TTL (seconds)</Label><Input id="dns-ttl" className={field} type="number" min={1} step={1} required value={editor.ttl ?? 3600} onChange={e => setEditor({ ...editor, ttl: Number(e.target.value) })} disabled={mutation.isPending} /></div>
          {(["MX", "SRV"].includes(editor.type) || editor.priority !== undefined) && <div><Label htmlFor="dns-priority">Priority</Label><Input id="dns-priority" className={field} type="number" min={0} step={1} required value={editor.priority ?? 0} onChange={e => setEditor({ ...editor, priority: Number(e.target.value) })} disabled={mutation.isPending} /></div>}
          {mutation.isError && <Failure error={mutation.error} />}
          <Button className={gold} type="submit" disabled={mutation.isPending || !editor.answer.trim()}>{mutation.isPending ? "Saving…" : "Save record"}</Button>
        </form>}
      </DialogContent>
    </Dialog>
    <Dialog open={nsOpen} onOpenChange={open => { if (!mutation.isPending) setNsOpen(open); }}>
      <DialogContent className="bg-zinc-900 border-white/10">
        <DialogHeader><DialogTitle>Change nameservers</DialogTitle><DialogDescription>Changing nameservers can cause website and email downtime. Ensure the new provider has your complete DNS zone before proceeding.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); setNsOpen(false); openConfirmation({
          method: "PUT", path: `${path}/nameservers`, body: { nameservers: nameservers.split(/[\s,]+/).map(s => s.trim()).filter(Boolean) },
          title: "Confirm nameserver change", warning: "This replaces your nameservers and may cause website and email downtime while DNS propagates. Confirm that the new provider has every required DNS record.",
        }); }}>
          <Label htmlFor="domain-nameservers">Nameservers (one per line or comma-separated)</Label>
          <textarea id="domain-nameservers" required value={nameservers} onChange={e => setNameservers(e.target.value)} className={`${field} w-full rounded-md border p-3 font-mono text-sm min-h-28`} />
          <Button type="submit" className={gold} disabled={!nameservers.trim()}>Review change</Button>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={confirmation !== null} onOpenChange={open => { if (!open && !mutation.isPending) setConfirmation(null); }}>
      <DialogContent className="bg-zinc-900 border-yellow-500/20">
        <DialogHeader><DialogTitle>{confirmation?.title}</DialogTitle><DialogDescription>{confirmation?.warning}</DialogDescription></DialogHeader>
        {mutation.isError && <Failure error={mutation.error} />}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => setConfirmation(null)}>Cancel</Button>
          <Button className={gold} disabled={mutation.isPending} onClick={() => { if (confirmation) mutation.mutate(confirmation); }}>{mutation.isPending ? "Applying…" : "Confirm"}</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}