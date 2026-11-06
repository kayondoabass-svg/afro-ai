// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "crypto";
const mocks = vi.hoisted(() => ({ database: null as any, send: vi.fn(), delivery: vi.fn() }));
vi.mock("../db", () => ({ pool: {
  query: (...args: any[]) => mocks.database.query(...args),
  connect: () => mocks.database.connect(),
} }));
vi.mock("../email-provider", async importOriginal => {
  const original = await importOriginal<typeof import("../email-provider")>();
  return { ...original, sendEmail: mocks.send };
});
vi.mock("../../shared/mail-delivery-status", () => ({ checkResendDelivery: mocks.delivery }));
import { APP_SUSPENSION_SCHEMA, changeAppStatus, expireFreeHosting, processAppSuspensionEmails } from "../app-suspension";
import { FREE_HOSTING_EXPIRY_REASON, suspensionNotice, suspensionReason } from "../app-suspension-policy";
import { founderAppDetails } from "../founder-app-details";

describe("suspension messages", () => {
  it("requires an explicit reason and preserves the daily free tier", () => {
    expect(() => suspensionReason("")).toThrow();
    expect(() => suspensionReason("a".repeat(1001))).toThrow();
    expect(suspensionReason("  Review needed  ")).toBe("Review needed");
    const message = suspensionNotice({ id: 12, title: "Saved app" }, FREE_HOSTING_EXPIRY_REASON, new Date("2026-11-01T10:00:00Z"));
    expect(message.text).toContain("not been deleted");
    expect(message.text).toContain("midnight reset remain unchanged");
    expect(message.text).toContain("2026-11-01T10:00:00.000Z");
    expect(suspensionNotice({ id: 12, title: "Saved app" }, "Safety review", new Date()).text).toContain("Payment does not override");
  });
});
const suite = process.env.DATABASE_URL && !process.env.CI &&
  process.env.DATABASE_URL !== "postgres://test:test@localhost:5432/test" ? describe : describe.skip;
