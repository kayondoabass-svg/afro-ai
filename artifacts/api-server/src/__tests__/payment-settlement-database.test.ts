// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import { settlePayment } from "../payment-settlement";
import { PAYMENT_SCHEMA } from "../payment-schema";
import { lockDomainCheckout } from "../domain-checkout";
import { AUTH_BRANDING_SCHEMA } from "../auth-branding-schema";

// Isolated schema: no customer fixtures, provider requests, emails or public rows.
const suite = process.env.DATABASE_URL && !process.env.CI &&
  process.env.DATABASE_URL !== "postgres://test:test@localhost:5432/test" ? describe : describe.skip;
suite("payment settlement with PostgreSQL transactions and concurrent callbacks", () => {
  const schema = `checkout_test_${randomUUID().replaceAll("-", "")}`;
  let admin: Pool, database: Pool;
  const paid = { status_code: 1, merchant_reference: "order", amount: 5, currency: "USD", payment_method: "Mobile Money" };
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    database = new Pool({ connectionString: process.env.DATABASE_URL, max: 6, options: `-c search_path=${schema}` });
    await database.query(`
      CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,plan TEXT NOT NULL DEFAULT 'starter',payg_balance INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE payments(id SERIAL PRIMARY KEY,user_id TEXT,plan TEXT,amount NUMERIC,currency TEXT,merchant_reference TEXT UNIQUE,pesapal_tracking_id TEXT,status TEXT,payment_method TEXT,confirmation_code TEXT,purchase_details JSONB,completed_at TIMESTAMP);
      CREATE TABLE domain_orders(id SERIAL PRIMARY KEY,user_id TEXT,domain_name TEXT,years INTEGER,price_paid_cents INTEGER,pesapal_order_id TEXT,status TEXT);
      CREATE TABLE activity_logs(id SERIAL PRIMARY KEY,user_id TEXT,event_type TEXT,metadata JSONB);
      CREATE TABLE chatbot_subscriptions(id SERIAL PRIMARY KEY,user_id TEXT,plan TEXT,replies_limit INTEGER,bots_limit INTEGER,replies_used INTEGER,status TEXT);
      CREATE TABLE ussd_subscriptions(id SERIAL PRIMARY KEY,user_id TEXT,plan TEXT,status TEXT,expires_at TIMESTAMP);
      CREATE TABLE published_apps(id SERIAL PRIMARY KEY,user_id TEXT,app_status TEXT,suspended_at TIMESTAMP,suspend_reason TEXT,updated_at TIMESTAMP);
    `);
  });
  afterAll(async () => {
    await database?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    await database.query(AUTH_BRANDING_SCHEMA);
    await database.query("TRUNCATE auth_branding_subscriptions,auth_branding_audit RESTART IDENTITY");
    await database.query("TRUNCATE users,payments,domain_orders,activity_logs,chatbot_subscriptions,ussd_subscriptions,published_apps RESTART IDENTITY");
    await database.query("INSERT INTO users(id,email) VALUES('owner','checkout@example.invalid')");
    await database.query(`INSERT INTO payments(user_id,plan,amount,currency,merchant_reference,pesapal_tracking_id,status)
      VALUES('owner','payg-pack5',5,'USD','order','track','pending')`);
  });
  const settle = (pool: Pool, status = paid) => settlePayment(pool, "order", "track", status, () => false);
  it("activates Auth only once, without changing app-builder plan or credits",async()=>{
    await database.query(`UPDATE payments SET plan='auth-builder',purchase_details='{"category":"auth","projectId":"owned-project"}'`);
    const results=await Promise.all(Array.from({length:5},()=>settle(database)));
    expect(results.filter(r=>r.newlyCompleted)).toHaveLength(1);
    const sub=(await database.query("SELECT * FROM auth_branding_subscriptions")).rows[0];
    expect(sub).toMatchObject({user_id:"owner",plan:"builder",source:"payment",payment_id:1});
    expect(sub.expires_at.getTime()-Date.now()).toBeGreaterThan(29*86400000);
    expect((await database.query("SELECT plan,payg_balance FROM users")).rows[0]).toEqual({plan:"starter",payg_balance:0});
  });
  it("rolls Auth access back if final payment completion fails",async()=>{
    await database.query(`UPDATE payments SET plan='auth-business',purchase_details='{"category":"auth","projectId":"owned-project"}'`);
    await database.query("ALTER TABLE payments ADD CONSTRAINT auth_simulate_failure CHECK(status <> 'completed')");
    try {
      await expect(settle(database)).rejects.toThrow();
      expect((await database.query("SELECT * FROM auth_branding_subscriptions")).rows).toHaveLength(0);
    }finally{await database.query("ALTER TABLE payments DROP CONSTRAINT auth_simulate_failure");}
  });
  it("requires a server-created Auth project purchase snapshot",async()=>{
    await database.query("UPDATE payments SET plan='auth-scale'");
    await expect(settle(database)).rejects.toThrow("project association");
    expect((await database.query("SELECT status FROM payments")).rows[0].status).toBe("pending");
  });
  it("credits exactly once across six simultaneous IPN/callback/poll attempts", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => settle(database)));
    expect(results.filter(result => result.newlyCompleted)).toHaveLength(1);
    expect((await database.query("SELECT payg_balance,plan FROM users WHERE id='owner'")).rows[0]).toEqual({ payg_balance: 500, plan: "payg" });
    expect((await database.query("SELECT status FROM payments")).rows[0].status).toBe("completed");
  });
  it("rolls wallet and access back if saving final payment completion fails", async () => {
    await database.query("ALTER TABLE payments ADD CONSTRAINT simulate_write_failure CHECK(status <> 'completed')");
    try {
      await expect(settle(database)).rejects.toThrow();
      expect((await database.query("SELECT payg_balance,plan FROM users")).rows[0]).toEqual({ payg_balance: 0, plan: "starter" });
      expect((await database.query("SELECT status FROM payments")).rows[0].status).toBe("pending");
    } finally { await database.query("ALTER TABLE payments DROP CONSTRAINT simulate_write_failure"); }
    await settle(database);
    expect((await database.query("SELECT payg_balance FROM users")).rows[0].payg_balance).toBe(500);
  });
  it("rejects another order, wrong amount or wrong currency without granting anything", async () => {
    for (const patch of [{ amount: 1 }, { currency: "UGX" }, { merchant_reference: "another" }, { status_code: 0 }]) {
      await expect(settle(database, { ...paid, ...patch })).rejects.toThrow();
    }
    expect((await database.query("SELECT payg_balance FROM users")).rows[0].payg_balance).toBe(0);
  });
  it("preserves paid plans and rearms low-credit reminders after top-up", async () => {
    await database.query("UPDATE users SET plan='pro',payg_balance=400");
    await database.query(`INSERT INTO activity_logs(user_id,event_type,metadata) VALUES('owner','credits.low','{"active":true}')`);
    await settle(database);
    expect((await database.query("SELECT plan,payg_balance FROM users")).rows[0]).toEqual({ plan: "pro", payg_balance: 900 });
    expect((await database.query("SELECT metadata FROM activity_logs")).rows[0].metadata.active).toBe(false);
  });
  it("does not downgrade a founder while recording a purchased credit pack", async () => {
    await settlePayment(database, "order", "track", paid, () => true);
    expect((await database.query("SELECT plan,payg_balance FROM users")).rows[0]).toEqual({ plan: "starter", payg_balance: 500 });
  });
  it("recovers a tracking-ID persistence failure only from verified provider identity", async () => {
    await database.query("UPDATE payments SET pesapal_tracking_id=NULL");
    await settle(database);
    expect((await database.query("SELECT pesapal_tracking_id,status FROM payments")).rows[0]).toEqual({ pesapal_tracking_id: "track", status: "completed" });
  });
  it.each([["chatbot-business", "chatbot_subscriptions"], ["ussd-growth", "ussd_subscriptions"]])(
    "activates %s within the same transaction and does not duplicate subscriptions", async (plan, table) => {
      await database.query("UPDATE payments SET plan=$1", [plan]);
      await Promise.all([settle(database), settle(database)]);
      const rows = (await database.query(`SELECT * FROM ${table}`)).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("active");
      expect(rows[0].plan).toBe(plan.startsWith("ussd-") ? "growth" : plan);
    });
  it("activates a platform plan and reactivates its suspended apps", async () => {
    await database.query("UPDATE payments SET plan='pro'");
    await database.query("INSERT INTO published_apps(user_id,app_status,suspend_reason) VALUES('owner','suspended','quota')");
    await settle(database);
    expect((await database.query("SELECT plan FROM users")).rows[0].plan).toBe("pro");
    expect((await database.query("SELECT app_status,suspend_reason FROM published_apps")).rows[0]).toEqual({ app_status: "active", suspend_reason: null });
  });
  it("preserves a founder's Business plan during a platform purchase", async () => {
    await database.query("UPDATE users SET plan='business'");
    await database.query("UPDATE payments SET plan='pro'");
    await settlePayment(database, "order", "track", paid, () => true);
    expect((await database.query("SELECT plan FROM users")).rows[0].plan).toBe("business");
  });
  it("records a domain payment once without granting wallet credits or claiming registration succeeded", async () => {
    await database.query(`INSERT INTO domain_orders(user_id,domain_name,years,price_paid_cents,pesapal_order_id,status)
      VALUES('owner','example.com',2,500,'track','pending_payment')`);
    const snapshot = { packageName: "Domain: example.com", category: "domain", domainOrderId: 1, domainName: "example.com", registrationYears: 2 };
    await database.query("UPDATE payments SET plan='domain-registration',purchase_details=$1", [JSON.stringify(snapshot)]);
    const results = await Promise.all([settle(database), settle(database), settle(database)]);
    expect(results.filter(result => result.newlyCompleted)).toHaveLength(1);
    const payment = (await database.query("SELECT * FROM payments")).rows[0];
    expect(payment.purchase_details).toEqual(snapshot);
    expect(payment.completed_at).toBeInstanceOf(Date);
    expect((await database.query("SELECT status FROM domain_orders")).rows[0].status).toBe("pending_payment");
    expect((await database.query("SELECT payg_balance FROM users")).rows[0].payg_balance).toBe(0);
  });
  it("rejects linking a domain payment to another account's order", async () => {
    await database.query(`INSERT INTO domain_orders(user_id,domain_name,years,price_paid_cents,pesapal_order_id,status)
      VALUES('foreign','example.com',1,500,'track','pending_payment')`);
    await database.query(`UPDATE payments SET plan='domain-registration',
      purchase_details='{"category":"domain","domainOrderId":1,"domainName":"example.com","registrationYears":1}'`);
    await expect(settle(database)).rejects.toThrow("Domain purchase mismatch");
    expect((await database.query("SELECT status FROM payments")).rows[0].status).toBe("pending");
  });
  it("serializes domain checkout preparation across independent database connections", async () => {
    const release = await lockDomainCheckout(database, "owner:example.com");
    expect(release).toBeTypeOf("function");
    expect(await lockDomainCheckout(database, "owner:example.com")).toBeNull();
    await release!();
    const second = await lockDomainCheckout(database, "owner:example.com");
    expect(second).toBeTypeOf("function"); await second!();
  });
  it("reapplies additive setup without rewriting purchases or package snapshots", async () => {
    await database.query(PAYMENT_SCHEMA);
    await database.query(PAYMENT_SCHEMA);
    expect((await database.query("SELECT amount,status FROM payments")).rows[0]).toEqual({ amount: "5", status: "pending" });
  });
});
