import { useQuery } from "@tanstack/react-query";
import { CircleAlert, RefreshCw, ServerCog } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

type CheckStatus = "ok" | "unavailable" | "not_configured" | "unverified";
export type OperationsHealth = {
  checkedAt: string;
  release: string | null;
  featureVersion: string;
  checks: {
    dns: { status: CheckStatus; message: string };
    sourceStorage: { status: CheckStatus; message: string };
    backups: { status: CheckStatus; message: string };
  };
};

export const OPERATIONS_HEALTH_KEY = ["/api/founder/operations-health"] as const;

const LABEL: Record<string, string> = { ok: "Responding", unavailable: "Unavailable", not_configured: "Not configured", unverified: "Unverified" };
const TONE: Record<string, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  unavailable: "text-destructive",
  not_configured: "text-amber-700 dark:text-amber-300",
  unverified: "text-amber-700 dark:text-amber-300",
};
const DOT: Record<string, string> = { ok: "bg-emerald-600", unavailable: "bg-destructive", not_configured: "bg-amber-600", unverified: "bg-amber-600" };

export function shortRelease(release: string | null | undefined) {
  if (!release) return "Not reported";
  return /^[0-9a-f]{12,}$/i.test(release) ? release.slice(0, 7) : release.slice(0, 24);
}

function when(value?: string) {
  if (!value) return "Not reported";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Not reported" : d.toLocaleString();
}

export function FounderOperationsHealth({ isFounder }: { isFounder: boolean }) {
  const q = useQuery<OperationsHealth>({
    queryKey: OPERATIONS_HEALTH_KEY,
    enabled: isFounder,
    refetchInterval: 45_000,
    queryFn: async () => (await apiRequest("GET", "/api/founder/operations-health")).json(),
  });
  if (!isFounder) return null;
  const d = q.data;
  const rows: [string, string, { status: CheckStatus; message: string } | undefined, string?][] = d ? [
    ["dns", "DNS", d.checks?.dns],
    ["source", "Source storage", d.checks?.sourceStorage, "Service readiness from metadata only. Does not prove every customer file is synced."],
    ["backups", "Backups", d.checks?.backups?.status === "ok" ? { ...d.checks.backups, status: "unverified" } : d.checks?.backups ?? { status: "unverified", message: "Not reported" }, "No automated backup verification. Treat as unverified."],
  ] : [];

  return (
    <section className="rounded-xl border bg-card p-4" aria-label="Operations health" data-testid="section-operations-health">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ServerCog className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Operations checks</h2>
            <p className="text-xs text-muted-foreground">Read-only. Re-checked every 45 seconds{d ? `, last ${when(d.checkedAt)}` : ""}.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          <span className="rounded border bg-muted/40 px-2 py-1" data-testid="text-release-hash">release {q.isError ? "unknown" : q.isPending ? "..." : shortRelease(d?.release)}</span>
          <span className="rounded border bg-muted/40 px-2 py-1" data-testid="text-feature-version">{q.isError ? "feature unknown" : d?.featureVersion ?? "..."}</span>
        </div>
      </div>
      {q.isPending ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />)}</div>
      ) : q.isError ? (
        <div role="alert" className="mt-3 flex flex-col gap-2 rounded-lg border border-destructive/30 p-3 sm:flex-row sm:items-center" data-testid="status-operations-health-error">
          <CircleAlert className="h-4 w-4 shrink-0 text-destructive" />
          <p className="flex-1 text-xs">Operations checks unavailable. Source-backed details may not be live on this backend yet; nothing is assumed healthy.</p>
          <Button size="sm" variant="outline" onClick={() => q.refetch()} data-testid="button-retry-operations-health"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry</Button>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {rows.map(([id, label, check, note]) => {
            const s = check?.status ?? "unavailable";
            return (
              <div key={id} className="rounded-lg border bg-muted/20 p-3" data-testid={`check-${id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className={`flex items-center gap-1.5 text-xs font-semibold ${TONE[s] ?? ""}`} data-testid={`status-check-${id}`}><span className={`h-1.5 w-1.5 rounded-full ${DOT[s] ?? "bg-amber-600"}`} />{LABEL[s] ?? s}</span>
                </div>
                <p className="mt-1 break-words text-xs">{check?.message || "No message reported"}</p>
                {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
