import {createHash} from "node:crypto";
import {S3Client, CreateBucketCommand, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand} from "@aws-sdk/client-s3";
import {Storage} from "@google-cloud/storage";

export const WEBSITE_IMAGE_BUCKET = () => process.env.WEBSITE_ASSET_BUCKET ||
  (process.env.PRIVATE_OBJECT_DIR ? `gcs:${process.env.PRIVATE_OBJECT_DIR.replace(/^\/+/,"")}` : "project-files");
export const MAX_WEBSITE_IMAGE_BYTES = 400_000;
export function imageObjectKey(owner: string, project: string, id: string) {
  return `website-assets/${createHash("sha256").update(owner).digest("hex")}/${project}/${id}.webp`;
}
function store() {
  if(process.env.WEBSITE_ASSET_R2_PRIVATE!=="true")throw new Error("Permanent R2 image storage requires explicit private-bucket verification.");
  if(!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY)
    throw new Error("Permanent image storage is not configured.");
  return new S3Client({
    endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,region:"auto",maxAttempts:1,
    credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY},
  });
}
function managedFile(descriptor:string,key:string) {
  const [bucket,...prefix]=descriptor.slice(4).split("/");
  const client=process.env.WEBSITE_ASSET_GCS_ADC==="true"
    ?new Storage()
    :new Storage({projectId:"",credentials:{
      audience:"replit",subject_token_type:"access_token",token_url:"http://127.0.0.1:1106/token",type:"external_account",
      credential_source:{url:"http://127.0.0.1:1106/credential",format:{type:"json",subject_token_field_name:"access_token"}},
      universe_domain:"googleapis.com",
    }});
  return client.bucket(bucket).file([...prefix,key].filter(Boolean).join("/"));
}
// Operator-only setup: a separate R2 bucket, with no public bucket URL or custom
// domain enabled. Never reuse the temporary-media bucket or its lifecycle policy.
export async function setupWebsiteImageStore() {
  const Bucket=WEBSITE_IMAGE_BUCKET();
  if(Bucket==="project-files")return {provider:"project-files",requiresOwnedProjectWrite:true};
  if(Bucket.startsWith("gcs:")) {
    // Probe a private sentinel; never publish the bucket or signed URLs.
    const key=`website-assets/readiness/${createHash("sha256").update(String(Date.now())).digest("hex")}`;
    const file=managedFile(Bucket,key);
    await file.save(Buffer.from("ready"),{resumable:false,metadata:{contentType:"text/plain",cacheControl:"private, no-store"}});
    const [data]=await file.download();if(data.toString()!=="ready")throw new Error("Permanent image store verification failed.");
    await file.delete();
    return {provider:"app-storage",ready:true};
  }
  const client=store();
  try {await client.send(new HeadBucketCommand({Bucket}));}
  catch(error:any) {
    if(error?.$metadata?.httpStatusCode!==404)throw new Error("Cannot inspect permanent image bucket.");
    await client.send(new CreateBucketCommand({Bucket}));
  }
  await client.send(new HeadBucketCommand({Bucket}));
  return {provider:"r2",ready:true};
}
export async function putWebsiteImage(bucket:string,key:string,bytes:Buffer) {
  if(!bytes.length||bytes.length>MAX_WEBSITE_IMAGE_BYTES)throw new Error("Website image exceeds its storage limit.");
  // This deployment deliberately uses the existing bounded, private D1 file
  // store. The caller still must commit saveProjectFiles before marking ready.
  if(bucket==="project-files")return;
  if(bucket.startsWith("gcs:")) {
    await managedFile(bucket,key).save(bytes,{resumable:false,validation:"crc32c",
      metadata:{contentType:"image/webp",cacheControl:"private, no-store"}});
    return;
  }
  await store().send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:"image/webp",
    CacheControl:"private, no-store"}),{abortSignal:AbortSignal.timeout(20000)});
}
export async function getWebsiteImage(bucket:string,key:string) {
  if(bucket.startsWith("gcs:")) {
    const file=managedFile(bucket,key),[metadata]=await file.getMetadata();
    if(Number(metadata.size)>MAX_WEBSITE_IMAGE_BYTES)throw new Error("Website image unavailable.");
    const [bytes]=await file.download({validation:"crc32c"});
    if(!bytes.length||bytes.length>MAX_WEBSITE_IMAGE_BYTES)throw new Error("Website image unavailable.");
    return bytes;
  }
  // No response ever exposes a bucket address, key or signed URL.
  const result=await store().send(new GetObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(20000)});
  if(!result.Body||(result.ContentLength||0)>MAX_WEBSITE_IMAGE_BYTES)throw new Error("Website image unavailable.");
  const bytes=Buffer.from(await result.Body.transformToByteArray());
  if(!bytes.length||bytes.length>MAX_WEBSITE_IMAGE_BYTES)throw new Error("Website image unavailable.");
  return bytes;
}
export async function removeWebsiteImage(bucket:string,key:string) {
  if(bucket==="project-files")return;
  if(bucket.startsWith("gcs:")) {await managedFile(bucket,key).delete({ignoreNotFound:true});return;}
  await store().send(new DeleteObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(20000)});
}
