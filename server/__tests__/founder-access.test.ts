// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { FOUNDER_EMAILS, isFounderEmail, presentEmailApiKey } from "../founder-access";

const mocks = vi.hoisted(() => ({ select:vi.fn(), getUser:vi.fn(), keyAccess:vi.fn() }));
vi.mock("../db", () => ({db:{select:mocks.select}}));
vi.mock("../storage", () => ({storage:{getUser:mocks.getUser,createUsageLog:vi.fn()}}));
vi.mock("../mailer", () => ({sendQuotaReachedEmail:vi.fn()}));
import { aiQuotaGuard, assertOwnerDailyCap } from "../replit_integrations/quota";

function rows(...batches: any[][]) {
  const key=batches[0]?.[0];
  mocks.keyAccess.mockResolvedValue({used:key?.emailsSentMonth,quotaLimit:key?.monthlyLimit,quotaKeyId:key?.id,projectId:1});
  mocks.select.mockImplementation(() => ({from:() => ({where:() => Promise.resolve(batches.shift() || [])})}));
}
function response() {
  const res:any = {statusCode:200,body:null,setHeader:vi.fn()};
  res.status = (code:number) => {res.statusCode=code;return res};
  res.json = (body:any) => {res.body=body;return res};
  return res;
}
// Execute the actual route callback without starting unrelated services.
function emailSendHandler(secretMatches = true) {
  const source=readFileSync(new URL("../routes.ts",import.meta.url),"utf8");
  const ast=ts.createSourceFile("routes.ts",source,ts.ScriptTarget.Latest,true);
  let callback:ts.ArrowFunction|ts.FunctionDeclaration|undefined;
  const visit=(node:ts.Node) => {
    if(ts.isFunctionDeclaration(node) && node.name?.text==="emailApiSend") callback=node;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text==="post" && node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text==="/api/email-api/send") {
      const arrow=node.arguments.find(ts.isArrowFunction);
      if(arrow) callback=arrow;
    }
    ts.forEachChild(node,visit);
  };
  visit(ast);
  if (!callback) throw new Error("Email send callback missing");
  const js=ts.transpileModule(`const handler=${callback.getText(ast)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  return new Function("db","emailApiKeys","dbEq","storage","isFounderEmail","bcrypt","emailKeyAccess","resolveEmailKey",`${js};return handler;`)(
    {select:mocks.select},{publicKey:"public_key",isActive:"is_active"},()=>true,
    {getUser:mocks.getUser},isFounderEmail,{compare:vi.fn().mockResolvedValue(secretMatches)},mocks.keyAccess,
    async () => secretMatches ? (await mocks.select().from().where())[0] : null,
  );
}
beforeEach(() => vi.clearAllMocks());
describe("founder customer-quota exemptions", () => {
  it("uses only the server allowlist, not role names or lookalike emails", () => {
    expect(isFounderEmail(FOUNDER_EMAILS[0])).toBe(true);
    for (const value of [undefined,null,{isFounder:true},"founder",`${FOUNDER_EMAILS[0]}.evil`,`other@${FOUNDER_EMAILS[0].split("@")[1]}`]) expect(isFounderEmail(value)).toBe(false);
  });
  it("upgrades existing key presentation without changing keys, hashes or counters", () => {
    const key={plan:"starter",monthlyLimit:1000,emailsSentMonth:1500,publicKey:"test-only",secretKeyHash:"test-only-hash",isActive:false};
    const shown=presentEmailApiKey(key,FOUNDER_EMAILS[0]);
    expect(shown).toMatchObject({plan:"enterprise",quotaExempt:true,founderAccess:true,monthlyLimit:1000,emailsSentMonth:1500,isActive:false});
    expect(shown.secretKeyHash).toBeUndefined();
    expect(key).toMatchObject({plan:"starter",secretKeyHash:"test-only-hash",isActive:false});
    expect(presentEmailApiKey(key,"customer@example.test").quotaExempt).toBe(false);
  });
  it.each(["chat","image","audio","video"] as const)("exempts authenticated founder %s while retaining usage context", async kind => {
    rows([{email:FOUNDER_EMAILS[0],plan:"starter"}]);
    const req:any={user:{claims:{sub:"founder-fixture"}}},res=response(),next=vi.fn();
    await aiQuotaGuard(kind)(req,res,next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.aiContext).toMatchObject({kind,plan:"business",userId:"founder-fixture"});
    expect(res.setHeader).toHaveBeenCalledWith("X-AfroAI-Quota-Exempt","founder");
    expect(mocks.select).toHaveBeenCalledOnce();
  });
  it("does not trust a founder email supplied in caller claims over the stored owner", async () => {
    rows([{email:"customer@example.test",plan:"starter"}],[{n:1000}]);
    const res=response(),next=vi.fn();
    await aiQuotaGuard("chat")({user:{claims:{sub:"customer",email:FOUNDER_EMAILS[0]}}} as any,res,next);
    expect(res.statusCode).toBe(429);
    expect(next).not.toHaveBeenCalled();
  });
  it("rejects anonymous and missing-account callers", async () => {
    const next=vi.fn(),res=response();
    await aiQuotaGuard("chat")({} as any,res,next);
    expect(res.statusCode).toBe(401);
    rows([]);
    await aiQuotaGuard("chat")({user:{claims:{sub:"missing"}}} as any,res,next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
  it("exempts public project usage only after loading its real founder owner", async () => {
    rows([{email:FOUNDER_EMAILS[0],plan:"starter"}]);
    expect(await assertOwnerDailyCap({ownerUserId:"founder-fixture",kind:"video"})).toBeNull();
    rows([{email:"customer@example.test",plan:"starter"}],[{n:500}]);
    expect(await assertOwnerDailyCap({ownerUserId:"customer",kind:"chat"})).toMatchObject({status:429});
    rows([]);
    expect(await assertOwnerDailyCap({ownerUserId:"missing",kind:"chat"})).toMatchObject({status:404});
  });
  it("applies the exemption to existing founder email keys without bypassing input checks", async () => {
    rows([{userId:"founder-fixture",isActive:true,monthlyLimit:1000,emailsSentMonth:1500}]);
    mocks.getUser.mockResolvedValue({email:FOUNDER_EMAILS[0]});
    const res=response();
    await emailSendHandler()({headers:{authorization:"Bearer sk_live_test_only"},body:{}},res);
    expect(mocks.getUser).toHaveBeenCalledWith("founder-fixture");
    expect(res.statusCode).toBe(400); // Valid body and verified domain still required.
  });
  it("keeps monthly caps for regular keys even when a caller claims founder access", async () => {
    rows([{userId:"customer",isActive:true,monthlyLimit:1000,emailsSentMonth:1500}]);
    mocks.getUser.mockResolvedValue({email:"customer@example.test"});
    const res=response();
    await emailSendHandler()({headers:{authorization:"Bearer afro_live_test"},user:{claims:{email:FOUNDER_EMAILS[0]}},body:{founderAccess:true}},res);
    expect(res.statusCode).toBe(429);
  });
  it("does not grant founder privileges through a publicly shared key", async () => {
    rows([{userId:"founder-fixture",isActive:true,monthlyLimit:1000,emailsSentMonth:1500}]);
    mocks.getUser.mockResolvedValue({email:FOUNDER_EMAILS[0]});
    const res=response();
    await emailSendHandler()({headers:{authorization:"Bearer afro_live_test"},body:{}},res);
    expect(res.statusCode).toBe(429);
  });
  it("requires a valid secret rather than just the secret-key prefix", async () => {
    rows([{userId:"founder-fixture",isActive:true,secretKeyHash:"test-only-hash"}]);
    const res=response();
    await emailSendHandler(false)({headers:{authorization:"Bearer sk_live_incorrect"},body:{}},res);
    expect(res.statusCode).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("does not reactivate a disabled founder key", async () => {
    rows([{userId:"founder-fixture",isActive:false,monthlyLimit:1000,emailsSentMonth:1500}]);
    const res=response();
    await emailSendHandler()({headers:{authorization:"Bearer afro_live_test"},body:{}},res);
    expect(res.statusCode).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("honors the original quota after key rotation instead of granting a fresh allowance",async()=>{
    rows([{id:2,userId:"customer",isActive:true,monthlyLimit:1000,emailsSentMonth:0}]);
    mocks.keyAccess.mockResolvedValue({used:1000,quotaLimit:1000,quotaKeyId:1,projectId:1});
    mocks.getUser.mockResolvedValue({email:"customer@example.test"});
    const res=response();
    await emailSendHandler()({headers:{authorization:"Bearer sk_live_test"},body:{}},res);
    expect(res.statusCode).toBe(429);
    expect(mocks.keyAccess).toHaveBeenCalledWith(2);
  });
});
