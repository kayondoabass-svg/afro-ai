// @vitest-environment node
import { beforeAll,afterAll,beforeEach,describe,it,expect,vi } from "vitest";
import express from "express";
import { createServer,type Server } from "node:http";
const mocks=vi.hoisted(()=>({query:vi.fn(),connect:vi.fn(),auth:vi.fn()}));
vi.mock("../db",()=>({pool:{query:mocks.query,connect:mocks.connect}}));
vi.mock("../founder-auth-records",()=>({
  authRecordSections:{"auth-projects":{label:"Auth projects"}},authRecords:mocks.auth
}));
vi.mock("../email-provider",()=>({activeEmailProvider:()=>"resend",sendEmail:vi.fn()}));
vi.mock("../replit_integrations/auth",()=>({FOUNDER_EMAIL:"founder@example.invalid"}));
vi.mock("../project-infrastructure/routes",()=>({isManagementOrigin:(origin:unknown)=>origin==="https://afroaigroup.com"}));
import { registerFounderOversight,founderOverview } from "../founder-oversight";
import { founderSections,recordFilters } from "../founder-records";
import { pollFounderAlerts } from "../founder-alerts";
let server:Server,base:string;
beforeAll(async()=>{
  const app=express();app.use(express.json());
  registerFounderOversight(app,(req:any,res,next)=>{
    const role=req.get("x-test-role");
    if(!role) return res.sendStatus(401);
    if(role!=="founder") return res.sendStatus(403);
    req.user={claims:{sub:"founder-only",email:"founder@example.invalid"}};next();
  });
  server=createServer(app);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  base=`http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.query.mockImplementation(async(input:any)=>{
    const text=typeof input==="string"?input:input.text;
    if(text.includes("count(*)::int total")) return {rows:[{total:1}]};
    if(text.includes("SELECT DISTINCT")) return {rows:[{status:"active"}]};
    if(text.includes("bool_and")) return {rows:[{ready:true}]};
    if(text.includes("sum(amount)")) return {rows:[{currency:"USD",amount:"12.50"},{currency:"UGX",amount:"100000"}]};
    if(text.includes("sum(payg_balance)")) return {rows:[{balance:"200",spent:"50"}]};
    if(text.includes(" n FROM")) return {rows:[{n:0}]};
    return {rows:[{id:"1",user_id:"customer",name:"Metadata",secret_hash:"MUST_NOT_LEAK",html_content:"PRIVATE_SOURCE"}]};
  });
  mocks.auth.mockResolvedValue({total:2});
});
const request=(path:string,role="founder",method="GET",body?:object,origin="https://afroaigroup.com")=>fetch(base+path,{
  method,headers:{"x-test-role":role,origin,"content-type":"application/json"},
  ...(body?{body:JSON.stringify(body)}:{})
});
describe("founder oversight boundaries",()=>{
  it.each(["","customer","team"])("rejects %s on every founder route before database access",async role=>{
    for(const [path,method] of [
      ["/api/founder/overview","GET"],["/api/founder/records/users","GET"],["/api/founder/alert-settings","GET"],
      ["/api/founder/alert-settings","PUT"],["/api/founder/alert-history","GET"],["/api/founder/alerts/test/acknowledge","POST"]
    ]) expect((await request(path,role,method)).status).toBe(role?403:401);
    expect(mocks.query).not.toHaveBeenCalled();expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("returns safe paginated metadata only, with private no-store responses",async()=>{
    const response=await request("/api/founder/records/email-projects?page=2&owner=customer");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const data=await response.json();
    expect(data.page).toBe(2);expect(data.pageSize).toBe(25);
    expect(JSON.stringify(data)).not.toMatch(/MUST_NOT_LEAK|PRIVATE_SOURCE|secret_hash|html_content/);
    expect(mocks.query.mock.calls.find(([q])=>q?.text?.includes("LIMIT 25"))?.[0].values).toEqual(["customer",25]);
  });
  it("rejects unknown/prototype sections without querying a database",async()=>{
    for(const id of ["not-a-report","constructor","__proto__"]) expect((await request(`/api/founder/records/${id}`)).status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("parameterizes search, owner, status and nested IDs",()=>{
    const payload="' OR 1=1 --%_";
    const filter=recordFilters(founderSections.apps,{q:payload,owner:payload,id:payload,status:payload});
    expect(filter.where).not.toContain(payload);
    expect(filter.params).toEqual(["%' OR 1=1 --\\%\\_%",payload,payload,payload]);
  });
  it("does not serialize key values, hashes, uploaded content or message bodies",()=>{
    for(const config of Object.values(founderSections)) expect(Object.keys(config.fields).join(","))
      .not.toMatch(/secret|public_key|\btoken\b|password|html_content|\bcontent\b|from_address|to_address|subject/);
  });
  it("shows unavailable counts instead of pretending failure is zero; keeps currencies separate",async()=>{
    const original=mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation((input:any,...args:any[])=>{
      if(input?.text?.includes("FROM email_projects")) throw new Error("SQL secret details");
      return original(input,...args);
    });
    const data=await founderOverview();
    expect(data.sections.find(s=>s.id==="email-projects")).toMatchObject({count:null,status:"unavailable"});
    expect(data.alerts.some(a=>a.id==="report-email-projects")).toBe(true);
    expect(data.finance.collectedCents).toBe(1250);
    expect(data.finance.collectedByCurrency).toContainEqual({currency:"UGX",amount:"100000"});
    expect(JSON.stringify(data)).not.toContain("SQL secret details");
    expect(data.finance.providerCostCents).toBeNull();
  });
  it("fails a broken record request clearly instead of returning empty success",async()=>{
    mocks.query.mockRejectedValue(new Error("SQL query with credentials"));
    const response=await request("/api/founder/records/email-keys");
    expect(response.status).toBe(503);expect(await response.text()).not.toContain("credentials");
  });
  it("does not allow customer subdomains to change founder settings or acknowledge alerts",async()=>{
    for(const [path,method] of [["/api/founder/alert-settings","PUT"],["/api/founder/alerts/test/acknowledge","POST"]]) {
      expect((await request(path,"founder",method,{enabled:true,recipientIds:[]},"https://customer.afroaigroup.com")).status).toBe(403);
    }
    expect(mocks.query).not.toHaveBeenCalled();expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("rejects arbitrary notification addresses and malformed recipients",async()=>{
    for(const body of [{enabled:true,recipientIds:["someone@example.invalid"]},{enabled:true,recipientIds:[-1]},{recipientIds:[]}]) {
      expect((await request("/api/founder/alert-settings","founder","PUT",body)).status).toBe(400);
    }
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("does not send notifications when no founder has opted in",async()=>{
    mocks.query.mockResolvedValue({rows:[]});
    const sender=vi.fn(),overview=vi.fn();
    await pollFounderAlerts(overview,sender);
    expect(overview).not.toHaveBeenCalled();expect(sender).not.toHaveBeenCalled();
  });
  it("claims each notification before sending and never automatically retries an uncertain delivery",async()=>{
    let claimed=false;
    const order:string[]=[];
    mocks.query.mockImplementation(async(input:string)=>{
      if(input.includes("SELECT user_id,recipient_ids")) return {rows:[{user_id:"founder-only",recipient_ids:[]}]};
      if(input.includes("SELECT email FROM team_members")) return {rows:[]};
      if(input.includes("SELECT alert_id,title,opened_at")) return {rows:[{alert_id:"fault",title:"Database unavailable",opened_at:"2026-10-16T00:00:00Z"}]};
      if(input.includes("INSERT INTO founder_alert_deliveries")) {
        order.push("claim");
        if(claimed) return {rows:[]};
        claimed=true;return {rows:[{alert_id:"fault"}]};
      }
      return {rows:[]};
    });
    const data={alerts:[{id:"fault",title:"Database unavailable",section:"users",severity:"error"}]} as any;
    const sender=vi.fn(async(_input:any)=>{order.push("send");throw new Error("ambiguous provider outcome");});
    await pollFounderAlerts(async()=>data,sender);
    await pollFounderAlerts(async()=>data,sender);
    expect(order).toEqual(["claim","send","claim"]);
    expect(sender).toHaveBeenCalledOnce();
    expect(sender.mock.calls[0][0]).toMatchObject({to:"founder@example.invalid",subject:"Afro AI founder alert"});
    expect(mocks.query.mock.calls.some(([sql,values])=>sql.includes("UPDATE founder_alert_deliveries") && values.at(-1)==="uncertain")).toBe(true);
  });
});
