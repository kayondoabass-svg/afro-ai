// @vitest-environment node
import {describe,it,expect,vi} from "vitest";
import {isMediaExpired,purgeExpiredMedia} from "../media-retention.js";
import {readMedia} from "../media-assets";

describe("72-hour generated-media retention",()=>{
  it("expires at the deadline, not before it",()=>{
    const end=Date.parse("2026-10-21T12:00:00Z");
    expect(isMediaExpired({expires_at:new Date(end)},end-1)).toBe(false);
    expect(isMediaExpired({expires_at:new Date(end)},end)).toBe(true);
    expect(isMediaExpired({expired_at:new Date()},end-1)).toBe(true);
  });
  it("refuses expired database assets even before a cleanup sweep",async()=>{
    await expect(readMedia({kind:"image",mime_type:"image/png",asset_bytes:Buffer.from("private"),
      expires_at:new Date(Date.now()-1)})).rejects.toMatchObject({code:"MEDIA_EXPIRED"});
  });
  it("deletes expired private objects and content, but never billing or job identities",async()=>{
    const query=vi.fn(async(sql:string)=>({rows:sql.startsWith("SELECT id,asset_key")?[{id:"expired",asset_key:"bucket/private-media/job"}]:[]}));
    const release=vi.fn(),remove=vi.fn().mockResolvedValue(undefined);
    const db={connect:vi.fn().mockResolvedValue({query,release})};
    expect(await purgeExpiredMedia(db as any,{remove})).toEqual({purged:1,retry:0});
    expect(remove).toHaveBeenCalledWith("bucket/private-media/job");
    const all=query.mock.calls.map(c=>c[0]).join("\n");
    expect(all).toContain("expires_at <= now()");
    expect(all).toContain("FOR UPDATE SKIP LOCKED");
    expect(all).toContain("asset_bytes=NULL,prompt=''");
    expect(all).not.toMatch(/DELETE FROM|usage_logs|UPDATE users|SET status=/i);
    expect(release).toHaveBeenCalledOnce();
  });
  it("retains failed deletion pointers for retry, while removing database payloads",async()=>{
    const query=vi.fn(async(sql:string)=>({rows:sql.startsWith("SELECT id,asset_key")?[{id:"expired",asset_key:"bucket/private-media/job"}]:[]}));
    const db={connect:vi.fn().mockResolvedValue({query,release:vi.fn()})};
    expect(await purgeExpiredMedia(db as any,{remove:vi.fn().mockRejectedValue(new Error("offline"))})).toEqual({purged:0,retry:1});
    expect(query.mock.calls.map(c=>c[0]).join("\n")).not.toContain("asset_key=NULL");
    expect(query).toHaveBeenLastCalledWith("COMMIT");
  });
});
