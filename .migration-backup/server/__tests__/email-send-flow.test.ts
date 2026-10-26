// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { beforeEach, expect, it, vi } from "vitest";

const send=vi.fn(),reserve=vi.fn(),settle=vi.fn(),insert=vi.fn();
function handler() {
  const source=readFileSync("server/routes.ts","utf8");
  const ast=ts.createSourceFile("routes.ts",source,ts.ScriptTarget.Latest,true);
  let callback:ts.FunctionDeclaration|undefined;
  const visit=(n:ts.Node)=>{if(ts.isFunctionDeclaration(n)&&n.name?.text==="emailApiSend") callback=n;ts.forEachChild(n,visit);};
  visit(ast);
  if (!callback) throw new Error("Email route missing");
  const js=ts.transpileModule(`const handler=${callback.getText(ast)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const noop=()=>null;
  const db={select:()=>({from:()=>({where:async()=>[{id:4}]})}),insert:()=>({values:insert}),
    update:()=>({set:()=>({where:async()=>{}})})};
  const values:Record<string,any>={db,pool:{query:async()=>({rows:[]})},emailApiKeys:{},emailApiDomains:{},emailApiLogs:{},
    dbEq:noop,dbAnd:noop,sql:noop,storage:{getUser:async()=>({email:"customer@example.test"})},
    isFounderEmail:()=>false,emailKeyAccess:async()=>({projectId:1,quotaKeyId:2,used:0,quotaLimit:10}),
    emailProjectAllowsDomain:async()=>true,isSuppressed:async()=>false,
    resolveEmailKey:async()=>({id:2,userId:"owner",isActive:true}),reserveEmailSend:reserve,
    settleEmailSend:settle,emailPayloadHash:()=>"hash",sendProjectEmail:send};
  return new Function(...Object.keys(values),`${js};return handler;`)(...Object.values(values));
}
const request=()=>({headers:{authorization:"Bearer sk_live_test","idempotency-key":"test-request"},body:{
  from:"hello@example.test",to:"recipient@example.test",subject:"Test",text:"Test"}});
function response() {
  const r:any={statusCode:200,setHeader:vi.fn(),body:null};
  r.status=(code:number)=>{r.statusCode=code;return r;};r.json=(body:any)=>{r.body=body;return r;};return r;
}
beforeEach(()=>{
  vi.resetAllMocks();send.mockResolvedValue({messageId:"provider-id"});insert.mockResolvedValue({});
  reserve.mockResolvedValue({id:"request-id",status:"pending",replayed:false});settle.mockResolvedValue(undefined);
});
it("records acceptance with a stable provider key and no blind retry",async()=>{
  const res=response();await handler()(request(),res);
  expect(res.body).toMatchObject({accepted:true,outcome:"accepted",messageId:"provider-id",requestId:"request-id"});
  expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({idempotencyKey:"email-api/request-id"}));
  expect(reserve).toHaveBeenCalledWith(expect.objectContaining({recipientCount:1,exempt:false}));
});
it("does not call the provider again on replay",async()=>{
  reserve.mockResolvedValue({id:"request-id",status:"accepted",messageId:"provider-id",replayed:true});
  const res=response();await handler()(request(),res);
  expect(res.body.replayed).toBe(true);expect(send).not.toHaveBeenCalled();
});
it("retains uncertain outcomes without refund or retry",async()=>{
  send.mockRejectedValue({code:"EMAIL_OUTCOME_UNKNOWN",uncertain:true});
  const res=response();await handler()(request(),res);
  expect(res.statusCode).toBe(202);expect(res.body).toMatchObject({accepted:false,outcome:"uncertain"});
  expect(settle).toHaveBeenCalledWith("request-id","owner","uncertain",undefined,"EMAIL_OUTCOME_UNKNOWN");
  expect(send).toHaveBeenCalledOnce();
});
it("returns a useful safe definitive rejection and releases only through settlement",async()=>{
  send.mockRejectedValue({code:"EMAIL_PROVIDER_AUTH",uncertain:false,message:"Contact platform support"});
  const res=response();await handler()(request(),res);
  expect(res.statusCode).toBe(503);expect(res.body).toMatchObject({error:"Contact platform support",code:"EMAIL_PROVIDER_AUTH"});
  expect(settle).toHaveBeenCalledWith("request-id","owner","rejected",undefined,"EMAIL_PROVIDER_AUTH");
});
it("never reports accepted mail as a failed send when bookkeeping fails",async()=>{
  const log=vi.spyOn(console,"error").mockImplementation(()=>{});
  try {
    insert.mockRejectedValue(new Error("database disconnected"));
    const res=response();await handler()(request(),res);
    expect(res.statusCode).toBe(202);expect(res.body.accepted).toBe(true);
    expect(settle).not.toHaveBeenCalledWith("request-id","owner","rejected",expect.anything(),expect.anything());
    expect(send).toHaveBeenCalledOnce();
  } finally {log.mockRestore();}
});
