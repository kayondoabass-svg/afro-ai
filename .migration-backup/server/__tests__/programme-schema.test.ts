// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
const state = vi.hoisted(() => ({ client: null as PoolClient | null }));
vi.mock("../db", () => ({ pool: {
  query: (...args: any[]) => (state.client!.query as any)(...args),
} }));
vi.mock("../mailer", () => ({ sendProgrammeEmail: vi.fn().mockResolvedValue(true) }));
import { prepareProgrammes } from "../programmes/schema";
import { legacyProgrammeSchema } from "../programmes/legacy-schema";
import { founderList } from "../programmes/data";
import { queueMissingFounderApplicationMail } from "../programmes/mail";
import { sendProgrammeEmail } from "../mailer";

it("initializes legacy prerequisites before upgrading commission tables in one atomic batch", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  await prepareProgrammes({ query } as any);
  expect(query).toHaveBeenCalledTimes(1);
  const sql = query.mock.calls[0][0] as string;
  for (const table of ["affiliate_commissions", "partner_commissions", "partner_leads"]) {
    expect(sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`)).toBeGreaterThan(-1);
    expect(sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`))
      .toBeLessThan(sql.indexOf(`ALTER TABLE ${table}`));
  }
  expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE)\s+(?:TABLE|FROM)\b/i);
});

// Every table and serial sequence is session-local. Nothing writes to public
// tables, queues real emails, or starts background reconciliation.
describe.skipIf(!process.env.DATABASE_URL || !!process.env.CI)("programme upgrade from incomplete legacy installations", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const temporary = (sql: string) => sql.replace(/CREATE TABLE IF NOT EXISTS /g, "CREATE TEMP TABLE IF NOT EXISTS ");
  const upgrade = () => prepareProgrammes({
    query: (sql: string) => state.client!.query(temporary(sql)),
  } as any);

  beforeAll(async () => { state.client = await pool.connect(); });
  beforeEach(async () => {
    vi.stubEnv("SESSION_SECRET", "temporary-programme-migration-test-secret");
    await state.client!.query(`
      CREATE TEMP TABLE users(id varchar PRIMARY KEY, email varchar, email_verified timestamp);
      CREATE TEMP TABLE payments(id serial PRIMARY KEY, status varchar);
    `);
  });
  afterEach(async () => {
    await state.client!.query("DISCARD TEMP");
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  afterAll(async () => { state.client?.release(); await pool.end(); });

  it("starts with no programme tables and can run again without errors", async () => {
    await upgrade();
    await upgrade();
    const { rows } = await state.client!.query(`SELECT
      to_regclass('pg_temp.affiliate_commissions') IS NOT NULL AS affiliate,
      to_regclass('pg_temp.partner_commissions') IS NOT NULL AS business,
      to_regclass('pg_temp.partner_leads') IS NOT NULL AS leads,
      to_regclass('pg_temp.programme_mail_jobs') IS NOT NULL AS mail,
      to_regclass('pg_temp.programme_applications') IS NOT NULL AS metadata`);
    expect(rows[0]).toEqual({ affiliate: true, business: true, leads: true, mail: true, metadata: true });
    expect((await state.client!.query("SELECT * FROM programme_mail_jobs")).rows).toEqual([]);
  });

  it("preserves three pending businesses, makes reviews readable and queues only their missing founder alerts", async () => {
    // Match the production legacy installation: affiliate applications exist,
    // but attribution/commission tables and these newer profile columns do not.
    await state.client!.query(`CREATE TEMP TABLE affiliate_applications(
      id serial PRIMARY KEY,full_name text NOT NULL,email varchar NOT NULL UNIQUE,
      phone varchar,country varchar,promotion_method text,social_media text,
      referral_code varchar NOT NULL UNIQUE,status varchar NOT NULL DEFAULT 'pending',
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO affiliate_applications(full_name,email,referral_code,status)
      VALUES('Legacy Affiliate','affiliate@example.invalid','PRESERVE-LEGACY','approved');`);
    const existing = legacyProgrammeSchema.match(/CREATE TABLE IF NOT EXISTS partner_applications \([\s\S]*?\n  \);/)![0];
    await state.client!.query(temporary(existing));
    await state.client!.query(`INSERT INTO partner_applications(company_name,contact_name,email,country,country_name)
      SELECT 'Example Business '||n,'Example Applicant','applicant'||n||'@example.invalid','UG','Uganda'
      FROM generate_series(1,3) n`);
    await upgrade();
    expect((await state.client!.query(`SELECT full_name,referral_code,status,portal_token,
      clicks,referral_count,converted_count,total_earned_cents,total_paid_cents FROM affiliate_applications`)).rows)
      .toEqual([{ full_name: "Legacy Affiliate", referral_code: "PRESERVE-LEGACY", status: "approved",
        portal_token: null, clicks: 0, referral_count: 0, converted_count: 0,
        total_earned_cents: 0, total_paid_cents: 0 }]);
    expect((await founderList("business", {})).total).toBe(3);
    expect((await state.client!.query("SELECT status FROM partner_applications")).rows)
      .toEqual([{ status: "pending" }, { status: "pending" }, { status: "pending" }]);
    await queueMissingFounderApplicationMail(state.client!, "founder@example.invalid");
    await queueMissingFounderApplicationMail(state.client!, "founder@example.invalid");
    const jobs = (await state.client!.query("SELECT programme,recipient,state FROM programme_mail_jobs")).rows;
    expect(jobs).toHaveLength(3);
    expect(jobs.every(j => j.programme === "business" && j.recipient === "founder@example.invalid" && j.state === "queued")).toBe(true);
    expect(sendProgrammeEmail).not.toHaveBeenCalled();
  });

  it("preserves old earnings and paid commissions without creating commissions for historical payments", async () => {
    await state.client!.query(temporary(legacyProgrammeSchema));
    await state.client!.query(`INSERT INTO affiliate_applications(full_name,email,referral_code,total_earned_cents,total_paid_cents)
      VALUES('Legacy Example','legacy@example.invalid','LEGACY-EXAMPLE',100,100);
      INSERT INTO affiliate_commissions(affiliate_id,base_amount_cents,amount_cents,period_month,status)
      VALUES(1,1000,100,'2026-10','paid');
      INSERT INTO payments(status) VALUES('completed'),('pending');`);
    await upgrade();
    await upgrade();
    expect((await state.client!.query("SELECT total_earned_cents,total_paid_cents FROM affiliate_applications")).rows)
      .toEqual([{ total_earned_cents: 100, total_paid_cents: 100 }]);
    expect((await state.client!.query("SELECT amount_cents,status FROM affiliate_commissions")).rows)
      .toEqual([{ amount_cents: 100, status: "paid" }]);
    expect((await state.client!.query("SELECT payment_id,programme,beneficiary_id FROM programme_commission_payments")).rows)
      .toEqual([{ payment_id: 1, programme: "legacy", beneficiary_id: 0 }]);
    expect((await state.client!.query("SELECT * FROM programme_mail_jobs")).rows).toEqual([]);
  });
});
