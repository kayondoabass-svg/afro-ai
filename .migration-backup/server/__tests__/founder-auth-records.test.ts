// @vitest-environment node
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {authRecords} from "../founder-auth-records";
const databaseId="11111111-1111-4111-8111-111111111111";
let requests:any[];
beforeEach(()=>{
  requests=[];
  vi.stubEnv("AUTH_D1_DATABASE_ID",databaseId);
  vi.stubEnv("CLOUDFLARE_AUTH_D1_DATABASE_ID",databaseId);
  vi.stubEnv("CLOUDFLARE_API_TOKEN","fake-test-token");
  vi.stubGlobal("fetch",vi.fn(async(url:string,options:any)=>{
    if(!url.endsWith("/query")) return Response.json({success:true,result:{uuid:databaseId,name:"afro-ai-auth"}});
    const body=JSON.parse(options.body);requests.push(body);
    const results=body.sql.includes("count(*) total")?[{total:1}]:
      body.sql.includes("SELECT DISTINCT")?[{status:"active"}]:
      [{id:"record",tenant_id:"tenant",domain:"example.invalid",email:"member@example.invalid",
        secret_hash:"PRIVATE_HASH",password_hash:"PRIVATE_PASSWORD",challenge:"PRIVATE_CHALLENGE",secret_preview:"PRIVATE_PREVIEW"}];
    return Response.json({success:true,result:[{success:true,results}]});
  }));
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("founder Auth reporting",()=>{
  it.each(["auth-projects","auth-users","auth-domains","auth-keys"])("projects explicit safe metadata for %s",async section=>{
    const result=await authRecords(section,{});
    expect(result.total).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|secret_hash|password_hash|challenge|secret_preview/);
  });
  it("uses website domain fields and binds owner/search/ID filters rather than building SQL from input",async()=>{
    const input="' OR 1=1 --%_";
    const result=await authRecords("auth-domains",{q:input,owner:"owner-1",id:"domain-1",status:"verified",page:2});
    expect(requests[0].sql).not.toContain(input);
    expect(requests[0].params).toContain("owner-1");
    expect(requests[0].sql).toContain("owner_user_id=?");
    expect(requests[1].params.at(-1)).toBe(25);
    expect(result).toHaveProperty("columns",expect.arrayContaining([{key:"domain",label:"domain"}]));
  });
  it("fails closed if the configured database is not the Auth database",async()=>{
    vi.mocked(fetch).mockResolvedValue(Response.json({success:true,result:{uuid:databaseId,name:"customer-project-files"}}));
    await expect(authRecords("auth-projects",{})).rejects.toThrow("Auth reporting unavailable");
    expect(requests).toEqual([]);
  });
  it("does not treat Cloudflare success:false as an empty report",async()=>{
    vi.mocked(fetch).mockImplementation(async(url:any)=>{
      return String(url).endsWith("/query")?Response.json({success:false,errors:[{message:"private provider diagnostics"}]}):
        Response.json({success:true,result:{uuid:databaseId,name:"afro-ai-auth"}});
    });
    await expect(authRecords("auth-projects",{})).rejects.toThrow("Auth reporting unavailable");
  });
});
