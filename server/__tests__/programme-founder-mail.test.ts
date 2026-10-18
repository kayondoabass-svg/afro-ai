// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),send:vi.fn()}));
vi.mock("../db",()=>({pool:{query:mocks.query}}));
vi.mock("../mailer",()=>({sendProgrammeEmail:mocks.send}));
import {queueMissingFounderApplicationMail} from "../programmes/mail";
import {hash} from "../programmes/core";

beforeEach(()=>{
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET","synthetic-programme-notification-test-secret");
});
afterEach(()=>vi.unstubAllEnvs());
describe("missing founder application notifications",()=>{
  it("queues encrypted founder-only notifications with application review links",async()=>{
    mocks.query.mockImplementation(async(sql:string,args:unknown[])=>({
      rows:sql.startsWith("SELECT a.id")?[{id:3,display_name:"Example applicant",email:"applicant@example.invalid"}]:[],
    }));
    await queueMissingFounderApplicationMail({query:mocks.query} as any,"founder@example.invalid");
    const inserts=mocks.query.mock.calls.filter(([sql])=>sql.startsWith("INSERT INTO programme_mail_jobs"));
    expect(inserts).toHaveLength(2);
    for(const [sql,args] of inserts){
      expect(sql).toContain("ON CONFLICT(event_key) DO NOTHING");
      expect(args[2]).toBe(`${args[0]}:3:application-founder:${hash("founder@example.invalid")}`);
      expect(args[3]).toBe("founder@example.invalid");
      expect(args[5]).not.toContain("Example applicant");
    }
    const reads=mocks.query.mock.calls.filter(([sql])=>sql.startsWith("SELECT a.id"));
    expect(reads).toHaveLength(2);
    for(const [sql] of reads){
      expect(sql).toContain("a.status='pending'");
      expect(sql).toContain("NOT EXISTS");
      expect(sql).toContain("LIMIT 25");
      expect(sql).not.toMatch(/m\.state\s*=/);
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not queue anything when every pending application already has a notification",async()=>{
    mocks.query.mockResolvedValue({rows:[]});
    await queueMissingFounderApplicationMail({query:mocks.query} as any,"founder@example.invalid");
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

it.skipIf(!process.env.DATABASE_URL||!!process.env.CI)("catches up legacy pending applications without duplicating sent or uncertain notifications, using temporary tables only",async()=>{
  const {Pool}=await import("pg");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
  const client=await pool.connect();
  try {
    await client.query(`CREATE TEMP TABLE affiliate_applications(id integer PRIMARY KEY,full_name text,email text,status text);
      CREATE TEMP TABLE partner_applications(id integer PRIMARY KEY,company_name text,email text,status text);
      CREATE TEMP TABLE programme_mail_jobs(programme text,application_id integer,event_key text UNIQUE,
        recipient text,subject text,encrypted_payload text,state text DEFAULT 'queued');
      INSERT INTO affiliate_applications SELECT g,'Example affiliate','affiliate@example.invalid','pending' FROM generate_series(1,27) g;
      INSERT INTO partner_applications VALUES(1,'Example business','business@example.invalid','pending'),
        (2,'Already reviewed business','reviewed@example.invalid','approved');`);
    const db={query:client.query.bind(client)};
    await queueMissingFounderApplicationMail(db as any,"founder@example.invalid");
    expect(Number((await client.query("SELECT count(*) FROM programme_mail_jobs")).rows[0].count)).toBe(26);
    await queueMissingFounderApplicationMail(db as any,"founder@example.invalid");
    expect(Number((await client.query("SELECT count(*) FROM programme_mail_jobs")).rows[0].count)).toBe(28);
    await client.query("UPDATE programme_mail_jobs SET state=CASE WHEN application_id%2=0 THEN 'sent' ELSE 'uncertain' END");
    await Promise.all([queueMissingFounderApplicationMail(db as any,"founder@example.invalid"),
      queueMissingFounderApplicationMail(db as any,"founder@example.invalid")]);
    expect(Number((await client.query("SELECT count(*) FROM programme_mail_jobs")).rows[0].count)).toBe(28);
    expect((await client.query("SELECT DISTINCT recipient FROM programme_mail_jobs")).rows).toEqual([{recipient:"founder@example.invalid"}]);
    expect(mocks.send).not.toHaveBeenCalled();
  } finally {client.release();await pool.end();}
},20000);
