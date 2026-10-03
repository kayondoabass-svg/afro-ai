import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); });
const privateMarker = "private-provider-response-for-test";
async function setup() {
  vi.resetModules();
  vi.stubEnv("PESAPAL_CONSUMER_KEY", "test-key");
  vi.stubEnv("PESAPAL_CONSUMER_SECRET", "test-secret");
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
    token: "test-access-token", expiryDate: "2099-01-01T00:00:00Z",
  }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  return { fetchMock, log, api: await import("../pesapal") };
}
it("never logs successful payment response bodies", async () => {
  const { fetchMock, log, api } = await setup();
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ redirect_url: `https://example.com/${privateMarker}` })));
  await api.submitOrder({ id: "test", currency: "USD", amount: 1, description: "test", callback_url: "https://example.com", notification_id: "test" });
  expect(JSON.stringify(log.mock.calls)).not.toContain(privateMarker);
  expect(JSON.stringify(log.mock.calls)).not.toContain("test-access-token");
});
it.each(["invalid-json", "http-error", "provider-error", "missing-redirect"])("redacts %s from errors and logs", async kind => {
  const { fetchMock, log, api } = await setup();
  const body = kind === "invalid-json" ? privateMarker : JSON.stringify({ error: kind === "provider-error" ? privateMarker : null, details: privateMarker });
  fetchMock.mockResolvedValueOnce(new Response(body, { status: kind === "http-error" ? 400 : 200 }));
  let error: unknown;
  try { await api.submitOrder({ id: "test", currency: "USD", amount: 1, description: "test", callback_url: "https://example.com", notification_id: "test" }); }
  catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).not.toContain(privateMarker);
  expect(JSON.stringify(log.mock.calls)).not.toContain(privateMarker);
});
it("redacts IPN and transaction status errors", async () => {
  const { fetchMock, log, api } = await setup();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: privateMarker })));
  await expect(api.registerIpnUrl("https://example.com")).rejects.toThrow("registration was rejected");
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: privateMarker })));
  await expect(api.getTransactionStatus("test")).rejects.toThrow("could not retrieve");
  expect(JSON.stringify(log.mock.calls)).not.toContain(privateMarker);
});