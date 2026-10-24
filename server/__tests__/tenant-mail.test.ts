// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { sendTenantMail } from "../../cloudflare/src/tenant-mail";

const context = { tenantId: "tenant-test", userId: "user-test", purpose: "verify" as const, attemptId: "attempt-test" };
const message = { to: "private@example.com", subject: "Confirm", text: "private-token", html: "<p>private-token</p>" };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("records provider acceptance separately from delivery and sends a stable idempotency key", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const fetcher = vi.fn().mockResolvedValue(new Response('{"id":"provider-123"}', { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  expect(await sendTenantMail({ RESEND_API_KEY: "private-key" }, context, "token-hash", message))
    .toEqual({ sent: true, accepted: true, messageId: "provider-123" });
  expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe("tenant-auth/token-hash");
  expect(log.mock.calls[0][0]).toContain('"outcome":"accepted"');
  expect(log.mock.calls[0][0]).not.toMatch(/private@example|private-token|private-key|token-hash/);
});

it.each([
  [401, "invalid_api_key", "Invalid key", "provider_authentication"],
  [403, "validation_error", "The domain example.com is not verified", "sender_domain_unverified"],
  [429, "rate_limit_exceeded", "Too many requests", "provider_rate_limit"],
  [500, "application_error", "Unavailable", "provider_unavailable"],
])("records safe rejection details for provider status %i", async (status, name, messageText, reason) => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ name, message: messageText + " private@example.com private-token" }), { status })));
  await expect(sendTenantMail({ RESEND_API_KEY: "private-key" }, context, "hash", message)).rejects.toThrow();
  const entry = JSON.parse(log.mock.calls[0][0]);
  expect(entry).toMatchObject({ outcome: "rejected", providerStatus: status, reason });
  expect(log.mock.calls[0][0]).not.toMatch(/private@example|private-token|private-key/);
});

it("never retries ambiguous transport failures", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const fetcher = vi.fn().mockRejectedValue(new Error("private-token"));
  vi.stubGlobal("fetch", fetcher);
  await expect(sendTenantMail({ RESEND_API_KEY: "private-key" }, context, "hash", message)).rejects.toThrow("could not be confirmed");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(log.mock.calls[0][0]).toContain('"outcome":"unknown"');
  expect(log.mock.calls[0][0]).not.toContain("private-token");
});

it("reports absent transport configuration without contacting a provider", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(sendTenantMail({}, context, "hash", message)).rejects.toThrow("transport unavailable");
  expect(fetcher).not.toHaveBeenCalled();
  expect(log.mock.calls[0][0]).toContain("missing_provider_credential");
});
