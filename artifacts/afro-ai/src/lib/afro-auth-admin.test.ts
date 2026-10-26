import { afterEach, expect, it, vi } from "vitest";
import { authAdminRequest } from "./afro-auth-admin";
afterEach(() => vi.unstubAllGlobals());
it("shows the readable API explanation rather than raw JSON", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false, json: async () => ({ code: "SIGN_IN_REQUIRED", message: "Please sign in again." }),
  }));
  await expect(authAdminRequest("/cf-auth/v1/admin/tenants", "My app")).rejects.toThrow("Please sign in again.");
  expect(fetch).toHaveBeenCalledWith("/cf-auth/v1/admin/tenants", expect.objectContaining({
    credentials: "include", cache: "no-store", method: "POST", body: '{"name":"My app"}',
  }));
});
it("handles non-JSON service errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error("HTML"); } }));
  await expect(authAdminRequest("/cf-auth/v1/admin/tenants")).rejects.toThrow("temporarily unavailable");
});