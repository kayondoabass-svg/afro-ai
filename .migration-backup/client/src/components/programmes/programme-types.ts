export type Programme = "affiliate" | "business";
export type PayoutMethod = "bank" | "mobile_money";

export interface Money {
  currency: string;
  earnedCents: number;
  pendingCents: number;
  approvedCents: number;
  paidCents: number;
  reversedCents: number;
}

export interface Workspace {
  programme: Programme;
  applicationId: number;
  displayName: string;
  status: string;
  role: "owner" | "admin" | "sales" | "finance";
  reviewNotes: string | null;
  tier: string | null;
  commissionPercent: number;
  registrationStatus: "unverified" | "verified";
  registrationNumber: string | null;
  registrationCountry: string | null;
  payoutMethod: PayoutMethod | null;
  referralLink: string | null;
  stats: {
    clicks: number;
    signups: number;
    payingCustomers: number;
    finance: Money[];
  };
}

export interface Member {
  id: number;
  user_id: string;
  email: string;
  role: "owner" | "admin" | "sales" | "finance";
  status: string;
}

export interface Invitation {
  id: number;
  email: string;
  role: "admin" | "sales" | "finance";
  status: string;
  expires_at: string;
}

export interface Resource {
  id: number;
  title: string;
  url: string;
  description: string;
}

export interface ProgrammeDetail {
  workspace: Workspace;
  application: Record<string, unknown> | null;
  truncated: boolean;
  customers: Record<string, unknown>[];
  commissions: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  payouts: Record<string, unknown>[];
  members: Member[];
  invitations: Invitation[];
  emails: Record<string, unknown>[];
  audit: Record<string, unknown>[];
  resources: Resource[];
}

export function displayField(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  if (/cents$/i.test(key) && typeof value === "number" && typeof row.currency === "string") return money(value, row.currency);
  if (key.endsWith("_at") || key.endsWith("At") || /date$/i.test(key)) {
    const date = new Date(String(value));
    if (!Number.isNaN(date.valueOf())) return date.toLocaleString();
  }
  return String(value);
}

export function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export function safeTitle(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
