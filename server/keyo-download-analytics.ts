import type { Express, Request, Response } from "express";
import type { KeyoDownloadAnalytics } from "../shared/keyo-downloads";
import { keyoDownloadCategory } from "../shared/keyo-downloads";
import { keyoDownloadStore, type KeyoDownloadStore } from "./keyo-download-store";
import { KEYO_VERSION } from "../scripts/keyo-release";
import { KEYO_RELEASE_ASSETS, KEYO_PUBLIC_LINKS } from "../scripts/keyo-release-assets";
import { KEYO_FILENAME } from "../scripts/keyo-release";
import rateLimit from "express-rate-limit";

let recordingHealthy = true;
export function recordKeyoTransfer(req: Request, res: Response, name: string, error?: unknown, store = keyoDownloadStore) {
  if (error || req.method !== "GET" || req.get("range") || res.statusCode !== 200 ||
    !res.writableFinished || keyoDownloadCategory(name) === "metadata") return;
  void store.record("platform",name).then(()=>{recordingHealthy=true;}).catch(()=>{
    recordingHealthy=false;
    console.warn("[KEYO metrics] Transfer accounting failed; download itself is unchanged.");
  });
}
export function registerKeyoOutbound(app: Express, store = keyoDownloadStore) {
  const allowed = new Set([...KEYO_RELEASE_ASSETS, KEYO_FILENAME,
    ...["win32-x64.zip","linux-x64.tar.gz","darwin-arm64.zip","darwin-x64.zip"].map(s=>`KEYO-Studio-${KEYO_VERSION}-${s}`)]);
  const limiter=rateLimit({windowMs:60_000,max:60,standardHeaders:true,legacyHeaders:false});
  app.get("/api/keyo-studio/outbound/:destination", limiter, async (req,res) => {
    const destination = String(req.params.destination);
    const asset = req.query.asset;
    if (!["github","hugging-face"].includes(destination) || (asset !== undefined && (typeof asset !== "string" || !allowed.has(asset)))) {
      res.status(400).json({message:"Unknown KEYO public destination."});return;
    }
    const root = destination === "github" ? KEYO_PUBLIC_LINKS.github : KEYO_PUBLIC_LINKS.huggingFace;
    const url = asset ? destination === "github"
      ? `${root}/releases/download/v${KEYO_VERSION}/${encodeURIComponent(asset as string)}`
      : `${root}/resolve/main/${encodeURIComponent(asset as string)}?download=true` : root;
    if (req.method === "GET" && (!asset || keyoDownloadCategory(asset as string)!=="metadata")) {
      void store.record(destination === "github" ? "github-link" : "hugging-face-link", asset as string || "(project page)").catch(()=>{
        recordingHealthy=false;console.warn("[KEYO metrics] Outbound click accounting unavailable.");
      });
    }
    res.set("Cache-Control","no-store").redirect(302,url);
  });
}

