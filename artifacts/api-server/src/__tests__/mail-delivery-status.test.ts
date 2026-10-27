// @vitest-environment node
import { afterEach, it, expect, vi } from "vitest";
import { checkResendDelivery, DELIVERY_MESSAGES } from "../../shared/mail-delivery-status";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each(["queued", "scheduled", "sent", "delivered", "bounced", "complained", "delivery_delayed", "failed", "suppressed"])("exposes the real provider result %s without pretending acceptance is delivery", async status => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ last_event: status, html: "https://private.test/confirm?token=do-not-return" }));
  vi.stubGlobal("fetch", fetcher);
  const result = await checkResendDelivery("existing-message", "test-key");
  expect(result).toMatchObject({ status, error: null });
  expect(JSON.stringify(result)).not.toContain("do-not-return");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1].method || "GET").toBe("GET");
});
it.each([[401,"invalid_credential"],[403,"forbidden"],[404,"not_found"],[429,"limited"],[503,"unavailable"]] as const)("surfaces a safe lookup error for HTTP %s without exposing provider content", async (status, code) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "secret-token https://private.test/reset" }, { status })));
  const result = await checkResendDelivery("existing-message", "credential-never-return");
  expect(result).toMatchObject({ status: null, error: DELIVERY_MESSAGES[code] });
  expect(JSON.stringify(result)).not.toMatch(/secret-token|credential-never-return|private\.test/);
});
it("handles malformed responses, timeouts and missing configuration without sending email", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("private-provider-error"));
  vi.stubGlobal("fetch", fetcher);
  expect((await checkResendDelivery("existing-message", undefined)).error).toBe(DELIVERY_MESSAGES.unconfigured);
  expect(fetcher).not.toHaveBeenCalled();
  expect((await checkResendDelivery("existing-message", "test-key")).error).toBe(DELIVERY_MESSAGES.unavailable);
  fetcher.mockResolvedValue(Response.json({ last_event: "made-up-event" }));
  expect((await checkResendDelivery("existing-message", "test-key")).status).toBeNull();
});
