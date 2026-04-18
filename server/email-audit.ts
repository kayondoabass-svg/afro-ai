import dns from "node:dns/promises";

type Status = "pass" | "warn" | "fail" | "info";

interface CheckResult {
  id: string;
  label: string;
  status: Status;
  detail: string;
  fix?: string;
  raw?: string;
}

export interface EmailAuditReport {
  domain: string;
  score: number; // 0-100
  rating: "excellent" | "good" | "needs_attention" | "critical";
  spamRiskPct: number; // estimated % of mail likely landing in spam
  detectedProvider: string | null;
  checks: CheckResult[];
  summary: string;
  generatedAt: string;
}

// Common DKIM selectors used by major providers
const DKIM_SELECTORS = [
  "default", "google", "k1", "k2", "selector1", "selector2",
  "mail", "smtp", "mxvault", "dkim", "s1", "s2",
  "sm", "fm1", "fm2", "fm3", "amazonses", "mandrill",
  "sendgrid", "mailgun", "postmark", "zoho",
];

// Free DNSBL zones to check
const DNSBL_ZONES = [
  { name: "Spamhaus ZEN", host: "zen.spamhaus.org" },
  { name: "Barracuda", host: "b.barracudacentral.org" },
  { name: "SpamCop", host: "bl.spamcop.net" },
  { name: "SORBS", host: "dnsbl.sorbs.net" },
];

// SPF "include:" → human provider name
const PROVIDER_MAP: Array<[RegExp, string]> = [
  [/sendgrid\.net/i, "SendGrid"],
  [/mailgun\.org/i, "Mailgun"],
  [/_spf\.google\.com|google\.com/i, "Google Workspace / Gmail SMTP"],
  [/amazonses\.com/i, "AWS SES"],
  [/spf\.protection\.outlook\.com/i, "Microsoft 365"],
  [/mailchimp\.com|mcsv\.net/i, "Mailchimp / Mandrill"],
  [/postmarkapp\.com/i, "Postmark"],
  [/sparkpostmail\.com|sparkpost/i, "SparkPost"],
  [/zoho\.com/i, "Zoho Mail"],
  [/mxvault\.com/i, "MXroute"],
  [/_spf\.mail\.ru/i, "Mail.ru"],
  [/yandex\.net/i, "Yandex"],
  [/sendinblue\.com|brevo/i, "Brevo (Sendinblue)"],
  [/elasticemail\.com/i, "Elastic Email"],
  [/smtp2go\.com/i, "SMTP2GO"],
];

const isValidDomain = (d: string) =>
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(d);

async function safeTxt(name: string): Promise<string[][]> {
  try {
    return await dns.resolveTxt(name);
  } catch {
    return [];
  }
}

async function safeMx(name: string): Promise<dns.MxRecord[]> {
  try {
    return await dns.resolveMx(name);
  } catch {
    return [];
  }
}

async function safeA(name: string): Promise<string[]> {
  try {
    return await dns.resolve4(name);
  } catch {
    return [];
  }
}

function flattenTxt(records: string[][]): string[] {
  return records.map((parts) => parts.join(""));
}

function detectProviderFromSpf(spf: string): string | null {
  for (const [re, name] of PROVIDER_MAP) {
    if (re.test(spf)) return name;
  }
  return null;
}

async function checkBlacklist(ip: string): Promise<{ listed: string[]; checked: number }> {
  const reversed = ip.split(".").reverse().join(".");
  const listed: string[] = [];
  await Promise.all(
    DNSBL_ZONES.map(async (zone) => {
      try {
        await dns.resolve4(`${reversed}.${zone.host}`);
        listed.push(zone.name); // any A-record means listed
      } catch {
        // not listed (NXDOMAIN) or DNS error — treat as not listed
      }
    }),
  );
  return { listed, checked: DNSBL_ZONES.length };
}

