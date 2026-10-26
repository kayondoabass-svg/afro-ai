// Explicit deploy-time setup. Never imported by the media worker or run on reads.
const {readFileSync}=require("node:fs");
const {join}=require("node:path");

const PROBE = `SELECT id,user_id,kind,prompt,duration,idempotency_key,status,created_at,
  lease_until,lease_token,error,plan,cost_cents,usage_log_id,asset_key,asset_bytes,mime_type,
  completed_at,expires_at,expired_at
  FROM media_jobs LIMIT 0`;

async function prepareMediaStorage(db,{checkOnly=false}={}) {
  try {
    await db.query(PROBE);
    return {changed:false};
  } catch(error) {
    // Connectivity and permission failures are not missing migrations.
    if(checkOnly || !["42P01","42703"].includes(error.code))throw error;
  }
  const client=await db.connect();
  try {
    await client.query(readFileSync(join(__dirname,"migrations/202606_media_jobs.sql"),"utf8"));
    await client.query(PROBE);
    return {changed:true};
  } catch(error) {
    await client.query("ROLLBACK").catch(()=>{});
    throw error;
  } finally {client.release();}
}

async function main() {
  if(!process.env.DATABASE_URL) {
    console.error("Media storage setup requires the application's DATABASE_URL.");
    process.exitCode=1;return;
  }
  const {Pool}=require("pg");
  const db=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,max:1});
  try{
    const result=await prepareMediaStorage(db,{checkOnly:process.argv.includes("--check")});
    console.log(result.changed
      ? "Media storage migration applied and verified; existing jobs and assets preserved."
      : "Media storage ready (read-only verification).");
  }catch(error){
    const code=/^[A-Z0-9]{5}$/.test(error.code||"")?error.code:"DATABASE_UNAVAILABLE";
    console.error(`Media storage setup failed (${code}); do not restart the existing service.`);
    process.exitCode=1;
  }finally{await db.end();}
}
module.exports={prepareMediaStorage,PROBE};
if(require.main===module)void main();
