export const HOSTING_EXPIRED_REASON = "Free plan 30-day limit reached. Upgrade to keep your app live.";
export const LOCKED_REASONS = new Set(["deletion-pending", "unpublish-pending", "customer-unpublished"]);

export type FounderAppStatusKind = "hosting-expired" | "unpublish-pending" | "unpublished" | "deletion-pending" | "admin-suspension" | "active" | "unknown";

export function founderAppStatus(app: { appStatus?: string | null; suspendReason?: string | null } | null | undefined): { kind: FounderAppStatusKind; label: string } {
  const status = (app?.appStatus || "").toLowerCase();
  const reason = (app?.suspendReason || "").trim();
  if (reason === HOSTING_EXPIRED_REASON) return { kind: "hosting-expired", label: "Hosting expired" };
  if (reason === "unpublish-pending") return { kind: "unpublish-pending", label: "Unpublish pending" };
  if (reason === "customer-unpublished") return { kind: "unpublished", label: "Unpublished" };
  if (reason === "deletion-pending") return { kind: "deletion-pending", label: "Deletion pending" };
  if (status === "suspended") return { kind: "admin-suspension", label: "Administrative suspension" };
  if (status === "active" || status === "published" || status === "live") return { kind: "active", label: "Active" };
  return { kind: "unknown", label: status ? status : "Status not recorded" };
}

export const STATUS_TONE: Record<FounderAppStatusKind, string> = {
  "hosting-expired": "border-amber-600/40 bg-amber-500/[0.06] text-amber-800 dark:text-amber-300",
  "unpublish-pending": "border-sky-600/40 bg-sky-500/[0.06] text-sky-800 dark:text-sky-300",
  unpublished: "border-border bg-muted/40 text-muted-foreground",
  "deletion-pending": "border-destructive/40 bg-destructive/[0.05] text-destructive",
  "admin-suspension": "border-destructive/40 bg-destructive/[0.05] text-destructive",
  active: "border-emerald-600/40 bg-emerald-500/[0.06] text-emerald-800 dark:text-emerald-300",
  unknown: "border-border bg-muted/40 text-muted-foreground",
};