export async function auditDomain(rawDomain: string): Promise<EmailAuditReport> {
  const domain = rawDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

  if (!isValidDomain(domain)) {
    throw new Error("Please enter a valid domain like 'yourbusiness.com'");
  }

  const checks: CheckResult[] = [];

  // 1. SPF
  const spfRecords = flattenTxt(await safeTxt(domain)).filter((r) => /^v=spf1\b/i.test(r));
  let spfRecord: string | null = null;
  let detectedProvider: string | null = null;

  if (spfRecords.length === 0) {
    checks.push({
      id: "spf",
      label: "SPF record",
      status: "fail",
      detail: "No SPF record found. Mail servers cannot verify your domain is allowed to send email — most providers will treat your messages as spam or reject them.",
      fix: "Add a TXT record at the root of your domain: v=spf1 include:_spf.afroaigroup.com ~all",
    });
  } else if (spfRecords.length > 1) {
    checks.push({
      id: "spf",
      label: "SPF record",
      status: "fail",
      detail: `Found ${spfRecords.length} SPF records. RFC 7208 requires exactly ONE — multiple SPF records cause all of them to be ignored, breaking deliverability.`,
      fix: "Merge into a single SPF record. Combine all 'include:' entries into one v=spf1 line.",
      raw: spfRecords.join(" | "),
    });
  } else {
    spfRecord = spfRecords[0];
    detectedProvider = detectProviderFromSpf(spfRecord);
    const tooSoft = / \?all/.test(spfRecord) || / \+all/.test(spfRecord);
    if (tooSoft) {
      checks.push({
        id: "spf",
        label: "SPF record",
        status: "warn",
        detail: "SPF record exists but uses '?all' or '+all' — this allows ANY server to send mail as your domain. Spammers can spoof you.",
        fix: "Change the ending to '~all' (soft fail) or '-all' (hard fail).",
        raw: spfRecord,
      });
    } else {
      checks.push({
        id: "spf",
        label: "SPF record",
        status: "pass",
        detail: detectedProvider
          ? `Valid SPF record found. Detected sending provider: ${detectedProvider}.`
          : "Valid SPF record found.",
        raw: spfRecord,
      });
    }
  }

  // 2. DMARC
  const dmarcRecords = flattenTxt(await safeTxt(`_dmarc.${domain}`)).filter((r) => /^v=DMARC1\b/i.test(r));
  if (dmarcRecords.length === 0) {
    checks.push({
      id: "dmarc",
      label: "DMARC policy",
      status: "fail",
      detail: "No DMARC record. Without DMARC, anyone can send email pretending to be your domain — Gmail and Outlook now actively penalize domains without DMARC.",
      fix: "Add a TXT record at _dmarc.yourdomain.com: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com",
    });
  } else {
    const dmarc = dmarcRecords[0];
    const policy = (dmarc.match(/p=(\w+)/i)?.[1] || "none").toLowerCase();
    if (policy === "none") {
      checks.push({
        id: "dmarc",
        label: "DMARC policy",
        status: "warn",
        detail: "DMARC found but policy is 'p=none' — this only monitors abuse without blocking it. Spoofed emails still reach inboxes.",
        fix: "After 30 days of monitoring, upgrade to 'p=quarantine' or 'p=reject'.",
        raw: dmarc,
      });
    } else {
      checks.push({
        id: "dmarc",
        label: "DMARC policy",
        status: "pass",
        detail: `Strong DMARC policy in place (p=${policy}). Spoofing attempts will be ${policy === "reject" ? "rejected" : "quarantined"}.`,
        raw: dmarc,
      });
    }
  }

  // 3. DKIM (try common selectors)
  const foundSelectors: string[] = [];
  await Promise.all(
    DKIM_SELECTORS.map(async (sel) => {
      const recs = flattenTxt(await safeTxt(`${sel}._domainkey.${domain}`));
      if (recs.some((r) => /v=DKIM1|k=rsa|p=[A-Za-z0-9+/]/.test(r))) {
        foundSelectors.push(sel);
      }
    }),
  );

  if (foundSelectors.length === 0) {
    checks.push({
      id: "dkim",
      label: "DKIM signing",
      status: "fail",
      detail: `No DKIM keys found at common selectors (we tried ${DKIM_SELECTORS.length}). Without DKIM, receivers cannot cryptographically verify your email — Gmail and Yahoo now require DKIM for bulk senders.`,
      fix: "Configure DKIM through your email provider. Afro AI Email API auto-generates and rotates your DKIM keys.",
    });
  } else {
    checks.push({
      id: "dkim",
      label: "DKIM signing",
      status: "pass",
      detail: `DKIM configured. Active selectors: ${foundSelectors.join(", ")}.`,
    });
  }

  // 4. MX records
  const mxRecords = await safeMx(domain);
  if (mxRecords.length === 0) {
    checks.push({
      id: "mx",
      label: "MX records (mail receiving)",
      status: "warn",
      detail: "No MX records — your domain cannot receive email (replies, bounces, abuse reports). This silently breaks customer feedback loops.",
      fix: "Set up MX records via your email provider, or use Google Workspace / Microsoft 365 for receiving mail.",
    });
  } else {
    checks.push({
      id: "mx",
      label: "MX records",
      status: "pass",
      detail: `${mxRecords.length} MX record(s) configured. Primary: ${mxRecords.sort((a, b) => a.priority - b.priority)[0].exchange}.`,
    });
  }

  // 5. Blacklist check (against domain's A record IP)
  const aRecords = await safeA(domain);
  if (aRecords.length > 0) {
    const ip = aRecords[0];
    const { listed, checked } = await checkBlacklist(ip);
    if (listed.length === 0) {
      checks.push({
        id: "blacklist",
        label: "Domain reputation",
        status: "pass",
        detail: `Your domain's primary IP (${ip}) is clean across ${checked} major blacklists.`,
      });
    } else {
      checks.push({
        id: "blacklist",
        label: "Domain reputation",
        status: "fail",
        detail: `Your IP (${ip}) is listed on: ${listed.join(", ")}. Most inboxes will reject your mail outright.`,
        fix: "Request delisting from each blacklist, then move to a provider with dedicated, clean IPs.",
      });
    }
  } else {
    checks.push({
      id: "blacklist",
      label: "Domain reputation",
      status: "info",
      detail: "Could not resolve domain to an IP. Skipping blacklist check.",
    });
  }

  // 6. Provider analysis
  if (detectedProvider) {
    const isFreeOrLimited =
      detectedProvider.includes("Gmail SMTP") || detectedProvider === "Google Workspace / Gmail SMTP";
    if (isFreeOrLimited) {
      checks.push({
        id: "provider",
        label: "Sending infrastructure",
        status: "warn",
        detail: "You're sending via Gmail/Google Workspace. This caps you at ~500 emails/day, has no analytics, no bounce tracking, and damages your domain reputation if used for transactional mail at any volume.",
        fix: "Switch to a dedicated transactional email API. Afro AI Email API gives you 10,000+ emails/day, full analytics, and bounce handling.",
      });
    } else {
      checks.push({
        id: "provider",
        label: "Sending infrastructure",
        status: "pass",
        detail: `Using a dedicated email provider (${detectedProvider}). Good — but compare with Afro AI Email API for African-currency pricing and 50% lower cost.`,
      });
    }
  } else if (spfRecord) {
    checks.push({
      id: "provider",
      label: "Sending infrastructure",
      status: "info",
      detail: "Could not auto-detect a major email provider from your SPF record.",
    });
  }

  // Scoring: each check contributes weighted points
  const weights: Record<string, number> = {
    spf: 25,
    dmarc: 20,
    dkim: 25,
    mx: 10,
    blacklist: 15,
    provider: 5,
  };
  const statusMultiplier: Record<Status, number> = { pass: 1, warn: 0.5, fail: 0, info: 0.7 };

  let earned = 0;
  let possible = 0;
  for (const c of checks) {
    const w = weights[c.id] ?? 0;
    possible += w;
    earned += w * statusMultiplier[c.status];
  }
  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;

  // Estimate spam rate: rough heuristic based on which critical checks fail
  let spamRiskPct = 0;
  for (const c of checks) {
    if (c.status === "fail") {
      if (c.id === "spf") spamRiskPct += 25;
      else if (c.id === "dkim") spamRiskPct += 20;
      else if (c.id === "dmarc") spamRiskPct += 15;
      else if (c.id === "blacklist") spamRiskPct += 35;
    } else if (c.status === "warn") {
      if (c.id === "spf" || c.id === "dkim") spamRiskPct += 8;
      else if (c.id === "dmarc") spamRiskPct += 5;
      else if (c.id === "provider") spamRiskPct += 12;
    }
  }
  spamRiskPct = Math.min(85, spamRiskPct);

  let rating: EmailAuditReport["rating"];
  if (score >= 90) rating = "excellent";
  else if (score >= 70) rating = "good";
  else if (score >= 40) rating = "needs_attention";
  else rating = "critical";

  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;

  let summary: string;
  if (rating === "excellent") {
    summary = `${domain}'s email setup is in great shape. Maintain monitoring to keep it that way.`;
  } else if (rating === "good") {
    summary = `${domain} has a solid foundation but ${warnCount} item${warnCount === 1 ? "" : "s"} could be tightened to reach excellent deliverability.`;
  } else if (rating === "needs_attention") {
    summary = `${domain} has ${failCount} critical issue${failCount === 1 ? "" : "s"} and ${warnCount} warning${warnCount === 1 ? "" : "s"}. An estimated ${spamRiskPct}% of your transactional emails are likely landing in spam right now.`;
  } else {
    summary = `${domain}'s email deliverability is severely compromised. Up to ${spamRiskPct}% of your emails may not be reaching customers. Immediate action recommended.`;
  }

  return {
    domain,
    score,
    rating,
    spamRiskPct,
    detectedProvider,
    checks,
    summary,
    generatedAt: new Date().toISOString(),
  };
}
