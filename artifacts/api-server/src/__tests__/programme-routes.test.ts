// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import express from "express";
import {createServer,type Server} from "node:http";
const m=vi.hoisted(()=>({query:vi.fn(),role:"" as string}));
vi.mock("../db",()=>({pool:{query:m.query,connect:async()=>({query:m.query,release:()=>{}})}}));
vi.mock("../mailer",()=>({sendProgrammeEmail:vi.fn()}));
vi.mock("../project-infrastructure/routes",()=>({isManagementOrigin:(o:unknown)=>o==="https://afroaigroup.com"}));
import {registerProgrammeRoutes} from "../programmes/routes";
import {csv} from "../programmes/core";
let server:Server,base:string;
const founder=(req:any,res:any,next:any)=>{
  if(!req.get("x-role"))return res.sendStatus(401);
  if(req.get("x-role")!=="founder")return res.sendStatus(403);
  req.user={claims:{sub:"founder",email:"founder@example.invalid"}};next();
};
beforeAll(async()=>{
  const app=express();app.use(express.json());
  registerProgrammeRoutes(app,{isFounder:founder,isAuthenticated:(req:any,res,next)=>{
    if(!req.get("x-role"))return res.sendStatus(401);
    req.user={claims:{sub:req.get("x-role"),email:`${req.get("x-role")}@example.invalid`}};next();
  }});
  server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  base=`http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(()=>new Promise<void>(r=>server.close(()=>r())));
beforeEach(()=>{
  vi.clearAllMocks();m.role="";
  m.query.mockImplementation(async(sql:string,args:any[]=[])=>{
    if(sql.includes("SELECT id,email FROM users"))return {rows:args[0]==="unverified"?[]:[{id:args[0],email:`${args[0]}@example.invalid`}]};
    if(sql.includes("SELECT a.*,to_jsonb"))return {rows:[{id:7,email:"owner@example.invalid",company_name:"Owner company",status:"approved",
      metadata:{owner_user_id:"owner"},explicit_owner_id:"owner"}]};
    if(sql.includes("SELECT role FROM programme_members"))return {rows:m.role?[{role:m.role}]:[]};
    return {rows:[]};
  });
});
const request=(path:string,role="",method="GET",body?:object,origin="https://afroaigroup.com")=>fetch(base+path,{
  method,headers:{"x-role":role,origin,"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),
});
describe("programme management authorization",()=>{
  it.each([
    ["/api/founder/programmes","GET",undefined],
    ["/api/founder/programmes/business/7","GET",undefined],
    ["/api/founder/programmes/business/7/review","POST",{decision:"approved"}],
    ["/api/founder/programmes/business/7/payouts","POST",{}],
    ["/api/founder/programmes/business/7/commissions/1/adjust","POST",{reason:"bad record"}],
    ["/api/founder/programmes/emails/1/resend","POST",{confirmation:"RESEND"}],
    ["/api/founder/programmes/business/7/export?kind=payouts","GET",undefined],
  ] as const)("denies non-founders before database access: %s",async(path,method,body)=>{
    expect((await request(path,"",method,body)).status).toBe(401);
    expect((await request(path,"customer",method,body)).status).toBe(403);
    expect((await request(path,"team-admin",method,body)).status).toBe(403);
    expect(m.query).not.toHaveBeenCalled();
  });
  it("requires verified database identity, not a claimed email",async()=>{
    expect((await request("/api/programmes/me","unverified")).status).toBe(403);
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining("email_verified IS NOT NULL"),["unverified"]);
  });
  it.each([
    ["/api/programmes/business/7","GET",undefined],
    ["/api/programmes/affiliate/7","GET",undefined],
    ["/api/programmes/business/7/profile","PATCH",{payoutMethod:"bank",userId:"owner"}],
    ["/api/programmes/business/7/invitations","POST",{email:"other@example.invalid",role:"sales"}],
    ["/api/programmes/business/7/export?kind=commissions","GET",undefined],
  ] as const)("rejects cross-account records and forged owner fields: %s",async(path,method,body)=>{
    expect((await request(path,"outsider",method,body)).status).toBe(404);
    expect(m.query.mock.calls.some(([sql])=>/INSERT INTO programme_members|UPDATE programme_applications SET/.test(sql))).toBe(false);
  });
  it("prevents sales members from accessing financial exports or inviting finance staff",async()=>{
    m.role="sales";
    expect((await request("/api/programmes/business/7/export?kind=commissions","staff")).status).toBe(403);
    expect((await request("/api/programmes/business/7/invitations","staff","POST",{email:"finance@example.invalid",role:"finance"})).status).toBe(403);
  });
  it("requires a completed-manual-payment confirmation before accounting",async()=>{
    const res=await request("/api/founder/programmes/affiliate/7/payouts","founder","POST",{
      currency:"USD",commissionIds:[1],method:"bank",reference:"not-yet-paid",
    });
    expect(res.status).toBe(400);
    expect(m.query).not.toHaveBeenCalled();
  });
  it("blocks mutations from customer-hosted origins before access or writes",async()=>{
    expect((await request("/api/founder/programmes/business/7/review","founder","POST",{decision:"approved"},"https://evil.afroaigroup.com")).status).toBe(403);
    expect((await request("/api/programmes/invitations/accept","owner","POST",{token:"a".repeat(64)},"https://evil.afroaigroup.com")).status).toBe(403);
    expect(m.query).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs/programmes without SQL",async()=>{
    expect((await request("/api/founder/programmes?programme=__proto__","founder")).status).toBe(400);
    expect((await request("/api/programmes/business/not-an-id","owner")).status).toBe(400);
    expect(m.query).not.toHaveBeenCalled();
  });
  it("fails explicitly without exposing SQL/provider diagnostics",async()=>{
    m.query.mockRejectedValue(new Error("SQL password=DO_NOT_EXPOSE private row"));
    const res=await request("/api/programmes/me","owner");
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.text()).not.toMatch(/DO_NOT_EXPOSE|password|private row/);
  });
  it("escapes spreadsheet formulas and quotes in scoped exports",()=>{
    expect(csv([{name:" =SUM(A1)",reference:'"quoted"',amount:5}])).toContain("' =SUM(A1)");
    expect(csv([{reference:'"quoted"'}])).toContain('""quoted""');
  });
});
