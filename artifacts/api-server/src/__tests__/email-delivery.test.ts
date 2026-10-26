// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { EMAIL_DELIVERY_SCHEMA } from "../email-delivery-schema";
const state=vi.hoisted(()=>({client:null as any}));
vi.mock("../db",()=>({pool:{
  query:(...args:any[])=>state.client.query(...args),
  connect:async()=>({query:(...args:any[])=>state.client.query(...args),release(){}}),
}}));
import { reserveEmailSend, settleEmailSend, emailPayloadHash } from "../email-delivery";

describe.skipIf(!process.env.DATABASE_URL)("email request ledger on isolated PostgreSQL temporary tables",()=>{
  beforeAll(async()=>{
    state.client=new Client({connectionString:process.env.DATABASE_URL});
    await state.client.connect();
    // Every referenced table and serial sequence is session-local. No ordinary
    // application fixtures or background-mail triggers can observe these rows.
    await state.client.query(`
      CREATE TEMP TABLE users(id varchar PRIMARY KEY);
      CREATE TEMP TABLE email_projects(id integer PRIMARY KEY,user_id varchar);
      CREATE TEMP TABLE email_api_keys(id integer PRIMARY KEY,user_id varchar,monthly_limit integer,emails_sent_month integer,is_active boolean);
      CREATE TEMP TABLE email_key_state(key_id integer PRIMARY KEY,project_id integer,quota_key_id integer,revoked_at timestamptz);
      CREATE TEMP TABLE integration_project_migrations(name text PRIMARY KEY);
    `);
    await state.client.query(EMAIL_DELIVERY_SCHEMA.replaceAll("CREATE TABLE IF NOT EXISTS","CREATE TEMP TABLE IF NOT EXISTS")
      .replace("CREATE INDEX IF NOT EXISTS email_secret_preview ON email_api_keys(secret_key_preview);",""));
  });
  afterAll(async()=>{await state.client?.end();});
  beforeEach(async()=>{
    await state.client.query(`TRUNCATE email_send_requests,email_quota_periods,email_key_state,email_api_keys,email_projects,users CASCADE;
      INSERT INTO users VALUES('owner'),('other');
      INSERT INTO email_projects VALUES(1,'owner'),(2,'other');
      INSERT INTO email_api_keys VALUES(1,'owner',3,0,true),(2,'owner',3,0,true),(3,'other',3,0,true);
      INSERT INTO email_key_state(key_id,project_id,quota_key_id) VALUES(1,1,1),(2,1,1),(3,2,3);`);
  });
  const input=(changes={})=>({userId:"owner",keyId:1,projectId:1,quotaKeyId:1,idempotencyKey:"test-request-1",
    payloadHash:emailPayloadHash({text:"test"}),recipientCount:2,exempt:false,...changes});
  it("reserves recipients once, replays the same result and blocks content changes",async()=>{
    const first=await reserveEmailSend(input());
    expect(first.status).toBe("pending");
    const second=await reserveEmailSend(input());
    expect(second).toMatchObject({id:first.id,replayed:true});
    expect((await state.client.query("SELECT used FROM email_quota_periods")).rows[0].used).toBe(2);
    await expect(reserveEmailSend(input({payloadHash:"different"}))).rejects.toMatchObject({status:409});
    await settleEmailSend(first.id,"owner","accepted","provider-1");
    expect(await reserveEmailSend(input())).toMatchObject({status:"accepted",messageId:"provider-1",replayed:true});
  });
  it("enforces the shared rotated-key allowance before provider calls",async()=>{
    await reserveEmailSend(input());
    await expect(reserveEmailSend(input({keyId:2,idempotencyKey:"second"}))).rejects.toMatchObject({status:429});
    expect((await state.client.query("SELECT count(*)::int AS n FROM email_send_requests")).rows[0].n).toBe(1);
  });
  it("refunds only definite rejection once and keeps uncertain reservations",async()=>{
    const first=await reserveEmailSend(input());
    await settleEmailSend(first.id,"owner","rejected",undefined,"EMAIL_PROVIDER_REJECTED");
    await settleEmailSend(first.id,"owner","rejected");
    expect((await state.client.query("SELECT used FROM email_quota_periods")).rows[0].used).toBe(0);
    const next=await reserveEmailSend(input({idempotencyKey:"next"}));
    await settleEmailSend(next.id,"owner","uncertain");
    expect((await state.client.query("SELECT used FROM email_quota_periods")).rows[0].used).toBe(2);
    expect(await reserveEmailSend(input({idempotencyKey:"next"}))).toMatchObject({status:"uncertain",replayed:true});
  });
  it("starts a fresh UTC month without erasing the previous month",async()=>{
    await state.client.query(`INSERT INTO email_quota_periods VALUES(1,(date_trunc('month',now() AT TIME ZONE 'UTC')-interval '1 month')::date,3)`);
    await reserveEmailSend(input());
    expect((await state.client.query("SELECT used FROM email_quota_periods ORDER BY period")).rows.map((r:any)=>r.used)).toEqual([3,2]);
  });
  it("rejects foreign owners, projects, quota groups and inactive keys",async()=>{
    for(const changes of [{userId:"other"},{projectId:2},{quotaKeyId:3}])
      await expect(reserveEmailSend(input(changes))).rejects.toMatchObject({status:401});
    await state.client.query("UPDATE email_api_keys SET is_active=false WHERE id=1");
    await expect(reserveEmailSend(input())).rejects.toMatchObject({status:401});
    expect((await state.client.query("SELECT count(*)::int AS n FROM email_send_requests")).rows[0].n).toBe(0);
  });
  it("allows founder secret access beyond customer quota while still recording usage",async()=>{
    await reserveEmailSend(input({recipientCount:5,exempt:true}));
    expect((await state.client.query("SELECT used FROM email_quota_periods")).rows[0].used).toBe(5);
  });
});
