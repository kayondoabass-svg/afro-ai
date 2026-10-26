import { afterEach, describe, expect, it, vi } from "vitest";
import { DailyQuotaError, inspectQuota } from "./quota-response";
import { apiRequest } from "./queryClient";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("daily quota responses", () => {
  it("dispatches purchase guidance from structured quota bodies even without headers", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const body = { code: "DAILY_QUOTA_REACHED", plan: "starter", kind: "chat", used: 100, limit: 100, resetsAt: "2026-10-25T00:00:00Z" };
    expect(inspectQuota(new Response(null, { status: 429 }), JSON.stringify(body))).toBe(true);
    const event = dispatch.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe("afroai:quota-blocked");
    expect(event.detail).toMatchObject(body);
  });
  it("uses authoritative quota headers without changing the limit", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const res = new Response(null, { status: 429, headers: {
      "X-AfroAI-Quota-Kind": "image", "X-AfroAI-Quota-Limit": "5",
      "X-AfroAI-Quota-Used": "5", "X-AfroAI-Quota-Plan": "starter",
    } });
    inspectQuota(res, JSON.stringify({ code: "DAILY_QUOTA_REACHED", limit: 500 }));
    expect((dispatch.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ kind: "image", limit: 5, used: 5 });
  });
  it.each([[429, "Too many requests"], [503, '{"code":"DAILY_QUOTA_REACHED"}'], [429, '{"code":"OTHER"}']])(
    "does not turn infrastructure/rate-limit errors into a purchase prompt: %s", (status, body) => {
      const dispatch = vi.spyOn(window, "dispatchEvent");
      expect(inspectQuota(new Response(null, { status: Number(status) }), String(body))).toBe(false);
      expect(dispatch).not.toHaveBeenCalled();
    });
  it("keeps daily cap errors distinct from agent or network failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      code: "DAILY_QUOTA_REACHED", kind: "chat", plan: "starter", limit: 100,
    }, { status: 429 })));
    await expect(apiRequest("POST", "/api/conversations/1/messages", { content: "Hello" })).rejects.toBeInstanceOf(DailyQuotaError);
  });
});
