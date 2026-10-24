// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks=vi.hoisted(()=>({query:vi.fn(),connect:vi.fn(),client:{query:vi.fn(),release:vi.fn()}}));
vi.mock("../db",()=>({pool:{query:mocks.query,connect:mocks.connect}}));
import { integrationId, ownedEmailProject, emailKeyAccess, emailProjectAllowsDomain, createProjectEmailKey, revokeProjectEmailKey } from "../email-projects";
import { ownedChatbotApiPolicy, resolvePrivateChatbotApiKey, chatbotLegacyApiAllowed, createChatbotApiCredential, enforcePrivateChatbotApi } from "../chatbot-api-credentials";
import { INTEGRATION_PROJECT_SCHEMA } from "../integration-project-schema";

beforeEach(()=>{
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue(mocks.client);
  mocks.query.mockResolvedValue({rows:[],rowCount:0});
  mocks.client.query.mockResolvedValue({rows:[],rowCount:0});
});
describe("integration resource boundaries",()=>{
  it.each([0,-1,"NaN","1.5",{},Infinity])("rejects invalid numeric resource ID %s",id=>expect(()=>integrationId(id)).toThrow());
  it("uses owner and project together and hides someone else's project",async()=>{
    await expect(ownedEmailProject("owner",4)).rejects.toMatchObject({status:404});
    expect(mocks.query.mock.calls[0][1]).toEqual([4,"owner"]);
  });
  it("fails closed when key project state is missing",async()=>{
    await expect(emailKeyAccess(7)).rejects.toMatchObject({status:503});
  });
  it("rejects revoked credentials even if the old key active flag was corrupted",async()=>{
    mocks.query.mockResolvedValue({rows:[{revoked_at:new Date()}],rowCount:1});
    await expect(emailKeyAccess(7)).rejects.toMatchObject({status:401});
  });
  it("checks the domain, owner, project and genuine verified status",async()=>{
    expect(await emailProjectAllowsDomain(4,"owner",8)).toBe(false);
    expect(mocks.query.mock.calls[0][1]).toEqual([4,"owner",8]);
    expect(mocks.query.mock.calls[0][0]).toContain("d.status='verified'");
  });
});
describe("safe email key lifecycle",()=>{
  function keyClient({verified=true,rotation=false,replacement=false}={}) {
    mocks.client.query.mockImplementation(async(sql:string)=>{
      if(sql.startsWith("SELECT * FROM email_projects")) return {rows:[{id:4,user_id:"owner"}]};
      if(sql.includes("JOIN email_key_state s ON s.key_id=k.id") && sql.includes("FOR UPDATE"))
        return {rows:rotation?[{id:7,quota_key_id:2,monthly_limit:10,plan:"starter"}]:[]};
      if(sql.includes("s.replaces_key_id=")) return {rows:[],rowCount:replacement?1:0};
      if(sql.includes("JOIN email_api_domains")) return {rowCount:verified?1:0,rows:[]};
      if(sql.startsWith("INSERT INTO email_api_keys")) return {rows:[{id:8,user_id:"owner",secret_key_hash:"test-hash",plan:"starter"}]};
      return {rowCount:1,rows:[]};
    });
  }
  it("gates new keys on the selected project's verified sending domain",async()=>{
    keyClient({verified:false});
    await expect(createProjectEmailKey("owner","owner@example.invalid",4,"Server")).rejects.toMatchObject({status:409});
    expect(mocks.client.query.mock.calls.some(([sql])=>sql.startsWith("INSERT INTO email_api_keys"))).toBe(false);
    expect(mocks.client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.client.release).toHaveBeenCalledOnce();
  });
  it("reveals one new secret, stores only a hash and preserves the original quota group during rotation",async()=>{
    keyClient({rotation:true});
    const result=await createProjectEmailKey("owner","owner@example.invalid",4,"Server",7);
    expect(result.secretKey).toMatch(/^sk_live_[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain("test-hash");
    expect(result.quotaKeyId).toBe(2);
    const insert=mocks.client.query.mock.calls.find(([sql])=>sql.startsWith("INSERT INTO email_api_keys"))!;
    expect(insert[1]).not.toContain(result.secretKey);
    expect(insert[1][3]).toMatch(/^\$2[aby]\$/);
    expect(mocks.client.query.mock.calls.find(([sql])=>sql.startsWith("INSERT INTO email_key_state"))![1]).toEqual([8,4,2,7,createHash("sha256").update(result.secretKey).digest("hex")]);
    expect(mocks.client.query.mock.calls.some(([sql])=>sql.includes("SET is_active=false"))).toBe(false);
  });
  it("blocks duplicate outstanding replacements, without revoking the original",async()=>{
    keyClient({rotation:true,replacement:true});
    await expect(createProjectEmailKey("owner",null,4,"Server",7)).rejects.toMatchObject({status:409});
  });
  it("revocation retains the key, project and history and never hard-deletes records",async()=>{
    mocks.client.query.mockResolvedValue({rows:[{key_id:7}],rowCount:1});
    await revokeProjectEmailKey("owner",7);
    const sql=mocks.client.query.mock.calls.map(call=>call[0]).join(";");
    expect(sql).toContain("revoked_at=coalesce");
    expect(sql).toContain("is_active=false");
    expect(sql).not.toMatch(/\bDELETE\b/);
    expect(sql).toContain("COMMIT");
  });
  it("does not revoke someone else's key",async()=>{
    await expect(revokeProjectEmailKey("other",7)).rejects.toMatchObject({status:404});
    expect(mocks.client.query.mock.calls.some(([sql])=>sql.startsWith("UPDATE"))).toBe(false);
  });
});
describe("private chatbot API authentication",()=>{
  const token=`sk_chatbot_${"a".repeat(32)}_${"b".repeat(64)}`;
  it("never treats a public widget ID as a private secret",async()=>{
    expect(await resolvePrivateChatbotApiKey("afroai_public_widget")).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("requires the complete random secret, not just its visible prefix",async()=>{
    expect(await resolvePrivateChatbotApiKey(token.slice(0,43))).toBeNull();
  });
  it("fails closed for an unknown, revoked or incorrect credential",async()=>{
    expect(await resolvePrivateChatbotApiKey(token)).toBeNull();
    mocks.query.mockResolvedValue({rows:[{widget_id:4,secret_hash:"a".repeat(64)}]});
    expect(await resolvePrivateChatbotApiKey(token)).toBeNull();
  });
  it("resolves a valid hashed secret to exactly its widget",async()=>{
    mocks.query.mockResolvedValueOnce({rows:[{widget_id:4,secret_hash:createHash("sha256").update(token).digest("hex")}]}).mockResolvedValueOnce({rowCount:1});
    expect(await resolvePrivateChatbotApiKey(token)).toBe(4);
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain(token);
  });
  it("preserves public-ID API compatibility only for explicitly legacy widgets",async()=>{
    expect(await chatbotLegacyApiAllowed(4)).toBe(false);
    mocks.query.mockResolvedValueOnce({rows:[{enforcement:"required"}]});
    expect(await chatbotLegacyApiAllowed(4)).toBe(false);
    mocks.query.mockResolvedValueOnce({rows:[{enforcement:"legacy"}]});
    expect(await chatbotLegacyApiAllowed(4)).toBe(true);
  });
  it("does not infer legacy status from missing policy metadata",async()=>{
    mocks.query.mockResolvedValue({rows:[{enforcement:null}]});
    await expect(ownedChatbotApiPolicy("owner",4)).rejects.toMatchObject({status:503});
  });
  it("generates a one-time secret but never stores its plaintext",async()=>{
    mocks.query.mockResolvedValue({rows:[{enforcement:"legacy"}]});
    mocks.client.query.mockImplementation(async(sql:string,args:any[])=>{
      if(sql.startsWith("SELECT id FROM chatbot_widgets")) return {rowCount:1};
      if(sql.startsWith("INSERT INTO chatbot_api_credentials")) return {rows:[{id:args[0],name:args[2],prefix:args[3],secret_hash:undefined}]};
      return {rowCount:1,rows:[]};
    });
    const result=await createChatbotApiCredential("owner",4,"Backend");
    expect(result.secretKey).toMatch(/^sk_chatbot_[a-f0-9]{32}_[a-f0-9]{64}$/);
    const args=mocks.client.query.mock.calls.find(([sql])=>sql.startsWith("INSERT INTO"))![1];
    expect(args).not.toContain(result.secretKey);
    expect(args[4]).toBe(createHash("sha256").update(result.secretKey).digest("hex"));
  });
  it("does not enable private-only enforcement without an active key",async()=>{
    mocks.query.mockResolvedValue({rows:[{enforcement:"legacy"}]});
    await expect(enforcePrivateChatbotApi("owner",4)).rejects.toMatchObject({status:409});
    expect(mocks.client.query.mock.calls.some(([sql])=>sql.startsWith("UPDATE"))).toBe(false);
  });
});
it("migration is additive, idempotent and never rewrites customer credentials",()=>{
  expect(INTEGRATION_PROJECT_SCHEMA).toContain("ON CONFLICT(key_id) DO NOTHING");
  expect(INTEGRATION_PROJECT_SCHEMA).toContain("SELECT id,'legacy'");
  expect(INTEGRATION_PROJECT_SCHEMA).toContain("VALUES(NEW.id,'required')");
  expect(INTEGRATION_PROJECT_SCHEMA).not.toMatch(/DELETE FROM|UPDATE email_api_keys|UPDATE chatbot_widgets/);
});