suite("app suspension isolated PostgreSQL lifecycle", () => {
  const schema = `suspension_test_${randomUUID().replaceAll("-", "")}`;
  let admin: Pool;
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    mocks.database = new Pool({ connectionString: process.env.DATABASE_URL, max: 6, options: `-c search_path=${schema}` });
    await mocks.database.query(`
      CREATE TABLE users(id text PRIMARY KEY,email text,plan text,first_name text,last_name text);
      CREATE TABLE published_apps(id serial PRIMARY KEY,user_id text,title text,subdomain text,custom_domain text,
        app_status text DEFAULT 'active',suspend_reason text,suspended_at timestamp,
        created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now(),html_content text);
      CREATE TABLE projects(id serial PRIMARY KEY,user_id text,name text,type text,status text);
      CREATE TABLE conversations(id serial PRIMARY KEY,user_id text,project_id integer);
      CREATE TABLE messages(id serial PRIMARY KEY,conversation_id integer,role text,content text);
      CREATE TABLE payments(id serial PRIMARY KEY,user_id text,plan text,amount numeric,currency text,status text,payment_method text,created_at timestamp DEFAULT now());
      CREATE TABLE ussd_subscriptions(id serial PRIMARY KEY,user_id text,plan text,status text,activated_at timestamp,expires_at timestamp,created_at timestamp);
      CREATE TABLE ussd_apps(id serial PRIMARY KEY,user_id text,name text,is_active boolean,sessions_used integer,created_at timestamp,api_key text);
    `);
    await mocks.database.query(APP_SUSPENSION_SCHEMA);
  });
  afterAll(async () => {
    await mocks.database?.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ messageId: "provider-test", provider: "resend" });
    mocks.delivery.mockResolvedValue({ status: "delivered", error: null });
    await mocks.database.query("TRUNCATE users,published_apps,projects,conversations,messages,payments,ussd_subscriptions,ussd_apps,app_status_events RESTART IDENTITY");
    await mocks.database.query(`INSERT INTO users(id,email,plan) VALUES
      ('owner','suspension@example.invalid','starter'),('other','other@example.invalid','starter'),
      ('founder','kayondoabass@gmail.com','starter'),('paid','paid@example.invalid','pro');
      INSERT INTO published_apps(user_id,title,subdomain,created_at,html_content) VALUES
      ('owner','Saved app','saved-app',now()-interval '31 days','KEEP SOURCE'),
      ('owner','Recent app','recent-app',now()-interval '1 day','RECENT'),
      ('founder','Founder app','founder-app',now()-interval '31 days','FOUNDER'),
      ('paid','Paid app','paid-app',now()-interval '31 days','PAID');
      INSERT INTO projects(user_id,name) VALUES('owner','Saved project');
    `);
  });
  it("expires only old free public hosting, keeps apps and projects, and queues once under concurrency", async () => {
    const counts = await Promise.all([expireFreeHosting(), expireFreeHosting()]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    const apps = (await mocks.database.query("SELECT * FROM published_apps ORDER BY id")).rows;
    expect(apps).toHaveLength(4);
    expect(apps[0]).toMatchObject({ app_status: "suspended", suspend_reason: FREE_HOSTING_EXPIRY_REASON, html_content: "KEEP SOURCE" });
    expect(apps.slice(1).every((a: any) => a.app_status === "active")).toBe(true);
    expect((await mocks.database.query("SELECT * FROM projects")).rows).toHaveLength(1);
    expect((await mocks.database.query("SELECT * FROM app_status_events")).rows).toHaveLength(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("sends only to the actual owner and exposes real delivery, not acceptance as delivery", async () => {
    await expireFreeHosting();
    mocks.delivery.mockResolvedValueOnce({ status: "sent", error: null });
    await processAppSuspensionEmails();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: "suspension@example.invalid", idempotencyKey: "app-suspension-1" });
    expect((await mocks.database.query("SELECT email_status FROM app_status_events")).rows[0].email_status).toBe("sent");
    await processAppSuspensionEmails();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect((await mocks.database.query("SELECT email_status FROM app_status_events")).rows[0].email_status).toBe("delivered");
  });
  it("does not retry uncertain emails or expose raw provider errors", async () => {
    await changeAppStatus({ appId: 2 }, "suspended", "Review requested", "founder-id");
    mocks.send.mockRejectedValue(new Error("secret-key https://private.test/reset?token=private"));
    await processAppSuspensionEmails();
    await processAppSuspensionEmails();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const event = (await mocks.database.query("SELECT * FROM app_status_events")).rows[0];
    expect(event.email_status).toBe("uncertain");
    expect(event.email_error).not.toMatch(/secret-key|private.test|token=/);
    expect(event.actor_id).toBe("founder-id");
  });
  it("rolls back the suspension if durable history/notification queue cannot be written", async () => {
    await mocks.database.query("ALTER TABLE app_status_events ADD CONSTRAINT simulate_outbox_failure CHECK(action <> 'suspended')");
    try {
      await expect(changeAppStatus({ appId: 2 }, "suspended", "Review requested", "founder-id")).rejects.toThrow();
      expect((await mocks.database.query("SELECT app_status FROM published_apps WHERE id=2")).rows[0].app_status).toBe("active");
    } finally { await mocks.database.query("ALTER TABLE app_status_events DROP CONSTRAINT simulate_outbox_failure"); }
  });
  it("shows only this app and its owner's related metadata, never unrelated users, HTML or keys", async () => {
    await mocks.database.query(`INSERT INTO payments(user_id,plan) VALUES('owner','pro'),('other','private-plan');
      INSERT INTO ussd_apps(user_id,name,api_key) VALUES('owner','Gateway','NEVER_EXPOSE_KEY'),('other','OTHER PRIVATE APP','PRIVATE');
      INSERT INTO conversations(user_id,project_id) VALUES('owner',1);
      INSERT INTO messages(conversation_id,role,content) VALUES(1,'workbench-publication','{"publishedAppId":1,"projectId":1}');
    `);
    await expireFreeHosting();
    const details = await founderAppDetails(1);
    expect(details?.unavailableSections).toEqual([]);
    expect(details?.projects).toMatchObject([{ id: 1, name: "Saved project" }]);
    expect(details?.owner?.id).toBe("owner");
    expect(details?.payments).toHaveLength(1);
    expect(details?.ussdApps).toHaveLength(1);
    expect(details?.events).toHaveLength(1);
    expect(JSON.stringify(details)).not.toMatch(/private-plan|OTHER PRIVATE APP|NEVER_EXPOSE_KEY|KEEP SOURCE/);
    expect(await founderAppDetails(999999)).toBeNull();
  });
});
