// Thin wrapper around Resend's Domains API so client-facing Email API
// domain verification can be done on Resend in addition to (or instead of)
// AWS SES. Uses fetch — no SDK dependency.
//
// Docs: https://resend.com/docs/api-reference/domains

export interface ResendDnsRecord {
  record: string;
  name: string;
  type: string;
  ttl: string;
  status: string;
  value: string;
  priority?: number;
}

export interface ResendDomain {
  id: string;
  name: string;
  status: string; // not_started | pending | verified | failed
  region?: string;
  records?: ResendDnsRecord[];
}

const BASE = "https://api.resend.com";

function requireKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return key;
}

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${requireKey()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.name || `Resend HTTP ${res.status}`;
    const err = new Error(`Resend domains API: ${msg}`);
    (err as any).status = res.status;
    (err as any).body = data;
    throw err;
  }
  return data;
}

export async function createResendDomain(domain: string, region = "us-east-1"): Promise<ResendDomain> {
  return call("/domains", {
    method: "POST",
    body: JSON.stringify({ name: domain, region }),
  });
}

export async function getResendDomain(id: string): Promise<ResendDomain> {
  return call(`/domains/${encodeURIComponent(id)}`);
}

export async function verifyResendDomain(id: string): Promise<ResendDomain> {
  // POST /domains/:id/verify triggers Resend to re-check the DNS records.
  return call(`/domains/${encodeURIComponent(id)}/verify`, { method: "POST" });
}

export async function deleteResendDomain(id: string): Promise<void> {
  await call(`/domains/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Turn the records[] from Resend into the same column shape we already store
// (dkimToken / spfRecord / dmarcRecord are plain-text human instructions —
// not parsed by anything, just shown in the UI).
export function formatRecordsForUi(records: ResendDnsRecord[] | undefined): {
  dkimText: string;
  spfText: string;
  dmarcText: string;
} {
  const dkim: string[] = [];
  const spf: string[] = [];
  const dmarc: string[] = [];
  for (const r of records || []) {
    const line = `${r.type}  ${r.name}  →  ${r.value}${r.priority ? `  (priority ${r.priority})` : ""}`;
    const upper = (r.record || r.name || "").toUpperCase();
    if (upper.includes("DKIM") || /domainkey/i.test(r.name) || r.record === "DKIM") dkim.push(line);
    else if (upper.includes("SPF") || (r.type === "TXT" && /spf/i.test(r.value))) spf.push(line);
    else if (upper.includes("DMARC") || /_dmarc/i.test(r.name)) dmarc.push(line);
    else dkim.push(line); // fall back to DKIM bucket so nothing is dropped from the UI
  }
  return {
    dkimText: dkim.join("\n"),
    spfText: spf.join("\n") || "v=spf1 include:amazonses.com include:_spf.resend.com ~all",
    dmarcText: dmarc.join("\n") || "TXT  _dmarc  →  v=DMARC1; p=quarantine;",
  };
}
