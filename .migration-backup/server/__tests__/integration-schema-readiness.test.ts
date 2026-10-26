// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { prepareIntegrationSchema } from "../integration-schema-readiness";
import { CHATBOT_VERIFICATION_SCHEMA } from "../chatbot-verification-schema";
import { INTEGRATION_PROJECT_SCHEMA } from "../integration-project-schema";

function fixture({ ready=false, imported=ready, triggers=ready ? 4 : 0, fail=false, remainsMissing=false }={}) {
  let installed=ready, marker=imported, triggerCount=triggers;
  const query=vi.fn(async(text:string)=>{
    if(text.startsWith("SELECT bool_and")) return {rows:[{ready:installed}]};
    if(text.startsWith("SELECT\n")) return {rows:[{imported:marker,triggers:triggerCount}]};
    if(text===CHATBOT_VERIFICATION_SCHEMA) {
      if(fail) throw Object.assign(new Error("private database detail"),{code:"42501"});
    }
    if(text===INTEGRATION_PROJECT_SCHEMA && !remainsMissing) {
      installed=true;marker=true;triggerCount=4;
    }
    return {rows:[]};
  });
  const release=vi.fn();
  return {query,release,pool:{connect:vi.fn(async()=>({query,release}))}};
}

describe("integration schema startup gate",()=>{
  it("prepares missing schemas and verifies readiness before returning",async()=>{
    const f=fixture();
    await prepareIntegrationSchema(f.pool);
    expect(f.query).toHaveBeenCalledWith(CHATBOT_VERIFICATION_SCHEMA);
    expect(f.query).toHaveBeenCalledWith(INTEGRATION_PROJECT_SCHEMA);
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("uses a read-only fast path for a fully prepared installation",async()=>{
    const f=fixture({ready:true});
    await prepareIntegrationSchema(f.pool);
    expect(f.query.mock.calls.every(([sql])=>sql.startsWith("SELECT"))).toBe(true);
    expect(f.release).toHaveBeenCalledOnce();
  });
  it.each([{ready:true,imported:false,triggers:4},{ready:true,imported:true,triggers:3}])(
    "does not mistake table-only setup for completed migration (%j)",async options=>{
      const f=fixture(options);
      await prepareIntegrationSchema(f.pool);
      expect(f.query).toHaveBeenCalledWith(INTEGRATION_PROJECT_SCHEMA);
    });
  it("fails closed and rolls back the same connection without exposing database details",async()=>{
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
      const f=fixture({fail:true});
      await expect(prepareIntegrationSchema(f.pool)).rejects.toThrow("application is not ready");
      expect(f.query).toHaveBeenCalledWith("ROLLBACK");
      expect(f.query).not.toHaveBeenCalledWith(INTEGRATION_PROJECT_SCHEMA);
      expect(f.release).toHaveBeenCalledOnce();
      expect(JSON.stringify(log.mock.calls)).not.toContain("private database detail");
      expect(log).toHaveBeenCalledWith(expect.any(String),{code:"42501"});
    } finally {log.mockRestore();}
  });
  it("refuses readiness if a setup attempt did not create the required objects",async()=>{
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
      const f=fixture({remainsMissing:true});
      await expect(prepareIntegrationSchema(f.pool)).rejects.toThrow("application is not ready");
    } finally {log.mockRestore();}
  });
  it("keeps the route-ready signal behind database preparation",()=>{
    const source=fs.readFileSync("server/index.ts","utf8");
    expect(source.indexOf("await prepareIntegrationSchema(pool)")).toBeLessThan(source.indexOf("await registerRoutes(httpServer, app)"));
    expect(source.indexOf("await registerRoutes(httpServer, app)")).toBeLessThan(source.indexOf("  markRoutesReady();"));
  });
});
