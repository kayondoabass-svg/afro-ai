// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
vi.mock("../db",()=>({pool:{query:vi.fn()}}));
import { createKeyoDownloadAnalytics, observeKeyoTransfer, recordKeyoTransfer, registerKeyoOutbound } from "../keyo-download-analytics";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { registerKeyoStudioAdmin } from "../keyo-studio-admin";
import { KEYO_VERSION } from "../../scripts/keyo-release";
import { KEYO_DESKTOP_VERSION } from "../../packages/keyo-studio/src/version.mjs";
import { keyoStudioPage } from "../keyo-studio-page";
const summary = {startedAt:"2026-10-13T10:00:00.000Z",rows:[
  {source:"platform",artifact:"source.tgz",count:2},
  {source:"hugging-face-link",artifact:"app.zip",count:3},
  {source:"hugging-face-link",artifact:"(project page)",count:4},
]};
function store(){return {summary:vi.fn(async()=>summary),record:vi.fn(async()=>{})};}
function remote(){
  return vi.fn(async(url:any)=>String(url).includes("api.github")
    ? Response.json([{tag_name:"vold",assets:[{name:"KEYO-win32-x64.zip",download_count:6},{name:"KEYO-source.zip",download_count:1},{name:"checksums.txt",download_count:900}]},{tag_name:"vnew",assets:[{name:"KEYO-win32-x64.zip",download_count:0}]}])
    : Response.json({id:"kayondoabass/KEYO-Studio",likes:500}));
}
let server:Server|undefined;
afterEach(async()=>{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;});
async function listen(app:express.Express){
  server=await new Promise<Server>(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
  return `http://127.0.0.1:${(server.address() as any).port}`;
}
describe("KEYO source-specific download statistics",()=>{
  it("includes older releases, separates categories, excludes metadata, and does not invent Hugging Face downloads",async()=>{
    const request=remote(),get=createKeyoDownloadAnalytics(store(),request as any);
    const result=await get();
    expect(result.github).toMatchObject({status:"available",total:7,desktop:6,source:1,bundles:0});
    expect(result.github.byRelease[1].total).toBe(0);
    expect(result.platform).toMatchObject({total:2,trackingSince:summary.startedAt});
    expect(result.huggingFace).toMatchObject({status:"not_published",total:null});
    expect(result.outboundClicks.huggingFace).toBe(3);
    await get();expect(request).toHaveBeenCalledTimes(2);
  });
  it("coalesces parallel external requests and keeps true zeros distinct",async()=>{
    const request=vi.fn(async(url:any)=>Response.json(String(url).includes("api.github")?[]:{id:"kayondoabass/KEYO-Studio"}));
    const get=createKeyoDownloadAnalytics({summary:async()=>({...summary,rows:[]}),record:async()=>{}},request as any);
    const [a,b]=await Promise.all([get(),get()]);
    expect(a.github.total).toBe(0);expect(b.platform.total).toBe(0);
    expect(a.huggingFace.total).toBeNull();expect(request).toHaveBeenCalledTimes(2);
  });
  it("shows unavailable—not zero—on upstream or storage failures",async()=>{
    const get=createKeyoDownloadAnalytics({summary:async()=>{throw Error("db down");},record:async()=>{}},async()=>new Response("",{status:429}));
    const result=await get();
    expect(result.platform.total).toBeNull();expect(result.github.total).toBeNull();
    expect(result.github.status).toBe("unavailable");expect(result.huggingFace.status).toBe("unavailable");
  });
  it("counts only successful finished full GET archive transfers",async()=>{
    const s=store(),response={statusCode:200,writableFinished:true} as any;
    const request=(method="GET",range="")=>({method,get:()=>range}) as any;
    recordKeyoTransfer(request(),response,"app.zip",undefined,s);
    recordKeyoTransfer(request("HEAD"),response,"app.zip",undefined,s);
    recordKeyoTransfer(request("GET","bytes=0-1"),response,"app.zip",undefined,s);
    recordKeyoTransfer(request(),{...response,statusCode:206},"app.zip",undefined,s);
    recordKeyoTransfer(request(),response,"app.zip",Error("aborted"),s);
    recordKeyoTransfer(request(),{...response,writableFinished:false},"app.zip",undefined,s);
    recordKeyoTransfer(request(),response,"SHA256SUMS.txt",undefined,s);
    await Promise.resolve();
    expect(s.record).toHaveBeenCalledTimes(1);expect(s.record).toHaveBeenCalledWith("platform","app.zip");
  });
  it("records a real Express file transfer on HTTP finish, excluding HEAD and range transfers",async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),"keyo-metrics-"));
    try {
      const file=path.join(directory,"test.tgz");await writeFile(file,"download fixture");
      const s=store(),app=express();
      app.get("/file",(req,res)=>{observeKeyoTransfer(req,res,"test.tgz",s);res.download(file);});
      const url=await listen(app);
      const full=await fetch(`${url}/file`);expect(await full.text()).toBe("download fixture");
      expect(s.record).toHaveBeenCalledWith("platform","test.tgz");
      await fetch(`${url}/file`,{method:"HEAD"});
      const partial=await fetch(`${url}/file`,{headers:{Range:"bytes=0-2"}});
      expect(partial.status).toBe(206);await partial.text();
      expect(s.record).toHaveBeenCalledTimes(1);
    } finally {await rm(directory,{recursive:true,force:true});}
  });
  it("records outbound archive clicks separately and prevents open redirects and HEAD inflation",async()=>{
    const s=store(),app=express();registerKeyoOutbound(app,s);
    const url=await listen(app),asset=`KEYO-Studio-${KEYO_DESKTOP_VERSION}-win32-x64.zip`;
    const result=await fetch(`${url}/api/keyo-studio/outbound/hugging-face?asset=${asset}`,{redirect:"manual"});
    expect(result.status).toBe(302);expect(result.headers.get("location")).toContain(`/resolve/main/${asset}?download=true`);
    expect(s.record).toHaveBeenCalledWith("hugging-face-link",asset);
    await fetch(`${url}/api/keyo-studio/outbound/github`,{method:"HEAD",redirect:"manual"});
    expect(s.record).toHaveBeenCalledTimes(1);
    expect((await fetch(`${url}/api/keyo-studio/outbound/github?asset=https://evil.test`)).status).toBe(400);
    expect((await fetch(`${url}/api/keyo-studio/outbound/evil`)).status).toBe(400);
  });
  it("protects analytics with founder or explicit invitation access",async()=>{
    const app=express(),get=vi.fn(async()=>({test:true}));
    registerKeyoStudioAdmin(app,{founderEmail:"founder@example.org",store:{hasInvite:async()=>false} as any,getRelease:async()=>({}),getDownloads:get as any,
      authenticate:(req:any,res,next)=>{if(!req.get("x-test-user"))return void res.status(401).end();req.user={claims:{sub:"user",email:req.get("x-test-user"),email_verified:true}};next();}});
    const url=await listen(app);
    expect((await fetch(`${url}/api/keyo-studio/admin/downloads`)).status).toBe(401);
    expect((await fetch(`${url}/api/keyo-studio/admin/downloads`,{headers:{"x-test-user":"stranger@example.org"}})).status).toBe(403);
    expect(get).not.toHaveBeenCalled();
    expect((await fetch(`${url}/api/keyo-studio/admin/downloads`,{headers:{"x-test-user":"founder@example.org"}})).status).toBe(200);
    expect(get).toHaveBeenCalledTimes(1);
  });
  it("routes actual public archive links through fixed-source tracking",()=>{
    const html=keyoStudioPage();
    expect(html).toContain(`/api/keyo-studio/outbound/hugging-face?asset=KEYO-Studio-${KEYO_DESKTOP_VERSION}-win32-x64.zip`);
    expect(html).toContain('/api/keyo-studio/outbound/github');
  });
});
