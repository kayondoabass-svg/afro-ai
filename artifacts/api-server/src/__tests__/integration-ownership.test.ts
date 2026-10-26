// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
const mocks=vi.hoisted(()=>({query:vi.fn(),owner:vi.fn(),send:vi.fn(),release:vi.fn()}));
vi.mock("../db",()=>({pool:{query:mocks.query,connect:async()=>({query:mocks.query,release:mocks.release})}}));
vi.mock("../storage",()=>({storage:{getUser:mocks.owner}}));
vi.mock("../email-provider",()=>({activeEmailProvider:()=>"resend"}));
import { registerIntegrationProjectRoutes } from "../integration-project-routes";

const projects=[{id:11,user_id:"alpha",name:"Alpha private project"},{id:22,user_id:"beta",name:"Beta private project"},{id:33,user_id:"alpha",name:"Another alpha project"}];
const keys=[{id:101,user_id:"alpha",project_id:11,name:"Alpha key"},{id:202,user_id:"beta",project_id:22,name:"Beta key"},{id:303,user_id:"alpha",project_id:33,name:"Other project key"}];
const widgets=[{id:31,user_id:"alpha"},{id:32,user_id:"beta"}];
const foreignCredential="b".repeat(32);
let base:string,server:Server;
let writes:number;

beforeAll(async()=>{
  const app=express();app.use(express.json());
  // Test-only identities on this isolated server. Production auth is unchanged.
  registerIntegrationProjectRoutes(app,(req:any,res,next)=>{
    const id=req.get("x-test-owner");
    if(!id) return res.sendStatus(401);
    req.user={claims:{sub:id==="missing-identity"?undefined:id,email:"founder@example.invalid"}};
    next();
  },mocks.send);
  server=createServer(app);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  base=`http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
beforeEach(()=>{
  vi.clearAllMocks();writes=0;
  mocks.owner.mockResolvedValue({email:"alpha@example.invalid"});
  mocks.query.mockImplementation(async(sql:string,values:any[]=[])=>{
    const result=(rows:any[])=>({rows,rowCount:rows.length});
    if(/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return result([]);
    if(sql.includes("FROM email_projects p WHERE user_id=$1"))
      return result(projects.filter(p=>p.user_id===values[0]));
    if(sql.startsWith("SELECT * FROM email_projects"))
      return result(projects.filter(p=>p.id===Number(values[0]) && p.user_id===values[1]));
    if(sql.includes("FROM chatbot_widgets w"))
      return result(widgets.filter(w=>w.id===Number(values[0]) && w.user_id===values[1]).map(()=>({enforcement:"required"})));
    if(sql.includes("FROM email_api_keys k JOIN email_key_state") || sql.startsWith("SELECT s.key_id"))
      return result(keys.filter(k=>k.id===Number(values[0]) && k.user_id===values[1] && (values.length<3 || k.project_id===Number(values[2]))));
    if(sql.startsWith("SELECT") && sql.includes("FROM chatbot_api_credentials"))
      return result([{id:Number(values[0])===31?"a".repeat(32):foreignCredential,name:"Private metadata",prefix:"nonsecret-preview"}]);
    if(sql.startsWith("UPDATE chatbot_api_credentials")) {
      const allowed=values[0]==="a".repeat(32) && Number(values[1])===31;
      if(allowed) writes++;
      return result(allowed?[{id:values[0]}]:[]);
    }
    if(sql.startsWith("DELETE FROM email_project_domains")) {
      const allowed=Number(values[0])===11 && Number(values[1])===61 && values[2]==="alpha";
      if(allowed) writes++;
      return result(allowed?[{domain_id:61}]:[]);
    }
    if(sql.startsWith("INSERT INTO email_projects")) {
      writes++;
      return result([{id:44,user_id:values[0],name:values[1]}]);
    }
    if(/^(INSERT|UPDATE|DELETE)/.test(sql)) {writes++;throw new Error("Unexpected mutation");}
    throw new Error("Unexpected query");
  });
});
const request=(path:string,method="GET",body?:object,owner="alpha")=>fetch(`${base}${path}`,{
  method,headers:{"content-type":"application/json",...(owner?{"x-test-owner":owner}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
});

describe("customer content is owner-only",()=>{
  it.each(["","missing-identity"])("rejects requests without a real signed-in identity (%s)",async owner=>{
    expect((await request("/api/email-api/projects","GET",undefined,owner)).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("lists only the caller's projects and prevents private response caching",async()=>{
    for(const owner of ["alpha","beta"]) {
      const response=await request("/api/email-api/projects?userId=someone-else","GET",undefined,owner);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual(projects.filter(p=>p.user_id===owner).map(p=>({id:p.id,userId:p.user_id,name:p.name})));
    }
  });
  it("ignores an injected owner when creating a project",async()=>{
    const response=await request("/api/email-api/projects","POST",{name:"Mine",userId:"beta",user_id:"beta",isFounder:true});
    expect(response.status).toBe(201);
    expect((await response.json()).userId).toBe("alpha");
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO email_projects"),["alpha","Mine"]);
  });
  it.each([
    ["/api/email-api/projects/22","GET",undefined],
    ["/api/email-api/projects/22","PATCH",{name:"Take over",userId:"alpha"}],
    ["/api/email-api/projects/22/domains/62","DELETE",undefined],
    ["/api/email-api/projects/22/test","POST",{keyId:202,consent:true,to:"test@example.invalid"}],
    ["/api/email-api/keys/202/rotate","POST",{}],
    ["/api/email-api/keys/202/revoke","POST",{confirm:true}],
    ["/api/chatbots/32/api-credentials","GET",undefined],
    ["/api/chatbots/32/api-credentials","POST",{name:"Stolen key"}],
    [`/api/chatbots/32/api-credentials/${foreignCredential}/rotate`,"POST",{}],
    [`/api/chatbots/32/api-credentials/${foreignCredential}/revoke`,"POST",{confirm:true}],
    ["/api/chatbots/32/api-credentials/enforce","POST",{confirm:true}],
  ] as const)("blocks another owner's resource: %s %s",async(path,method,body)=>{
    const response=await request(path,method,body);
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("Beta private");
    expect(writes).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([202,303])("cannot use a foreign-account or wrong-project key through an owned project (%s)",async keyId=>{
    expect((await request("/api/email-api/projects/11/test","POST",{keyId,consent:true,to:"test@example.invalid"})).status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(writes).toBe(0);
  });
  it("cannot unlink another account's domain through an owned project",async()=>{
    expect((await request("/api/email-api/projects/11/domains/62","DELETE")).status).toBe(404);
    expect(writes).toBe(0);
  });
  it("can remove only its own project's domain grant, not the provider identity",async()=>{
    const response=await request("/api/email-api/projects/11/domains/61","DELETE");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({success:true,providerIdentityDeleted:false});
    expect(writes).toBe(1);
  });
  it.each(["rotate","revoke"])("cannot %s a foreign credential through an owned chatbot",async action=>{
    const response=await request(`/api/chatbots/31/api-credentials/${foreignCredential}/${action}`,"POST",{confirm:true});
    expect(response.status).toBe(404);
    expect(writes).toBe(0);
  });
  it("returns only credentials of the chatbot the caller owns",async()=>{
    const response=await request("/api/chatbots/31/api-credentials");
    expect(response.status).toBe(200);
    expect((await response.json()).keys.map((key:any)=>key.id)).toEqual(["a".repeat(32)]);
  });
});
