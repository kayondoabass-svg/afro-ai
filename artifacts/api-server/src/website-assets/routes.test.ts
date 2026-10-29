// @vitest-environment node
import {afterAll,beforeAll,describe,it,expect,vi} from "vitest";
import express from "express";
import {createServer,type Server} from "node:http";
const calls=vi.hoisted(()=>({list:vi.fn(),read:vi.fn(),save:vi.fn(),copy:vi.fn(),search:vi.fn(),remove:vi.fn()}));
vi.mock("../replit_integrations/auth/replitAuth",()=>({isAuthenticated:(req:any,res:any,next:any)=>{
  if(!req.get("x-owner"))return res.status(401).json({error:"Sign in"});
  req.user={claims:{sub:req.get("x-owner")}};next();
}}));
vi.mock("./service",()=>({listWebsiteImages:calls.list,readWebsiteImage:calls.read,saveWebsiteImage:calls.save,
  preserveGeneratedImage:calls.copy,searchProjectImage:calls.search,deleteWebsiteImage:calls.remove}));
import {registerWebsiteAssetRoutes} from "./routes";
describe("private image HTTP contract",()=>{
  let server:Server,base:string;
  beforeAll(async()=>{
    const app=express();app.use(express.json());registerWebsiteAssetRoutes(app);server=createServer(app);
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    base=`http://127.0.0.1:${(server.address() as any).port}/api/conversations/12/website-assets`;
    calls.list.mockResolvedValue([]);calls.read.mockResolvedValue(Buffer.from("image"));
  });
  afterAll(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  it("requires authentication for reads and writes",async()=>{
    expect((await fetch(base)).status).toBe(401);
    expect((await fetch(base,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).status).toBe(401);
  });
  it("derives owner and project on the server and prohibits shared cache responses",async()=>{
    const r=await fetch(base,{headers:{"x-owner":"owner-a"}});
    expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(calls.list).toHaveBeenCalledWith("owner-a","12");
  });
  it("rejects client-supplied ownership or arbitrary download URLs",async()=>{
    const r=await fetch(base,{method:"POST",headers:{"x-owner":"owner-a","Content-Type":"application/json"},
      body:JSON.stringify({userId:"other",query:"gym",url:"http://127.0.0.1/private"})});
    expect(r.status).toBe(400);expect(calls.search).not.toHaveBeenCalled();
  });
  it("serves image bytes with private/no-store and nosniff headers",async()=>{
    const r=await fetch(`${base}/11111111-1111-4111-8111-111111111111/content`,{headers:{"x-owner":"owner-a"}});
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-type")).toContain("image/webp");
    expect(calls.read).toHaveBeenCalledWith("owner-a","12","11111111-1111-4111-8111-111111111111");
  });
});
