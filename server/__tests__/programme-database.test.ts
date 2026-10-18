// @vitest-environment node
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { Pool, type PoolClient } from "pg";
const state=vi.hoisted(()=>({client:null as PoolClient|null}));
vi.mock("../db",()=>({pool:{
  query:(...args:any[]) => (state.client!.query as any)(...args),
  connect:async()=>({query:(...args:any[])=>(state.client!.query as any)(...args),release:()=>{}}),
}}));
vi.mock("../mailer",()=>({sendProgrammeEmail:vi.fn().mockResolvedValue(true)}));
import { acceptInvitation,changeMember,inviteMember,manualPayout,review,reverseCommission,submitApplication,updateProfile } from "../programmes/actions";
import { access,csv,hash,identity } from "../programmes/core";
import { details,founderList,myWorkspaces } from "../programmes/data";
import { creditProgrammePayment } from "../programmes/billing";
import { deliverProgrammeMail } from "../programmes/mail";
import { sendProgrammeEmail } from "../mailer";

// Real SQL acceptance in isolated session-local tables, never real customer rows.
// CI without this schema uses the separately mocked route/security tests.
describe.skipIf(!process.env.DATABASE_URL || !!process.env.CI)("programme SQL acceptance — temporary tables only",()=>{
  const db=new Pool({connectionString:process.env.DATABASE_URL,max:1});
  const tables=["users","affiliate_applications","affiliate_referrals","affiliate_commissions","partner_applications",
    "partners","partner_customers","partner_commissions","partner_leads","partner_payouts","payments",
    "programme_applications","programme_members","programme_invitations","programme_events","programme_mail_jobs",
    "programme_manual_payouts","programme_payout_commissions","programme_commission_reversals","programme_commission_payments"];
  beforeAll(async()=>{
    state.client=await db.connect();
    for(const table of tables){
      await state.client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`);
      const serial=(await state.client.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND column_default LIKE 'nextval%'`,[table])).rows;
      for(const {column_name:col} of serial){
        // Override copied public sequence defaults; not even their counters change.
        await state.client.query(`CREATE TEMP SEQUENCE local_${table}_${col}`);
        await state.client.query(`ALTER TABLE pg_temp.${table} ALTER COLUMN ${col} SET DEFAULT nextval('pg_temp.local_${table}_${col}')`);
      }
    }
    await state.client.query(`INSERT INTO users(id,email,email_verified) VALUES
      ('owner','owner@example.invalid',now()),('individual','individual@example.invalid',now()),
      ('staff','staff@example.invalid',now()),('finance','finance@example.invalid',now()),
      ('outsider','outsider@example.invalid',now()),('buyer','buyer@example.invalid',now()),
      ('unverified','unverified@example.invalid',NULL)`);
  },30000);
  afterAll(async()=>{state.client?.release();await db.end();});
  it("completes application → notification queue → verified ownership → team → single-beneficiary earnings → confirmed manual payout",async()=>{
    const owner={id:"owner",email:"owner@example.invalid"},staff={id:"staff",email:"staff@example.invalid"};
    const individual={id:"individual",email:"individual@example.invalid"};
    const previous=process.env.SESSION_SECRET;
    process.env.SESSION_SECRET="isolated-test-encryption-key-not-a-real-secret";
    try{
      expect(await submitApplication("affiliate",{fullName:"Individual Example",email:individual.email,payoutMethod:"mobile_money"},"founder@example.invalid"))
        .toMatchObject({success:true,status:"pending",emailStatus:"queued"});
      expect(await submitApplication("business",{companyName:"Example Company",contactName:"Example Owner",email:owner.email,
        country:"UG",registrationCountry:"UG",registrationNumber:"EXAMPLE-REG-123",payoutMethod:"bank"},"founder@example.invalid"))
        .toMatchObject({success:true,status:"pending"});
      const queued=(await state.client!.query("SELECT recipient,state,encrypted_payload FROM programme_mail_jobs")).rows;
      expect(queued).toHaveLength(4);
      expect(queued.filter(j=>j.recipient==="founder@example.invalid")).toHaveLength(2);
      expect(queued.every(j=>j.state==="queued"&&!j.encrypted_payload.includes("Application"))).toBe(true);
      const business=(await myWorkspaces(owner)).workspaces[0],affiliate=(await myWorkspaces(individual)).workspaces[0];
      const bid=business.applicationId,aid=affiliate.applicationId;
      expect(business).toMatchObject({status:"pending",role:"owner",referralLink:null,payoutMethod:"bank"});
      await expect(identity({user:{claims:{sub:"unverified",email:owner.email}}})).rejects.toMatchObject({status:403});
      await expect(access(state.client!,"business",bid,{id:"outsider",email:"outsider@example.invalid"})).rejects.toMatchObject({status:404});
      await expect(review("business",bid,"founder",{decision:"approved",tier:"premier"})).rejects.toMatchObject({status:400});
      await review("business",bid,"founder",{decision:"information_required",notes:"Please confirm the company registration."});
      await updateProfile("business",bid,owner,{payoutMethod:"bank",response:"Registration information confirmed."});
      await review("business",bid,"founder",{decision:"approved",tier:"authorized",registrationVerified:true});
      await review("affiliate",aid,"founder",{decision:"approved"});
      const bdetail=await details("business",bid,owner);
      expect(bdetail.workspace).toMatchObject({status:"approved",registrationStatus:"verified",commissionPercent:20,role:"owner"});
      expect(bdetail.workspace.referralLink).toContain("?ref=");
      expect((await state.client!.query("SELECT user_id FROM partners WHERE application_id=$1",[bid])).rows[0].user_id).toBe(owner.id);
      await expect(updateProfile("business",bid,owner,{registrationNumber:"DIFFERENT"})).rejects.toMatchObject({status:409});
      await inviteMember(bid,owner,{email:staff.email,role:"sales"});
      const token="a".repeat(64); // Replace only the isolated invitation hash for deterministic acceptance.
      await state.client!.query("UPDATE programme_invitations SET token_hash=$1 WHERE email=$2",[hash(token),staff.email]);
      await expect(acceptInvitation({id:"outsider",email:"outsider@example.invalid"},{token})).rejects.toMatchObject({status:403});
      await acceptInvitation(staff,{token});
      await expect(acceptInvitation(staff,{token})).rejects.toMatchObject({status:409});
      await expect(inviteMember(bid,staff,{email:"finance@example.invalid",role:"finance"})).rejects.toMatchObject({status:403});
      expect((await details("business",bid,staff)).commissions).toEqual([]);
      expect((await details("business",bid,staff)).workspace.stats.finance).toEqual([]);
      const mid=(await state.client!.query("SELECT id FROM programme_members WHERE user_id='staff'")).rows[0].id;
      await changeMember(bid,Number(mid),owner,{status:"removed"});
      await expect(details("business",bid,staff)).rejects.toMatchObject({status:404});
      const partner=(await state.client!.query("SELECT id FROM partners WHERE application_id=$1",[bid])).rows[0];
      // Two competing attribution records: earliest valid attribution wins exactly once.
      await state.client!.query("INSERT INTO affiliate_referrals(affiliate_id,referred_user_id,referred_email,created_at) VALUES($1,'buyer','buyer@example.invalid',now()-interval '1 day')",[aid]);
      await state.client!.query("INSERT INTO partner_customers(partner_id,user_id) VALUES($1,'buyer')",[partner.id]);
      const payment=(await state.client!.query("INSERT INTO payments(user_id,plan,amount,currency,status,merchant_reference) VALUES('buyer','pro',100,'USD','completed','isolated-payment') RETURNING id")).rows[0];
      await creditProgrammePayment(payment.id);await creditProgrammePayment(payment.id);
      expect((await state.client!.query("SELECT * FROM programme_commission_payments")).rows).toHaveLength(1);
      expect((await state.client!.query("SELECT id FROM affiliate_commissions")).rows).toHaveLength(1);
      expect((await state.client!.query("SELECT id FROM partner_commissions")).rows).toHaveLength(0);
      const commission=(await state.client!.query("SELECT * FROM affiliate_commissions")).rows[0];
      expect(Number(commission.amount_cents)).toBe(1000);
      await expect(manualPayout("affiliate",aid,"founder",{currency:"USD",commissionIds:[commission.id],method:"mobile_money",reference:"TEST-123"})).rejects.toThrow();
      await expect(manualPayout("affiliate",aid,"founder",{currency:"UGX",commissionIds:[commission.id],method:"mobile_money",reference:"TEST-123",confirmation:"PAID MANUALLY"})).rejects.toMatchObject({status:409});
      await manualPayout("affiliate",aid,"founder",{currency:"USD",commissionIds:[commission.id],method:"mobile_money",reference:"TEST-123",confirmation:"PAID MANUALLY"});
      await expect(manualPayout("affiliate",aid,"founder",{currency:"USD",commissionIds:[commission.id],method:"bank",reference:"TEST-DUP",confirmation:"PAID MANUALLY"})).rejects.toMatchObject({status:409});
      expect((await state.client!.query("SELECT * FROM programme_manual_payouts")).rows).toHaveLength(1);
      await reverseCommission("affiliate",aid,commission.id,"founder",{reason:"Customer refund recorded offline."});
      const final=await details("affiliate",aid,individual);
      expect(final.workspace.stats.finance[0]).toMatchObject({currency:"USD",earnedCents:0,paidCents:1000,reversedCents:1000});
      expect(final.payouts).toHaveLength(1); // Reversal does not pretend cash was refunded.
      const report=await founderList("business",{q:"Example",status:"approved",from:"2020-01-01",to:"2099-01-01"});
      expect(report.total).toBe(1);
      expect(report.items[0]).toMatchObject({registrationNumber:"EXAMPLE-REG-123"});
      expect(csv([{reference:"=HYPERLINK(\"evil\")",currency:"USD"}])).toContain("'=HYPERLINK");
      expect(JSON.stringify(final)).not.toMatch(/portal_token|encrypted_payload|token_hash/);
      vi.mocked(sendProgrammeEmail).mockResolvedValue(false);
      await deliverProgrammeMail();
      const attempts=vi.mocked(sendProgrammeEmail).mock.calls.length;
      await deliverProgrammeMail();await deliverProgrammeMail();
      const remaining=(await state.client!.query("SELECT count(*)::int n FROM programme_mail_jobs WHERE state='queued'")).rows[0].n;
      expect(remaining).toBe(0);
      const completedCalls=vi.mocked(sendProgrammeEmail).mock.calls.length;
      await deliverProgrammeMail();
      expect(vi.mocked(sendProgrammeEmail).mock.calls).toHaveLength(completedCalls);
      expect(attempts).toBeGreaterThan(0);
      expect((await state.client!.query("SELECT count(*)::int n FROM programme_mail_jobs WHERE state='uncertain'")).rows[0].n).toBeGreaterThan(0);
    }finally{
      if(previous===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=previous;
    }
  },30000);
});
