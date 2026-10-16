import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, ChevronLeft, ChevronRight, CircleAlert, Database, ExternalLink, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const FOUNDER_SECTIONS = [
  ["users", "Users"], ["projects", "Projects"], ["apps", "Apps"], ["domains", "Domains"],
  ["chatbots", "Chatbots"], ["email-projects", "Email projects"], ["email-domains", "Email domains"],
  ["email-keys", "Email keys"], ["email-logs", "Email logs"], ["auth-projects", "Auth projects"],
  ["auth-users", "Auth users"], ["auth-domains", "Auth domains"], ["auth-keys", "Auth keys"],
  ["ussd", "USSD"], ["marketplace", "Marketplace"], ["blog", "Blog"], ["subscribers", "Subscribers"],
  ["files", "Files"], ["forms", "Forms"], ["webhooks", "Webhooks"], ["payments", "Payments"], ["audit", "Founder action history"],
  ["ai-usage", "AI usage"], ["reservations", "Reservations"],
] as const;

export type SectionId = typeof FOUNDER_SECTIONS[number][0];
type Overview = {
  checkedAt: string;
  sections: { id: string; label: string; count: number | null; status: "ok" | "unavailable"; error?: string }[];
  health: {
    database: "ok" | "unavailable"; schema: "ok" | "unavailable"; release: string | null;
    emailProvider: string | null; providerConnectivity: string | null;
  };
  alerts: { id: string; severity: "warning" | "error"; title: string; section: string }[];
  finance: { collectedCents: number | null; collectedByCurrency?: { currency: string; amount: string }[]; paygBalanceCents: number | null; paygSpentCents: number | null; providerCostCents: null };
  links: { label: string; href: string }[];
};
type Records = {
  section: string; label: string; columns: { key: string; label: string }[];
  rows: Record<string, unknown>[]; page: number; pageSize: 25; total: number;
  statuses: string[]; checkedAt: string;
};

function dateText(value?: string | null) {
  if (!value) return "Not reported";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not reported" : date.toLocaleString();
}
function safeHref(href: string) {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    return url.protocol === "https:" ? href : null;
  } catch { return null; }
}
function validHostname(value: string) {
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}
export function safeFounderAppHref(app: Record<string, unknown>) {
  const customDomain = app.custom_domain ?? app.customDomain;
  const verified = app.custom_domain_verified ?? app.customDomainVerified;
  if ((verified === true || verified === "true") && typeof customDomain === "string" && customDomain.trim()) {
    const candidate = customDomain.trim();
    try {
      if (candidate.includes("://")) {
        const url = new URL(candidate);
        if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || (url.pathname !== "" && url.pathname !== "/")) return null;
        return validHostname(url.hostname) ? `https://${url.hostname}` : null;
      }
      return validHostname(candidate) ? `https://${candidate.toLowerCase()}` : null;
    } catch { return null; }
  }
  const subdomain = app.subdomain;
  if (typeof subdomain !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(subdomain)) return null;
  return `https://${subdomain.toLowerCase()}.afroaigroup.com`;
}
function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "—";
}
function isSensitiveField(key: string, label: string) {
  const safeMetadata = new Set(["tokensused", "usedtokens", "activecredentials", "apikeyid"]);
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (safeMetadata.has(normalizedKey)) return false;
  return /(secret|token|password|credential|authorization|api[_-]?key|private[_-]?key|access[_-]?key|(^|[_\s])value($|[_\s]))/i.test(`${key} ${label}`);
}
function money(cents: number | null) {
  return cents === null || !Number.isFinite(cents) ? "Unavailable" : `$${(cents / 100).toFixed(2)}`;
}

