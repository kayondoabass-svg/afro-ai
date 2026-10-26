import { afterEach, describe, expect, it, vi } from "vitest";
import { accountCacheGeneration, apiRequest, getQueryFn, queryClient, replaceAccountCache } from "./queryClient";

afterEach(() => { vi.unstubAllGlobals(); replaceAccountCache(null, false); queryClient.clear(); });
describe("private caches follow the signed-in identity", () => {
  it("discards balances, receipts and pending mutations when accounts change", () => {
    replaceAccountCache({ id: "customer-a" }, false);
    queryClient.setQueryData(["/api/payments"], [{ id: 1, userId: "customer-a" }]);
    queryClient.setQueryData(["/api/payments", 1, "receipt"], { customerEmail: "a@example.invalid" });
    queryClient.setQueryData(["/api/payg/status"], { balance: 100 });
    const previous = accountCacheGeneration();
    replaceAccountCache({ id: "customer-b" }, false);
    expect(accountCacheGeneration()).toBeGreaterThan(previous);
    expect(queryClient.getQueryData(["/api/payments"])).toBeUndefined();
    expect(queryClient.getQueryData(["/api/payments", 1, "receipt"])).toBeUndefined();
    expect(queryClient.getQueryData(["/api/payg/status"])).toBeUndefined();
    expect(queryClient.getQueryData(["/api/auth/user"])).toEqual({ id: "customer-b" });
    replaceAccountCache({ id: "customer-a" }, false);
    expect(queryClient.getQueryData(["/api/payments"])).toBeUndefined();
  });
  it("rejects an API response from a previous account", async () => {
    replaceAccountCache({ id: "customer-a" }, false);
    let respond!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    const request = apiRequest("POST", "/api/payg/topup", { pack: "pack5" });
    replaceAccountCache({ id: "customer-b" }, false);
    respond(new Response('{"paymentId":1}', { headers: { "Content-Type": "application/json" } }));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
  it("also rejects a response body consumed after identity changes", async () => {
    replaceAccountCache({ id: "customer-a" }, false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"userId":"customer-a"}', { headers: { "Content-Type": "application/json" } })));
    const response = await apiRequest("POST", "/api/subscribe", { plan: "pro" });
    replaceAccountCache({ id: "customer-b" }, false);
    await expect(response.json()).rejects.toMatchObject({ name: "AbortError" });
  });
  it("blocks stale query results even when a request ignores cancellation", async () => {
    replaceAccountCache({ id: "customer-a" }, false);
    let respond!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    const request = getQueryFn({ on401: "throw" })({ queryKey: ["/api/payments"] } as any);
    replaceAccountCache({ id: "customer-b" }, false);
    respond(new Response('[{"userId":"customer-a"}]'));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
  it("clears local private state on a session-change event from another tab", () => {
    replaceAccountCache({ id: "customer-a" }, false);
    queryClient.setQueryData(["/api/payments"], [{ id: 1 }]);
    window.dispatchEvent(new StorageEvent("storage", { key: "afro-account-changed", newValue: "changed" }));
    expect(queryClient.getQueryData(["/api/payments"])).toBeUndefined();
    expect(queryClient.getQueryData(["/api/auth/user"])).toBeNull();
  });
  it("prevents late mutation callbacks from writing one account's result into another account", async () => {
    replaceAccountCache({ id: "customer-a" }, false);
    let finish!: (value: object) => void;
    const onSuccess = vi.fn(data => queryClient.setQueryData(["/api/payments"], data));
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: () => new Promise<object>(resolve => { finish = resolve; }), onSuccess,
    });
    const result = mutation.execute(undefined);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    replaceAccountCache({ id: "customer-b" }, false);
    finish({ owner: "customer-a" });
    await result;
    expect(onSuccess).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(["/api/payments"])).toBeUndefined();
  });
});