async function publicJson(url: string, request: typeof fetch) {
  const response = await request(url,{headers:{Accept:"application/json","User-Agent":"Afro-AI-KEYO-download-metrics"},
    signal:AbortSignal.timeout(10000),redirect:"error"});
  if (!response.ok) throw new Error("Public provider statistics unavailable");
  if (Number(response.headers.get("content-length") || 0) > 2_000_000) throw new Error("Statistics too large");
  if (!response.body) throw new Error("Statistics response empty");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];
  let size=0;
  try {
    for (;;) {
      const chunk=await reader.read();if(chunk.done) break;
      size+=chunk.value.length;
      if(size>2_000_000){await reader.cancel();throw new Error("Statistics too large");}
      chunks.push(chunk.value);
    }
  } finally {reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function createKeyoDownloadAnalytics(store: KeyoDownloadStore = keyoDownloadStore, request: typeof fetch = fetch) {
  let cached: {until:number; github:KeyoDownloadAnalytics["github"];huggingFace:KeyoDownloadAnalytics["huggingFace"]} | undefined;
  let pending: Promise<NonNullable<typeof cached>> | undefined;
  async function external() {
    if (cached && Date.now()<cached.until) return cached;
    if (pending) return pending;
    pending = (async()=>{
      const checkedAt=new Date().toISOString();
      const [github,huggingFace]=await Promise.all([
        (async():Promise<KeyoDownloadAnalytics["github"]>=>{
          try {
            const byRelease:KeyoDownloadAnalytics["github"]["byRelease"]=[];
            let desktop=0,source=0,bundles=0;
            for(let page=1;page<=10;page++){
              const releases=await publicJson(`https://api.github.com/repos/kayondoabass-svg/keyo-studio/releases?per_page=100&page=${page}`,request);
              if(!Array.isArray(releases)) throw new Error("Invalid release statistics");
              for(const release of releases){
                if(typeof release.tag_name!=="string" || !Array.isArray(release.assets)) throw new Error("Invalid release data");
                const assets=release.assets.filter((a:any)=>keyoDownloadCategory(String(a.name))!=="metadata").map((a:any)=>{
                  if(typeof a.name!=="string" || !Number.isSafeInteger(a.download_count) || a.download_count<0) throw new Error("Invalid asset count");
                  return {name:a.name,category:keyoDownloadCategory(a.name),count:a.download_count};
                });
                for(const asset of assets){
                  if(asset.category==="desktop") desktop+=asset.count;
                  else if(asset.category==="source") source+=asset.count;else bundles+=asset.count;
                }
                byRelease.push({version:release.tag_name,assets,total:assets.reduce((s:number,a:any)=>s+a.count,0)});
              }
              if(releases.length<100) break;
              if(page===10) throw new Error("Release history exceeds bounded statistics query");
            }
            return {status:"available",total:desktop+source+bundles,desktop,source,bundles,byRelease,checkedAt,
              note:"GitHub-reported release archive downloads across all fetched releases. Repeats and automated requests may count; not unique people or installs. Notes/checksums and GitHub's automatically generated source ZIPs are excluded."};
          } catch {return {status:"unavailable",total:null,desktop:null,source:null,bundles:null,byRelease:[],checkedAt,
            note:"GitHub statistics could not be retrieved. This is not a zero-download result."};}
        })(),
        (async():Promise<KeyoDownloadAnalytics["huggingFace"]>=>{
          try {
            const space=await publicJson("https://huggingface.co/api/spaces/kayondoabass/KEYO-Studio",request);
            if(space.id!=="kayondoabass/KEYO-Studio") throw new Error("Invalid Space statistics");
            const count=Number.isSafeInteger(space.downloads) && space.downloads>=0 ? space.downloads : null;
            return {status:count===null?"not_published":"available",total:count,checkedAt,
              note:count===null?"The public Hugging Face Space API does not publish a download count here. Tracked outbound archive-link clicks below are not completed downloads. Direct Hugging Face visits/downloads are not captured by Afro AI.":"Hugging Face API-reported downloads; its reporting window is provider-defined."};
          } catch {return {status:"unavailable",total:null,checkedAt,note:"Hugging Face statistics could not be retrieved. This is not a zero-download result."};}
        })(),
      ]);
      cached={until:Date.now()+(github.status==="unavailable"||huggingFace.status==="unavailable"?30_000:300_000),github,huggingFace};
      return cached;
    })().finally(()=>{pending=undefined;});
    return pending;
  }
  return async ():Promise<KeyoDownloadAnalytics> => {
    const [remote,local]=await Promise.all([external(),store.summary().catch(()=>null)]);
    const rows=local?.rows || [];
    const byArtifact=rows.filter(r=>r.source==="platform").map(r=>({name:r.artifact,category:keyoDownloadCategory(r.artifact),count:r.count}));
    const clicks=(source:string)=>local?rows.filter(r=>r.source===source && r.artifact!=="(project page)").reduce((sum,r)=>sum+r.count,0):null;
    return {github:remote.github,huggingFace:remote.huggingFace,platform:{status:local?"available":"unavailable",total:local?byArtifact.reduce((s,a)=>s+a.count,0):null,
      trackingSince:local?.startedAt||null,byArtifact,recordingHealthy:!!local&&recordingHealthy,
      note:"Successful full-file archive transfers served by Afro AI since tracking began. HEAD, partial/range transfers and failed transfers are excluded. Historical downloads before tracking are unknown; counts are not unique people or installations."},
      outboundClicks:{github:clicks("github-link"),huggingFace:clicks("hugging-face-link")},
      note:"Do not add link clicks, visits, active viewers or installs to download totals. External snapshots refresh at most every five minutes."};
  };
}
export const getKeyoDownloadAnalytics=createKeyoDownloadAnalytics();