export function FounderOperations({ isFounder, initialSection, initialStatus, initialOwner, initialId, onClearSection }: {
  isFounder: boolean; initialSection?: SectionId | null; initialStatus?: string; initialOwner?: string; initialId?: string; onClearSection?: () => void;
}) {
  const [section, setSection] = useState<SectionId | null>(initialSection ?? null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState(initialOwner || "");
  const [id, setId] = useState(initialId || "");
  const [page, setPage] = useState(1);
  const overviewQuery = useQuery<Overview>({ queryKey: ["/api/founder/overview"], enabled: isFounder, refetchInterval: 60_000 });
  const params = new URLSearchParams();
  if (section) {
    if (search.trim()) params.set("q", search.trim());
    if (status) params.set("status", status);
    if (owner.trim()) params.set("owner", owner.trim());
    if (id.trim()) params.set("id", id.trim());
    params.set("page", String(page));
  }
  const recordsUrl = section ? `/api/founder/records/${section}?${params.toString()}` : "";
  const recordsQuery = useQuery<Records>({ queryKey: [recordsUrl], enabled: isFounder && Boolean(section) });
  const overview = overviewQuery.data;
  const finance = overview?.finance ?? { collectedCents: null, collectedByCurrency: [], paygBalanceCents: null, paygSpentCents: null, providerCostCents: null };
  const overviewAlerts = overview?.alerts ?? [];
  const overviewSections = overview?.sections ?? [];
  const health = overview?.health ?? {
    database: "unavailable" as const, schema: "unavailable" as const, release: null,
    emailProvider: null, providerConnectivity: null,
  };
  const totalPages = Math.max(1, Math.ceil((recordsQuery.data?.total ?? 0) / (recordsQuery.data?.pageSize ?? 25)));
  const safeColumns = (recordsQuery.data?.columns || []).filter(column => !isSensitiveField(column.key, column.label));
  const sectionName = useMemo(() => FOUNDER_SECTIONS.find(([key]) => key === section)?.[1] ?? "Records", [section]);
  useEffect(() => {
    if (initialSection) {
      setSection(initialSection);
      setStatus(initialStatus || "");
      setOwner(initialOwner || "");
      setId(initialId || "");
      setPage(1);
    }
  }, [initialSection, initialStatus, initialOwner, initialId]);
  const selectSection = (next: string) => {
    if (!FOUNDER_SECTIONS.some(([key]) => key === next)) return;
    setSection(next as SectionId);
    setStatus("");
    setOwner("");
    setId("");
    setSearch("");
    setPage(1);
    onClearSection?.();
    document.getElementById("founder-records")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const openRelatedRecord = (targetSection: SectionId, recordId: string) => {
    setSection(targetSection);
    setSearch("");
    setStatus("");
    setOwner("");
    setId(recordId);
    setPage(1);
    onClearSection?.();
    document.getElementById("founder-records")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const renderRecordCell = (column: { key: string; label: string }, row: Record<string, unknown>) => {
    const key = column.key.toLowerCase();
    const normalizedKey = key.replace(/[^a-z0-9]/g, "");
    const rawValue = row[column.key];
    const relation: SectionId | null = normalizedKey === "userid"
      ? "users"
      : normalizedKey === "tenantid"
        ? "auth-projects"
        : normalizedKey === "projectid" || normalizedKey === "projectids"
          ? section?.startsWith("email-") ? "email-projects" : "projects"
          : null;
    if (relation) {
      let relationValues: unknown[] = Array.isArray(rawValue) ? rawValue : [rawValue];
      if (normalizedKey === "projectids" && typeof rawValue === "string") {
        try {
          const parsed: unknown = JSON.parse(rawValue);
          relationValues = Array.isArray(parsed) ? parsed : rawValue.split(",");
        } catch {
          relationValues = rawValue.split(",");
        }
      }
      const values = relationValues
        .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
        .map(String)
        .filter(value => value.length > 0);
      if (values.length) return <div className="flex flex-wrap gap-1">{values.map((value, index) =>
        <button key={`${value}-${index}`} type="button" onClick={() => openRelatedRecord(relation, value)} className="max-w-[220px] truncate rounded px-1 text-left font-mono text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open ${relation} record ${value}`}>{value}</button>)}</div>;
    }
    if (section === "apps" && (normalizedKey === "subdomain" || normalizedKey === "customdomain")) {
      const href = safeFounderAppHref(row);
      if (href) return <a href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-[240px] items-center gap-1 truncate text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open live app ${href}`}><span className="truncate">{displayValue(rawValue)}</span><ExternalLink className="h-3 w-3 shrink-0" /></a>;
    }
    return displayValue(rawValue);
  };
  const rowLiveHref = (row: Record<string, unknown>) => section === "apps" ? safeFounderAppHref(row) : null;
  const changeFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };

  if (!isFounder) return null;
  return (
    <section className="space-y-4" aria-label="Founder operations">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Private operations</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Platform overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">Live operational signals and safe, read-only customer records.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void overviewQuery.refetch(); if (section) void recordsQuery.refetch(); }} disabled={overviewQuery.isFetching || recordsQuery.isFetching} aria-label="Refresh founder operations">
          <RefreshCw className={`mr-2 h-4 w-4 ${overviewQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {overviewQuery.isPending ? (
        <div className="grid gap-3 sm:grid-cols-3" aria-label="Loading platform overview">
          {[0, 1, 2].map(key => <div key={key} className="h-28 animate-pulse rounded-xl border bg-muted/40" />)}
        </div>
      ) : overviewQuery.isError ? (
        <Card role="alert" className="border-destructive/30">
          <CardContent className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center">
            <div className="flex gap-3"><CircleAlert className="mt-0.5 h-5 w-5 text-destructive" /><div><p className="font-medium">Founder overview unavailable</p><p className="text-sm text-muted-foreground">No operational totals are inferred while this endpoint is unavailable.</p></div></div>
            <Button variant="outline" size="sm" onClick={() => overviewQuery.refetch()} disabled={overviewQuery.isFetching}>Retry overview</Button>
          </CardContent>
        </Card>
      ) : overview ? (
        <>
          <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Service health</CardTitle>
                <CardDescription>Checked {dateText(overview.checkedAt)}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[["Database", health.database], ["Schema", health.schema], ["Release", health.release || "Not reported"], ["Email provider", health.emailProvider || "Not reported"]].map(([label, value]) =>
                    <div key={label} className="rounded-lg border bg-muted/25 p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={`mt-1 text-sm font-semibold ${value === "ok" ? "text-emerald-700 dark:text-emerald-400" : value === "unavailable" ? "text-amber-700 dark:text-amber-300" : ""}`}>{value}</p>
                    </div>)}
                </div>
                {health.providerConnectivity && <p className="mt-3 rounded-md bg-muted/35 px-3 py-2 text-xs leading-5 text-muted-foreground">Configuration-only provider note; connectivity has not been tested: {health.providerConnectivity}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4 text-primary" />Finance signals</CardTitle><CardDescription>Provider cost is intentionally not reported by this endpoint.</CardDescription></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Collected (USD)</p><p className="mt-1 font-mono font-semibold">{money(finance.collectedCents)}</p></div>
                <div><p className="text-xs text-muted-foreground">PAYG balance</p><p className="mt-1 font-mono font-semibold">{money(finance.paygBalanceCents)}</p></div>
                <div><p className="text-xs text-muted-foreground">PAYG spent</p><p className="mt-1 font-mono font-semibold">{money(finance.paygSpentCents)}</p></div>
                <div><p className="text-xs text-muted-foreground">Provider cost</p><p className="mt-1 font-mono font-semibold">Not reported</p></div>
                {(finance.collectedByCurrency || []).map((item, index) => <div key={`${item.currency}-${index}`}><p className="text-xs text-muted-foreground">Collected · {item.currency}</p><p className="mt-1 font-mono font-semibold">{item.amount} {item.currency}</p></div>)}
              </CardContent>
            </Card>
          </div>
          {overviewAlerts.length > 0 && <Card className="border-amber-600/25 bg-amber-500/[0.025]">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-700" />Needs attention <Badge variant="secondary">{overviewAlerts.length}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {overviewAlerts.map(alert => <button key={alert.id} type="button" onClick={() => selectSection(alert.section)} className="flex w-full items-center gap-3 rounded-lg border border-border/70 bg-background/60 p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className={`h-2 w-2 shrink-0 rounded-full ${alert.severity === "error" ? "bg-destructive" : "bg-amber-600"}`} />
                <span className="min-w-0 flex-1 text-sm font-medium">{alert.title}</span><span className="text-xs text-muted-foreground">{alert.section}</span><ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </button>)}
            </CardContent>
          </Card>}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div><CardTitle className="text-base">Service directory</CardTitle><CardDescription>Choose a service to inspect its records. Unavailable counts are never shown as zero.</CardDescription></div>
                <p className="text-xs text-muted-foreground">Checked {dateText(overview.checkedAt)}</p>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FOUNDER_SECTIONS.map(([id, fallbackLabel]) => {
                const item = overviewSections.find(candidate => candidate.id === id);
                const label = item?.label || fallbackLabel;
                const available = item?.status === "ok";
                return <button key={id} type="button" onClick={() => selectSection(id)} className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${section === id ? "border-primary/50 bg-primary/[0.04]" : "border-border/70"}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${available ? "bg-emerald-600" : "bg-amber-600"}`} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{label}</span>{item?.error && <span className="block truncate text-[11px] text-muted-foreground">{item.error}</span>}</span>
                  <span className="font-mono text-sm tabular-nums">{available && item?.count !== null && item?.count !== undefined ? item.count.toLocaleString() : "—"}</span>
                </button>;
              })}
            </CardContent>
          </Card>
          {(overview.links || []).length > 0 && <div className="flex flex-wrap gap-2" aria-label="Founder live-site links">
            {(overview.links || []).map((link, index) => {
              const href = safeHref(link.href);
              if (!href) return null;
              const external = /^https?:\/\//.test(href);
              return <a key={`${link.label}-${index}`} href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{link.label}<ExternalLink className="h-3 w-3" /></a>;
            })}
          </div>}
        </>
      ) : null}

      {section && <Card id="founder-records" className="min-w-0 max-w-full overflow-hidden scroll-mt-5">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Founder records</p><CardTitle className="mt-1 text-lg">{recordsQuery.data?.label || sectionName}</CardTitle><CardDescription>Read-only operational view. Customer credentials and secret values are not exposed.</CardDescription></div>
            <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => recordsQuery.refetch()} disabled={recordsQuery.isFetching}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${recordsQuery.isFetching ? "animate-spin" : ""}`} />Retry</Button><Button size="sm" variant="ghost" onClick={() => { setSection(null); setSearch(""); setStatus(""); setOwner(""); setId(""); setPage(1); onClearSection?.(); }}>Close records</Button></div>
          </div>
          <div className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search records" value={search} onChange={event => changeFilter(setSearch, event.target.value)} placeholder="Search records" className="pl-9" /></label>
            <label className="sr-only" htmlFor="founder-record-status">Filter records by status</label>
            <Select value={status || "all"} onValueChange={value => changeFilter(setStatus, value === "all" ? "" : value)}>
              <SelectTrigger id="founder-record-status" aria-label="Filter by status"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All statuses</SelectItem>{(recordsQuery.data?.statuses || []).map(value => <SelectItem value={value} key={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
            <Input aria-label="Filter by owner" value={owner} onChange={event => changeFilter(setOwner, event.target.value)} placeholder="Owner ID or email" />
            <Input aria-label="Filter by record ID" value={id} onChange={event => changeFilter(setId, event.target.value)} placeholder="Record ID" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recordsQuery.isPending ? <div className="space-y-2 p-5" aria-label="Loading records">{[0, 1, 2].map(item => <div key={item} className="h-10 animate-pulse rounded bg-muted/50" />)}</div>
            : recordsQuery.isError ? <div role="alert" className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center"><CircleAlert className="h-5 w-5 text-destructive" /><div className="flex-1"><p className="font-medium">Records could not be loaded</p><p className="text-sm text-muted-foreground">The selected service may be temporarily unavailable.</p></div><Button variant="outline" size="sm" onClick={() => recordsQuery.refetch()}>Retry records</Button></div>
            : recordsQuery.data ? <>
              <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
                <table className="w-full min-w-[640px] max-w-none text-left text-sm">
                  <thead className="bg-muted/35 text-xs text-muted-foreground"><tr>{safeColumns.map(column => <th key={column.key} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{column.label}</th>)}<th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">Record</th></tr></thead>
                  <tbody className="divide-y divide-border/60">{recordsQuery.data.rows.map((row, rowIndex) => {
                    const recordId = displayValue(row.id);
                    const liveHref = rowLiveHref(row);
                    return <tr key={recordId === "—" ? rowIndex : recordId} className="hover:bg-muted/20">
                      {safeColumns.map(column => <td key={column.key} className="max-w-[260px] px-4 py-3 align-top" title={displayValue(row[column.key])}>{renderRecordCell(column, row)}</td>)}
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          {recordId !== "—" && <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => openRelatedRecord(section, recordId)} aria-label={`View details for record ${recordId}`}>View details</Button>}
                          {liveHref && <a href={liveHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Live site<ExternalLink className="h-3 w-3" /></a>}
                        </div>
                      </td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              {recordsQuery.data.rows.length === 0 && <div className="px-5 py-10 text-center"><p className="font-medium">No matching records</p><p className="mt-1 text-sm text-muted-foreground">Adjust or clear the filters to see more.</p></div>}
              <div className="flex flex-col gap-2 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">{recordsQuery.data.total.toLocaleString()} records · checked {dateText(recordsQuery.data.checkedAt)}</p>
                <div className="flex items-center justify-between gap-2 sm:justify-end"><span className="text-xs tabular-nums">Page {recordsQuery.data.page} of {totalPages}</span><Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1 || recordsQuery.isFetching} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label="Next page" disabled={page >= totalPages || recordsQuery.isFetching} onClick={() => setPage(current => Math.min(totalPages, current + 1))}><ChevronRight className="h-4 w-4" /></Button></div>
              </div>
            </> : <p className="p-6 text-sm text-muted-foreground">No records response received.</p>}
        </CardContent>
      </Card>}
    </section>
  );
}
