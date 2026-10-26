import { pool } from "../db";
import { access, application, type Db, type Identity, type Programme, tables } from "./core";

export function financeSql(p: Programme, scope: string, suffix = "") {
  return `SELECT c.currency,
    COALESCE(SUM(c.amount_cents) FILTER(WHERE r.commission_id IS NULL AND c.status<>'reversed'),0)::text AS "earnedCents",
    COALESCE(SUM(c.amount_cents) FILTER(WHERE r.commission_id IS NULL AND c.status='pending'),0)::text AS "pendingCents",
    COALESCE(SUM(c.amount_cents) FILTER(WHERE r.commission_id IS NULL AND c.status='approved'),0)::text AS "approvedCents",
    COALESCE(SUM(c.amount_cents) FILTER(WHERE c.status='paid'),0)::text AS "paidCents",
    COALESCE(SUM(c.amount_cents) FILTER(WHERE r.commission_id IS NOT NULL OR c.status='reversed'),0)::text AS "reversedCents"
    FROM ${tables[p].commissions} c
    LEFT JOIN programme_commission_reversals r ON r.programme='${p}' AND r.commission_id=c.id
    ${scope} ${suffix} GROUP BY c.currency ORDER BY c.currency`;
}
function moneyRows(rows: any[]) {
  return rows.map(row => ({ ...row, ...Object.fromEntries(Object.entries(row)
    .filter(([k]) => k.endsWith("Cents")).map(([k, v]) => [k, Number(v)])) }));
}
export async function beneficiary(db: Db, p: Programme, id: number) {
  if (p === "affiliate") return id;
  const { rows } = await db.query("SELECT id FROM partners WHERE application_id=$1 ORDER BY id LIMIT 1", [id]);
  return rows[0]?.id ?? null;
}
export async function workspace(db: Db, p: Programme, app: any, role: string) {
  const id = app.id, financial = role !== "sales";
  const b = await beneficiary(db, p, id);
  const partner = p === "business" && b ? (await db.query("SELECT tier,commission_percent,slug,status FROM partners WHERE id=$1", [b])).rows[0] : null;
  const stats = p === "affiliate"
    ? (await db.query(`SELECT clicks,referral_count AS signups,converted_count AS paying FROM affiliate_applications WHERE id=$1`, [id])).rows[0]
    : b ? (await db.query(`SELECT count(*)::int AS signups,count(first_paid_at)::int AS paying
      FROM partner_customers WHERE partner_id=$1`, [b])).rows[0] : {};
  if(p==="business") stats.clicks=Number(app.metadata?.clicks??0);
  const finance = financial && b
    ? moneyRows((await db.query(financeSql(p, `WHERE c.${tables[p].beneficiary}=$1`), [b])).rows) : [];
  return {
    programme: p, applicationId: id, displayName: app[tables[p].name],
    status: p==="business"&&app.status==="approved"&&!partner?"setup_required":
      partner && partner.status !== "active" ? partner.status : app.status,
    role, reviewNotes: app.metadata?.review_notes ?? (p === "business" ? app.review_notes : null),
    tier: partner?.tier ?? null, commissionPercent: p === "affiliate" ? 10 : partner?.commission_percent ?? 20,
    registrationStatus: app.metadata?.registration_verified ? "verified" : "unverified",
    registrationNumber: role === "owner" ? app.metadata?.registration_number ?? null : undefined,
    registrationCountry: role === "owner" ? app.metadata?.registration_country ?? null : undefined,
    payoutMethod: financial ? app.metadata?.payout_method ?? null : null,
    referralLink: app.status === "approved" && (p==="affiliate" || partner?.status === "active")
      ? `https://afroaigroup.com?ref=${encodeURIComponent(p === "affiliate" ? app.referral_code : partner?.slug ?? "")}` : null,
    stats: { clicks: Number(stats?.clicks ?? 0), signups: Number(stats?.signups ?? 0),
      payingCustomers: Number(stats?.paying ?? 0), finance },
  };
}
export async function myWorkspaces(who: Identity) {
  const items: any[] = [];
  for (const p of ["affiliate", "business"] as Programme[]) {
    const { rows } = await pool.query(`SELECT DISTINCT a.id FROM ${tables[p].app} a
      LEFT JOIN programme_applications m ON m.programme=$1 AND m.application_id=a.id
      WHERE m.owner_user_id=$2 OR (m.owner_user_id IS NULL AND lower(a.email)=$3)
      ${p === "business" ? `OR a.id IN(SELECT application_id FROM programme_members WHERE user_id=$2 AND status='active')
        OR a.id IN(SELECT application_id FROM partners WHERE user_id=$2)` : ""}`, [p, who.id, who.email]);
    for (const row of rows) {
      try { const a = await access(pool, p, row.id, who); items.push(await workspace(pool, p, a.app, a.role)); }
      catch (e: any) { if (e.status !== 404) throw e; }
    }
  }
  return { workspaces: items, checkedAt: new Date().toISOString() };
}
export const resources = [
  { id: "outreach", title: "Referral outreach template", description: "Editable introduction without earnings guarantees.", url: "/api/programmes/resources/outreach/download" },
  { id: "onboarding", title: "Customer onboarding checklist", description: "Practical steps for introducing customers to Afro AI.", url: "/api/programmes/resources/onboarding/download" },
  { id: "responsible-promotion", title: "Responsible promotion guide", description: "Referral disclosure, privacy and truthful claims.", url: "/api/programmes/resources/responsible-promotion/download" },
];
export const resourceText: Record<string, string> = {
  outreach: "Subject: Could Afro AI help your business?\n\nHello [Name],\nI would like to introduce Afro AI. Explore its current products and pricing at https://afroaigroup.com.\nMy referral link: [Your approved referral link]\nDisclosure: I may earn a commission on qualifying payments through my link. This does not guarantee income or business results.\nPlease let me know which product you would like to explore.",
  onboarding: "AFRO AI CUSTOMER ONBOARDING\n1. Understand the customer's actual requirements.\n2. Review current product features and pricing together.\n3. Disclose your referral relationship.\n4. Customer creates their own account and verifies their email.\n5. Customer keeps their passwords and API secrets private.\n6. Use their own project for setup; obtain explicit access where collaboration is supported.\n7. Confirm functionality before making claims.\n8. Customer makes their own purchase decision. Never request passwords, PINs or OTPs.",
  "responsible-promotion": "AFRO AI RESPONSIBLE PROMOTION\nDisclose your affiliate or partner relationship. Use only your assigned approved link. Do not promise guaranteed earnings, approval, exclusive territories, free services or outcomes. Quote current platform prices and your approved programme terms. Do not spam or collect unnecessary personal data. Do not publish customer content without permission. Payouts are made manually by Afro AI after review; dashboard entries are not bank transfers.",
};
export async function details(p: Programme, id: number, who: Identity, founder = false) {
  const { app, role } = await access(pool, p, id, who, founder);
  const b = await beneficiary(pool, p, id), financial = role === "owner" || role === "finance";
  const manage = role === "owner" || role === "admin";
  const canSell = role !== "finance";
  const commissions = financial && b ? (await pool.query(`SELECT c.id,c.amount_cents,c.base_amount_cents,
    c.commission_percent,c.currency,c.period_month,c.created_at,c.status AS original_status,
    CASE WHEN r.commission_id IS NOT NULL THEN 'reversed' ELSE c.status END AS status,
    r.reason AS reversal_reason FROM ${tables[p].commissions} c
    LEFT JOIN programme_commission_reversals r ON r.programme=$1 AND r.commission_id=c.id
    WHERE c.${tables[p].beneficiary}=$2 ORDER BY c.id DESC LIMIT 500`, [p, b])).rows : [];
  const customers = canSell && b ? (await pool.query(p === "affiliate"
    ? `SELECT id,status,first_paid_at,created_at FROM affiliate_referrals WHERE affiliate_id=$1 ORDER BY id DESC LIMIT 500`
    : `SELECT id,first_paid_at,attributed_at FROM partner_customers WHERE partner_id=$1 ORDER BY id DESC LIMIT 500`, [b])).rows : [];
  const leads = p === "business" && b && canSell ? (await pool.query(
    `SELECT id,name,email,phone,company,message,status,notes,assigned_user_id,created_at FROM partner_leads
      WHERE partner_id=$1 ${role==="sales"?"AND assigned_user_id=$2":""} ORDER BY id DESC LIMIT 500`,
    role==="sales"?[b,who.id]:[b])).rows : [];
  const payouts = financial ? (await pool.query(`SELECT id,amount_cents,currency,method,reference,status,created_at
    FROM programme_manual_payouts WHERE programme=$1 AND application_id=$2 ORDER BY id DESC LIMIT 500`, [p, id])).rows : [];
  // Retain historical business payout records, clearly separate from newly recorded offline payments.
  if (financial && p === "business" && b) {
    const old = (await pool.query("SELECT id,amount_cents,currency,method,reference,status,created_at FROM partner_payouts WHERE partner_id=$1 ORDER BY id DESC LIMIT 500", [b])).rows;
    payouts.push(...old.map(row => ({ ...row, id: `legacy-${row.id}` })));
  }
  const members = p === "business" && manage ? (await pool.query(`SELECT m.id,m.user_id,u.email,m.role,m.status
    FROM programme_members m JOIN users u ON u.id=m.user_id WHERE m.application_id=$1 ORDER BY m.id`, [id])).rows : [];
  const invitations = p === "business" && manage ? (await pool.query(`SELECT id,email,role,
    CASE WHEN status='pending' AND expires_at<now() THEN 'expired' ELSE status END AS status,expires_at
    FROM programme_invitations WHERE application_id=$1 ORDER BY id DESC LIMIT 100`, [id])).rows : [];
  const emails = manage ? (await pool.query(`SELECT id,recipient,subject,state,created_at,attempted_at
    FROM programme_mail_jobs WHERE programme=$1 AND application_id=$2 ${founder ? "" : "AND recipient=$3"}
    ORDER BY id DESC LIMIT 100`, founder ? [p, id] : [p, id, who.email])).rows : [];
  const audit = manage ? (await pool.query(`SELECT id,action,detail,created_at FROM programme_events
    WHERE programme=$1 AND application_id=$2 ORDER BY id DESC LIMIT 100`, [p, id])).rows : [];
  const applicationFields=p==="affiliate"
    ? ["id","full_name","email","phone","country","promotion_method","social_media","created_at"]
    : ["id","company_name","contact_name","email","phone","website","country","country_name","city","team_size","current_customers",
      "years_in_business","services_offered","why_partner","desired_tier","created_at"];
  const submittedApplication=role==="owner"?Object.fromEntries(applicationFields.map(key=>[key,app[key]??null])):null;
  return { workspace: await workspace(pool, p, app, role), application:submittedApplication, customers, commissions, leads, payouts, members, invitations,
    emails, audit, resources, truncated: commissions.length === 500 || customers.length === 500 || leads.length === 500 || payouts.length >= 500 };
}

