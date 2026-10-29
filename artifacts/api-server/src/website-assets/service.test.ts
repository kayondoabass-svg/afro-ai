// @vitest-environment node
import {beforeEach,describe,it,expect,vi} from "vitest";
import sharp from "sharp";
import {validateProjectFiles,ProjectFileError} from "../project-file-policy";
const state=vi.hoisted(()=>({rows:[] as any[],files:new Map<string,any[]>(),objects:new Map<string,Buffer>(),failFiles:false,jobs:new Map<string,any>(),driver:"private-test-bucket"}));
vi.mock("../project-files",async()=>{
  const policy=await import("../project-file-policy");
  const owned=async(owner:string,project:string)=>{
    if(!({a:["1","2"],b:["3"]} as Record<string,string[]>)[owner]?.includes(String(project)))throw new policy.ProjectFileError(404,"Project not found");
    return String(project);
  };
  return {...policy,assertProjectFileOwnership:owned,
    listProjectFiles:async(owner:string,project:string)=>{await owned(owner,project);return state.files.get(`${owner}:${project}`)||[];},
    listProjectFileRecords:async(owner:string,project:string)=>{await owned(owner,project);return (state.files.get(`${owner}:${project}`)||[]).map((f,i)=>({...f,id:i+1}));},
    deleteProjectFile:vi.fn(),
    saveProjectFiles:async(owner:string,project:string,files:any[])=>{
      await owned(owner,project);if(state.failFiles)throw new Error("D1 unavailable");
      const all=new Map((state.files.get(`${owner}:${project}`)||[]).map(f=>[f.path,f]));
      for(const f of files)all.set(f.path,f);
      const result=policy.validateProjectFiles(Array.from(all.values()));state.files.set(`${owner}:${project}`,result);return result;
    }};
});
vi.mock("../db",()=>{
  async function query(sql:string,args:any[]=[]) {
    if(sql.includes("INSERT INTO website_assets")) {
      const [id,user_id,conversation_id,filename,object_key,bucket,sha256,bytes,width,height,alt,section,source,attribution,project_path]=args;
      state.rows.push({id,user_id,conversation_id,filename,object_key,bucket,sha256,bytes,width,height,alt,section,source,attribution:JSON.parse(attribution),project_path,state:"pending"});return {rows:[]};
    }
    if(sql.includes("UPDATE website_assets SET state")){for(const r of state.rows)if(r.id===args[0]&&r.user_id===args[1]&&String(r.conversation_id)===String(args[2]))r.state="ready";return {rows:[]};}
    if(sql.startsWith("SELECT * FROM website_assets WHERE user_id"))return {rows:state.rows.filter(r=>r.user_id===args[0]&&String(r.conversation_id)===String(args[1])&&(!sql.includes("state='ready'")||r.state==="ready"))};
    if(sql.startsWith("SELECT * FROM website_assets WHERE id")||sql.startsWith("SELECT sha256"))return {rows:state.rows.filter(r=>r.id===args[0]&&r.user_id===args[1]&&String(r.conversation_id)===String(args[2])&&r.state==="ready")};
    return {rows:[]};
  }
  return {pool:{query,connect:async()=>({query,release:()=>{}})}};
});
vi.mock("./store",()=>({
  WEBSITE_IMAGE_BUCKET:()=>state.driver,
  imageObjectKey:(owner:string,project:string,id:string)=>`website-assets/${owner}/${project}/${id}.webp`,
  putWebsiteImage:async(bucket:string,key:string,bytes:Buffer)=>{state.objects.set(`${bucket}/${key}`,bytes);},
  getWebsiteImage:async(bucket:string,key:string)=>state.objects.get(`${bucket}/${key}`),
  removeWebsiteImage:async(bucket:string,key:string)=>{state.objects.delete(`${bucket}/${key}`);},
}));
vi.mock("../media-jobs",()=>({findMedia:async(owner:string,id:string)=>{
  const job=state.jobs.get(id);if(!job||job.user_id!==owner)throw new Error("Not found");return job;
}}));
vi.mock("../media-assets",()=>({readMedia:async(job:any)=>{if(job.expires_at<Date.now())throw new Error("Expired");return job.bytes;}}));
import {saveWebsiteImage,listWebsiteImages,readWebsiteImage,preserveGeneratedImage,projectImageData} from "./service";
let image:Buffer;
beforeEach(async()=>{state.rows=[];state.files.clear();state.objects.clear();state.jobs.clear();state.failFiles=false;state.driver="private-test-bucket";image=await sharp({create:{width:40,height:20,channels:3,background:"#abc123"}}).png().toBuffer();});
describe("sole-owner, project-scoped permanent image storage",()=>{
  it("uses the existing permanent project-file store on deployments without managed-cloud credentials",async()=>{
    state.driver="project-files";
    const asset=await saveWebsiteImage("a","1",image,{source:"uploaded"});
    state.objects.clear();
    expect(state.rows[0].bucket).toBe("project-files");
    const bytes=await readWebsiteImage("a","1",asset.id);
    expect(bytes.length).toBeGreaterThan(0);
    expect(state.rows[0].state).toBe("ready");
  });
  it("stores a durable optimized copy, a real binary File and a manifest",async()=>{
    const asset=await saveWebsiteImage("a","1",image,{source:"uploaded",alt:"Own image"});
    expect(state.rows[0].state).toBe("ready");expect(state.objects.size).toBe(1);
    expect(validateProjectFiles(state.files.get("a:1"))).toHaveLength(2);
    expect((await listWebsiteImages("a","1"))[0].permanent).toBe(true);
    expect(await readWebsiteImage("a","1",asset.id)).toEqual(state.objects.values().next().value);
    expect((await projectImageData("a","1")).data.get(asset.path)).toMatch(/^data:image\/webp;base64,/);
  });
  it("never shares one asset between two projects, even for the same owner and same bytes",async()=>{
    const first=await saveWebsiteImage("a","1",image,{source:"uploaded"});
    const second=await saveWebsiteImage("a","2",image,{source:"uploaded"});
    expect(first.id).not.toBe(second.id);expect(state.objects.size).toBe(2);
    await expect(readWebsiteImage("a","2",first.id)).rejects.toBeInstanceOf(ProjectFileError);
  });
  it("rejects another owner's list, write and image-ID access before reading storage",async()=>{
    const first=await saveWebsiteImage("a","1",image,{source:"uploaded"});
    await expect(listWebsiteImages("b","1")).rejects.toThrow();
    await expect(saveWebsiteImage("b","1",image,{source:"uploaded"})).rejects.toThrow();
    await expect(readWebsiteImage("b","3",first.id)).rejects.toThrow();
    expect(state.objects.size).toBe(1);
  });
  it("makes image selection idempotent within the same project",async()=>{
    const first=await saveWebsiteImage("a","1",image,{source:"uploaded"});
    const again=await saveWebsiteImage("a","1",image,{source:"uploaded"});
    expect(again.id).toBe(first.id);expect(state.rows).toHaveLength(1);
  });
  it("keeps a pending identity and repairs finalization after a file-storage failure",async()=>{
    state.failFiles=true;
    await expect(saveWebsiteImage("a","1",image,{source:"uploaded"})).rejects.toThrow("D1 unavailable");
    expect(state.rows[0].state).toBe("pending");const id=state.rows[0].id;
    state.failFiles=false;
    const result=await saveWebsiteImage("a","1",image,{source:"uploaded"});
    expect(result.id).toBe(id);expect(state.rows).toHaveLength(1);expect(state.rows[0].state).toBe("ready");
  });
  it("copies generated media without extending the original job's expiry",async()=>{
    const expiry=Date.now()+60000;
    state.jobs.set("job",{id:"job",user_id:"a",kind:"image",status:"succeeded",expires_at:expiry,bytes:image});
    const asset=await preserveGeneratedImage("a","1","job");
    state.jobs.get("job").expires_at=Date.now()-1;
    expect(await readWebsiteImage("a","1",asset.id)).toBeInstanceOf(Buffer);
    await expect(preserveGeneratedImage("a","2","job")).rejects.toThrow("Expired");
    await expect(preserveGeneratedImage("b","3","job")).rejects.toThrow();
  });
  it("places full-stack app images under client/public and exposes a build-safe runtime path",async()=>{
    state.files.set("a:1",[{name:"App.tsx",path:"client/src/App.tsx",language:"tsx",content:"export default function App(){return null}"}]);
    const asset=await saveWebsiteImage("a","1",image,{source:"uploaded"});
    expect(asset.path).toMatch(/^client\/public\/assets\/images\//);
    expect(asset.runtimePath).toMatch(/^assets\/images\//);
  });
});
