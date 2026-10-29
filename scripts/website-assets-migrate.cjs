const {readFileSync}=require("node:fs");
const {join}=require("node:path");
async function prepareWebsiteAssets(db) {
  try {
    await db.query("SELECT id,user_id,conversation_id,object_key,bucket,state,project_path FROM website_assets LIMIT 0");
    return {changed:false};
  } catch(error) {
    if(!["42P01","42703"].includes(error.code))throw error;
  }
  const client=await db.connect();
  try {
    await client.query(readFileSync(join(__dirname,"migrations/202610_website_assets.sql"),"utf8"));
    return {changed:true};
  } catch(error) {
    await client.query("ROLLBACK").catch(()=>{});
    throw error;
  } finally {client.release();}
}
module.exports={prepareWebsiteAssets};
if(require.main===module) {
  const {Pool}=require("pg"),pool=new Pool({connectionString:process.env.DATABASE_URL});
  prepareWebsiteAssets(pool).then(r=>console.log(`Permanent website image schema ready (changed=${r.changed}).`))
    .catch(()=>{console.error("Website image schema setup failed; check database connectivity and migration permissions.");process.exitCode=1;})
    .finally(()=>pool.end());
}