export async function founderList(p: Programme, input: Record<string, any>) {
  const values: any[] = [];
  const bind = (v: unknown) => { values.push(v); return `$${values.length}`; };
  const status=p==="business"
    ? "CASE WHEN a.status='approved' THEN COALESCE(NULLIF(partner_state.status,'active'),'approved') ELSE a.status END"
    : "a.status";
  const joins=p==="business"?`LEFT JOIN LATERAL(SELECT status FROM partners
    WHERE application_id=a.id ORDER BY id LIMIT 1) partner_state ON true`:"";
  const where: string[] = ["true"];
  if (input.q) {
    const q = bind(`%${String(input.q).slice(0,150).replace(/[\\%_]/g,"\\$&")}%`);
    where.push(`(a.${tables[p].name} ILIKE ${q} OR a.email ILIKE ${q} OR a.id::text=${bind(String(input.q))})`);
  }
  if (input.status) where.push(`${status}=${bind(String(input.status).slice(0,40))}`);
  for (const [k, op] of [["from", ">="], ["to", "<"]] as const) {
    if (input[k]) {
      if (typeof input[k]!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(input[k]) || !Number.isFinite(Date.parse(input[k])) ||
        new Date(input[k]).toISOString().slice(0,10)!==input[k])
        throw Object.assign(new Error("Use a valid YYYY-MM-DD date."), { status: 400 });
      where.push(`a.created_at ${op} ${bind(input[k])}::date${k === "to" ? "+interval '1 day'" : ""}`);
    }
  }
  const filter = `FROM ${tables[p].app} a ${joins} WHERE ${where.join(" AND ")}`;
  const { rows: totals } = await pool.query(`SELECT count(*)::int AS applications,
    count(*) FILTER(WHERE ${status} IN('pending','information_required'))::int AS pending,
    count(*) FILTER(WHERE ${status}='approved')::int AS approved,
    count(*) FILTER(WHERE ${status}='rejected')::int AS rejected,
    count(*) FILTER(WHERE ${status}='approved')::int AS active,
    count(*) FILTER(WHERE ${status}='suspended')::int AS suspended ${filter}`, values);
  const page = Math.max(1, Math.min(100000, Number(input.page) || 1)) | 0;
  const { rows } = await pool.query(`SELECT a.id ${filter} ORDER BY a.id DESC LIMIT 25 OFFSET $${values.length+1}`, [...values, (page-1)*25]);
  const items = [];
  for (const row of rows) items.push(await workspace(pool, p, await application(pool,p,row.id), "owner"));
  const selected = `(SELECT a.id ${filter})`;
  const commissionScope = p === "affiliate" ? `WHERE c.affiliate_id IN ${selected}`
    : `WHERE c.partner_id IN(SELECT p.id FROM partners p WHERE p.application_id IN ${selected})`;
  const finance = moneyRows((await pool.query(financeSql(p,commissionScope),values)).rows);
  const reportStats = p === "affiliate"
    ? (await pool.query(`SELECT COALESCE(sum(clicks),0)::int clicks,COALESCE(sum(referral_count),0)::int signups,
      COALESCE(sum(converted_count),0)::int AS "payingCustomers" ${filter}`,values)).rows[0]
    : (await pool.query(`SELECT (SELECT COALESCE(sum(clicks),0)::int FROM programme_applications
      WHERE programme='business' AND application_id IN ${selected}) clicks,count(*)::int signups,count(first_paid_at)::int AS "payingCustomers"
      FROM partner_customers WHERE partner_id IN(SELECT id FROM partners WHERE application_id IN ${selected})`,values)).rows[0];
  const mail = (await pool.query(`SELECT count(*) FILTER(WHERE state='queued')::int AS "emailsPending",
    count(*) FILTER(WHERE state IN('sending','uncertain'))::int AS "emailsUncertain"
    FROM programme_mail_jobs WHERE programme='${p}' AND application_id IN ${selected}`,values)).rows[0];
  return { items,total:totals[0].applications,page,pageSize:25,stats:{...totals[0],...reportStats,finance,...mail},
    checkedAt:new Date().toISOString(),rangeBasis:"Application submission date; financial totals cover those applications." };
}
