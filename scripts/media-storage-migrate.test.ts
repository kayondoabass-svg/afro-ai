// @vitest-environment node
import {createRequire} from "node:module";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {describe,expect,it,vi} from "vitest";
import {Pool} from "pg";
const {prepareMediaStorage,PROBE}=createRequire(import.meta.url)("./media-storage-migrate.cjs");

describe("explicit media storage preparation",()=>{
  const fixture=()=>{
    const client={query:vi.fn().mockResolvedValue({rows:[]}),release:vi.fn()};
    const db={query:vi.fn().mockResolvedValue({rows:[]}),connect:vi.fn().mockResolvedValue(client)};
    return {db,client};
  };
  it("uses read-only verification on prepared databases, including missing DDL privileges",async()=>{
    const {db}=fixture();
    expect(await prepareMediaStorage(db)).toEqual({changed:false});
    expect(db.query).toHaveBeenCalledWith(PROBE);
    expect(db.connect).not.toHaveBeenCalled();
  });
  it.each(["42P01","42703"])("applies additive migration for missing schema %s",async(code)=>{
    const {db,client}=fixture();db.query.mockRejectedValueOnce({code});
    expect(await prepareMediaStorage(db)).toEqual({changed:true});
    const sql=client.query.mock.calls[0][0];
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS media_jobs");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS lease_token");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE|UPDATE)\b/i);
    expect(client.query).toHaveBeenLastCalledWith(PROBE);
    expect(client.release).toHaveBeenCalledOnce();
  });
  it.each(["08006","42501","ECONNREFUSED"])("does not misdiagnose or mutate storage for %s",async(code)=>{
    const {db}=fixture();db.query.mockRejectedValueOnce({code});
    await expect(prepareMediaStorage(db)).rejects.toMatchObject({code});
    expect(db.connect).not.toHaveBeenCalled();
  });
  it("allows a strictly read-only operational check",async()=>{
    const {db}=fixture();db.query.mockRejectedValueOnce({code:"42P01"});
    await expect(prepareMediaStorage(db,{checkOnly:true})).rejects.toMatchObject({code:"42P01"});
    expect(db.connect).not.toHaveBeenCalled();
  });
  it("rolls back migration errors and never reports incomplete setup as ready",async()=>{
    const {db,client}=fixture();db.query.mockRejectedValueOnce({code:"42703"});
    client.query.mockRejectedValueOnce({code:"23505"});
    await expect(prepareMediaStorage(db)).rejects.toMatchObject({code:"23505"});
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe("media deployment preflight",()=>{
  const run=(prepared:boolean)=>{
    const dir=mkdtempSync(join(tmpdir(),"deploy-media-"));
    try{
      mkdirSync(join(dir,"dist"),{recursive:true});
      writeFileSync(join(dir,"dist/.deployed_sha"),"same-sha\n");
      writeFileSync(join(dir,"shared.env"),"PORT=3000\n");
      const result=spawnSync("bash",["-c",`
source "$DEPLOY_SCRIPT"
APP_DIR="$TEST_DIR"
SHARED_ENV="$TEST_DIR/shared.env"
LOG_FILE="$TEST_DIR/deploy.log"
LOCK_FILE="$TEST_DIR/deploy.lock"
check_prereqs(){ :; }
require_clean_tree(){ :; }
git(){ if [[ "$*" == *"rev-parse HEAD"* ]]; then echo same-sha; fi; }
node(){ echo media >> "$TEST_DIR/events"; return "$MEDIA_EXIT"; }
run_build(){ echo build >> "$TEST_DIR/events"; }
restart_service(){ echo restart >> "$TEST_DIR/events"; }
health_check(){ echo health >> "$TEST_DIR/events"; }
post_start_stability_check(){ echo stability >> "$TEST_DIR/events"; }
purge_cdn(){ echo purge >> "$TEST_DIR/events"; }
main
`],{encoding:"utf8",env:{...process.env,DEPLOY_SCRIPT:resolve("scripts/deploy.sh"),TEST_DIR:dir,MEDIA_EXIT:prepared?"0":"1"}});
      return {result,events:readFileSync(join(dir,"events"),"utf8").trim().split("\n")};
    }finally{rmSync(dir,{recursive:true,force:true});}
  };
  it("checks missing media setup even when the current build is already deployed",()=>{
    const {result,events}=run(true);
    expect(result.status).toBe(0);expect(events).toEqual(["media","health","stability","purge"]);
  });
  it("halts without restarting or claiming success when storage cannot be prepared",()=>{
    const {result,events}=run(false);
    expect(result.status).toBe(1);expect(events).toEqual(["media"]);
    expect(result.stdout).not.toContain("DEPLOY SUCCESS");
  });
});

it.skipIf(!process.env.DATABASE_URL||!!process.env.CI)("preserves real SQL history and assets on repeated and older-schema migrations in temporary tables only",async()=>{
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
  const client=await pool.connect();
  const db={query:client.query.bind(client),connect:async()=>({query:client.query.bind(client),release:()=>{}})};
  try{
    // No public table or customer row is created or changed by this acceptance check.
    await client.query("CREATE TEMP TABLE users(id varchar PRIMARY KEY)");
    await client.query("SET search_path TO pg_temp");
    expect(await prepareMediaStorage(db)).toEqual({changed:true});
    await client.query("INSERT INTO users(id) VALUES('media-test-owner')");
    await client.query(`INSERT INTO media_jobs(id,user_id,kind,prompt,idempotency_key,status,plan,cost_cents,asset_bytes,mime_type)
      VALUES('media-test-job','media-test-owner','image','test prompt','test-key','succeeded','pro',10,$1,'image/png')`,[Buffer.from("preserve-asset")]);
    const before=(await client.query("SELECT * FROM media_jobs")).rows[0];
    expect(await prepareMediaStorage(db)).toEqual({changed:false});
    await client.query("ALTER TABLE media_jobs DROP COLUMN lease_token");
    expect(await prepareMediaStorage(db)).toEqual({changed:true});
    const after=(await client.query("SELECT * FROM media_jobs")).rows[0];
    expect(after).toEqual(before);
    expect(after.asset_bytes.toString()).toBe("preserve-asset");
    expect(after.status).toBe("succeeded");
    expect(await prepareMediaStorage(db)).toEqual({changed:false});
    await expect(client.query(`INSERT INTO media_jobs(id,user_id,kind,prompt,idempotency_key,plan,cost_cents)
      VALUES('duplicate','media-test-owner','image','other','test-key','pro',10)`)).rejects.toMatchObject({code:"23505"});
  }finally{client.release();await pool.end();}
},20000);
