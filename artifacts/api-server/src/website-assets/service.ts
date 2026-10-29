import {randomUUID,createHash} from "node:crypto";
import {pool} from "../db";
import {assertProjectFileOwnership,listProjectFiles,listProjectFileRecords,deleteProjectFile,saveProjectFiles,validateProjectFiles,ProjectFileError} from "../project-files";
import {findMedia} from "../media-jobs";
import {readMedia} from "../media-assets";
import {imageObjectKey,WEBSITE_IMAGE_BUCKET,putWebsiteImage,getWebsiteImage,removeWebsiteImage} from "./store";
import {optimizeWebsiteImage,imagePath,plainText} from "./policy";
import {findStockPhoto} from "./stock";

const manifestPath="assets/manifest.json";
export const MAX_PROJECT_IMAGES=8;
const publicAsset=(row:any)=>({id:row.id,path:row.project_path,runtimePath:row.project_path.replace(/^client\/public\//,""),filename:row.filename,alt:row.alt,section:row.section,
  source:row.source,attribution:row.attribution,width:row.width,height:row.height,bytes:row.bytes,permanent:true,
  contentUrl:`/api/conversations/${row.conversation_id}/website-assets/${row.id}/content`});
export async function listWebsiteImages(owner:string,project:string) {
  const id=await assertProjectFileOwnership(owner,project);
  const {rows}=await pool.query("SELECT * FROM website_assets WHERE user_id=$1 AND conversation_id=$2 AND state='ready' ORDER BY created_at",[owner,id]);
  return rows.map(publicAsset);
}
async function ownedRow(owner:string,project:string,assetId:string) {
  const id=await assertProjectFileOwnership(owner,project);
  if(!/^[a-f0-9-]{36}$/i.test(assetId))throw new ProjectFileError(404,"Image not found.");
  const {rows}=await pool.query("SELECT * FROM website_assets WHERE id=$1 AND user_id=$2 AND conversation_id=$3 AND state='ready'",[assetId,owner,id]);
  if(!rows[0])throw new ProjectFileError(404,"Image not found.");
  const row=rows[0];
  if(row.object_key!==imageObjectKey(owner,id,row.id))throw new ProjectFileError(503,"Image ownership metadata is invalid.");
  return row;
}
export async function readWebsiteImage(owner:string,project:string,assetId:string) {
  const row=await ownedRow(owner,project,assetId);
  const file=row.bucket==="project-files"?(await listProjectFiles(owner,project)).find(f=>f.path===row.project_path):undefined;
  const bytes=row.bucket==="project-files"
    ?file?.encoding==="base64"?Buffer.from(file.content,"base64"):Buffer.alloc(0)
    :await getWebsiteImage(row.bucket,row.object_key);
  if(createHash("sha256").update(bytes).digest("hex")!==row.sha256)throw new ProjectFileError(503,"Image integrity check failed.");
  return bytes;
}
export async function saveWebsiteImage(owner:string,project:string,input:Buffer,details:{alt?:string;section?:string;source:string;attribution?:unknown}) {
  const id=await assertProjectFileOwnership(owner,project);
  let image:Awaited<ReturnType<typeof optimizeWebsiteImage>>;
  try {image=await optimizeWebsiteImage(input);}
  catch {throw new ProjectFileError(400,"Use a still PNG, JPEG or WebP image up to 8 MB and 16.7 megapixels.");}
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialise this project's image writes only; no global or cross-user cache.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`website-images:${owner}:${id}`]);
    const existing=await client.query("SELECT * FROM website_assets WHERE user_id=$1 AND conversation_id=$2 ORDER BY created_at",[owner,id]);
    let row=existing.rows.find((r:any)=>r.sha256===image.sha256);
    if(!row&&existing.rows.length>=MAX_PROJECT_IMAGES)throw new ProjectFileError(400,"This project has eight images. Remove an unused image before adding another.");
    const assetId=row?.id||randomUUID();
    const bucket=row?.bucket||WEBSITE_IMAGE_BUCKET(),key=imageObjectKey(owner,id,assetId);
    const previous=await listProjectFiles(owner,id);
    const path=(previous.some(f=>f.path.startsWith("client/src/"))?"client/public/":"")+imagePath(assetId);
    row=row||{id:assetId,user_id:owner,conversation_id:id,filename:`${assetId}.webp`,project_path:path,object_key:key,bucket,sha256:image.sha256,
      bytes:image.bytes.length,width:image.width,height:image.height,alt:plainText(details.alt)||"Project image",
      section:plainText(details.section,40)||"custom",source:details.source,attribution:details.attribution||{},state:"pending"};
    const all=[...existing.rows.filter((r:any)=>r.id!==assetId&&r.state==="ready"),row];
    const imageFile={name:row.filename,path:row.project_path,language:"binary",encoding:"base64" as const,content:image.bytes.toString("base64")};
    const manifest={name:"manifest.json",path:manifestPath,language:"json",content:JSON.stringify({
      version:1,retention:"permanent-project-copy",assets:all.map(publicAsset),
    },null,2)};
    const merged=new Map(previous.map(f=>[f.path,f]));
    merged.set(imageFile.path,imageFile);merged.set(manifestPath,manifest);
    validateProjectFiles(Array.from(merged.values())); // Fail before writing storage if file/project limits would be exceeded.
    if(row.state!=="ready") {
      // Commit the staging identity separately. If the later D1 finalization or
      // DB commit is ambiguous, retry the same pending row/key, not a new asset.
      if(!existing.rows.some((r:any)=>r.id===assetId))await pool.query(`INSERT INTO website_assets(id,user_id,conversation_id,filename,object_key,bucket,sha256,bytes,width,height,alt,section,source,attribution,project_path,state)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending') ON CONFLICT(user_id,conversation_id,sha256) DO NOTHING`,
      [row.id,owner,id,row.filename,key,bucket,row.sha256,row.bytes,row.width,row.height,row.alt,row.section,row.source,JSON.stringify(row.attribution),row.project_path]);
      await putWebsiteImage(bucket,key,image.bytes);
    }
    await saveProjectFiles(owner,id,[imageFile,manifest],"merge");
    await client.query("UPDATE website_assets SET state='ready' WHERE id=$1 AND user_id=$2 AND conversation_id=$3",[assetId,owner,id]);
    await client.query("COMMIT");
    return publicAsset(row);
  } catch(error) {
    await client.query("ROLLBACK").catch(()=>{});
    // Never delete an ambiguously committed image: D1 may already contain its
    // durable copy. A retry uses the same optimized bytes; diagnostics omit keys.
    throw error;
  } finally {client.release();}
}
export async function preserveGeneratedImage(owner:string,project:string,jobId:string,alt?:string,section="custom") {
  await assertProjectFileOwnership(owner,project);
  const job=await findMedia(owner,jobId);
  if(job.kind!=="image"||job.status!=="succeeded")throw new ProjectFileError(409,"Select a completed, unexpired image.");
  return saveWebsiteImage(owner,project,await readMedia(job),{source:"generated",alt,section});
}
export async function searchProjectImage(owner:string,project:string,query:string,section="hero",signal?:AbortSignal) {
  await assertProjectFileOwnership(owner,project);
  const images=await listWebsiteImages(owner,project);
  if(images.some((i:any)=>i.section===section))return {assets:images.filter((i:any)=>i.section===section),reused:true};
  const photo=await findStockPhoto(query,signal);
  if(!photo)return {assets:[],message:"No suitable licensed photo found. Complete the design with typography or original SVG. Do not invent an image URL."};
  signal?.throwIfAborted();
  const asset=await saveWebsiteImage(owner,project,photo.bytes,{alt:photo.alt,source:"stock",section,attribution:photo.attribution});
  return {assets:[asset],message:"Illustrative licensed photograph. Include its attribution; subject match is based on search metadata, not visual certification."};
}
export async function projectImageData(owner:string,project:string) {
  const assets=await listWebsiteImages(owner,project);
  const files=await listProjectFiles(owner,project),data=new Map<string,string>();
  for(const asset of assets) {
    const file=files.find(f=>f.path===asset.path);
    if(file?.encoding==="base64") {
      const bytes=Buffer.from(file.content,"base64");
      const row=(await pool.query("SELECT sha256 FROM website_assets WHERE id=$1 AND user_id=$2 AND conversation_id=$3 AND state='ready'",[asset.id,owner,await assertProjectFileOwnership(owner,project)])).rows[0];
      if(!row||createHash("sha256").update(bytes).digest("hex")!==row.sha256)continue;
      const uri=`data:image/webp;base64,${file.content}`;
      data.set(asset.path,uri);
      data.set(asset.runtimePath,uri);
      data.set(asset.contentUrl.replace(/^\//,""),uri);
    }
  }
  return {assets,data};
}
export async function deleteWebsiteImage(owner:string,project:string,assetId:string) {
  const row=await ownedRow(owner,project,assetId);
  // Explicit removal only; never auto-expire a website image with media jobs.
  const files=await listProjectFiles(owner,project);
  if(files.some(f=>f.path!==manifestPath&&f.encoding!=="base64"&&f.content.includes(imagePath(assetId))))
    throw new ProjectFileError(409,"This image is referenced by project code. Remove its references first.");
  const assets=(await listWebsiteImages(owner,project)).filter((a:any)=>a.id!==assetId);
  await saveProjectFiles(owner,project,[{name:"manifest.json",path:manifestPath,language:"json",content:JSON.stringify({version:1,retention:"permanent-project-copy",assets},null,2)}],"merge");
  const record=(await listProjectFileRecords(owner,project)).find(f=>f.path===row.project_path);
  if(record)await deleteProjectFile(owner,String(record.id));
  await removeWebsiteImage(row.bucket,row.object_key);
  await pool.query("DELETE FROM website_assets WHERE id=$1 AND user_id=$2 AND conversation_id=$3",[assetId,owner,row.conversation_id]);
}
