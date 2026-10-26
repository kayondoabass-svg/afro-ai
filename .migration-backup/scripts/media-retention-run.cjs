// A standalone maintenance entry point: no app, provider, billing or mail worker.
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_UNAVAILABLE");
  const {Pool}=require("pg");
  const {purgeExpiredMedia}=await import("../server/media-retention.js");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
  try {
    const result=await purgeExpiredMedia(pool);
    console.log(JSON.stringify({mediaRetention:result}));
    if(result.retry)process.exitCode=1;
  } finally {await pool.end();}
}
if(require.main===module)void main().catch(()=>{
  console.error("Media retention cleanup could not complete; retry required.");
  process.exitCode=1;
});
