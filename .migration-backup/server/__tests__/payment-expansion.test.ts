// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { domainCheckoutHandler } from "../domain-checkout";
import { paymentBrowserGuard, registerPaymentCheckoutStatus } from "../payment-checkout";
import { privateResponseCache } from "../private-response-cache";
import { presentPayment } from "../payment-presentation";
import { purchaseDetails } from "../../shared/purchase-details";

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
async function application() {
  const payments: any[] = [], orders: any[] = [];
  const store = {
    getDomainOrdersByUser: vi.fn(async id => orders.filter(order => order.userId === id)),
    createDomainOrder: vi.fn(async input => { const order = { ...input, id: orders.length + 1 }; orders.push(order); return order; }),
    updateDomainOrder: vi.fn(async (id, patch) => Object.assign(orders.find(order => order.id === id), patch)),
    createPayment: vi.fn(async input => { const payment = { ...input, id: payments.length + 1 }; payments.push(payment); return payment; }),
    updatePaymentByMerchantRef: vi.fn(async (ref, patch) => Object.assign(payments.find(payment => payment.merchantReference === ref), patch)),
  };
  const provider = {
    registerIpnUrl: vi.fn(async () => "ipn"),
    submitOrder: vi.fn(async (input: any) => {
      expect(payments.some(payment => payment.merchantReference === input.id && payment.status === "pending")).toBe(true);
      return { order_tracking_id: "track", merchant_reference: input.id, redirect_url: "https://pay.pesapal.com/checkout" };
    }),
  };
  const auth: any = (req: any, res: any, next: any) => {
    if (!req.get("x-fixture-user")) return res.status(401).json({ message: "Sign in" });
    req.user = { claims: { sub: req.get("x-fixture-user") } }; next();
  };
  let paid = false;
  const app = express(); app.use(privateResponseCache, express.json());
  app.post("/api/domains/order", auth, paymentBrowserGuard, domainCheckoutHandler({
    storage: store as any, provider: provider as any, getCostPrice: async () => 10,
  }));
  registerPaymentCheckoutStatus(app, auth, {
    getPayment: async id => payments.find(payment => payment.id === id),
    reconcile: async payment => { if (paid) { payment.status = "completed"; orders[0].status = "registration_review"; } },
    fulfilmentStatus: async payment => orders.find(order => order.id === payment.purchaseDetails.domainOrderId)?.status,
  });
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  return { base, payments, orders, provider, store, paid: () => { paid = true; } };
}
const contact = { firstName: "Test", lastName: "Buyer", email: "buyer@example.invalid", phone: "+256700000000", address: "Test address", city: "Test city", country: "UG" };
const headers = (user = "buyer-a") => ({ "x-fixture-user": user, "Content-Type": "application/json" });
describe("domain purchase request through owned payment status (simulated provider, no money)", () => {
  it("creates a priced snapshot, preserves IDs, rejects foreign access and separates paid from registration", async () => {
    const flow = await application();
    const response = await fetch(`${flow.base}/api/domains/order`, { method: "POST", headers: headers(),
      body: JSON.stringify({ domainName: "EXAMPLE.COM", years: 2, contact, embedded: true, userId: "buyer-b", amount: 0.01 }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("cache-control")).toContain("private");
    const created = await response.json();
    expect(created).toMatchObject({ paymentId: 1, orderId: 1, userId: "buyer-a", amount: "27", currency: "USD",
      purchaseDetails: { category: "domain", domainName: "example.com", registrationYears: 2 } });
    expect(flow.provider.submitOrder.mock.calls[0][0].callback_url).toContain("/api/pesapal/callback?embedded=1");
    const foreign = await fetch(`${flow.base}/api/payments/1/status`, { headers: headers("buyer-b") });
    expect(foreign.status).toBe(404); expect(await foreign.text()).not.toContain("example.com");
    const anonymous = await fetch(`${flow.base}/api/payments/1/status`);
    expect(anonymous.status).toBe(401); expect(anonymous.headers.get("cache-control")).toContain("no-store");
    flow.paid();
    const status = await fetch(`${flow.base}/api/payments/1/status`, { headers: headers() });
    expect(await status.json()).toMatchObject({ id: 1, userId: "buyer-a", status: "completed", fulfilmentStatus: "registration_review" });
    const repeat = await fetch(`${flow.base}/api/domains/order`, { method: "POST", headers: headers(), body: JSON.stringify({ domainName: "example.com", contact }) });
    expect(repeat.status).toBe(409); expect(flow.provider.submitOrder).toHaveBeenCalledTimes(1);
  });
  it("blocks foreign origins before making an order or contacting a provider", async () => {
    const flow = await application();
    const response = await fetch(`${flow.base}/api/domains/order`, { method: "POST", headers: { ...headers(), Origin: "https://foreign.invalid" }, body: JSON.stringify({ domainName: "example.com", contact }) });
    expect(response.status).toBe(403); expect(flow.provider.submitOrder).not.toHaveBeenCalled();
  });
  it("does not expose an arbitrary provider URL or mark an uncertain submission paid", async () => {
    const flow = await application();
    flow.provider.submitOrder.mockResolvedValueOnce({ order_tracking_id: "track", merchant_reference: "ref", redirect_url: "https://foreign.invalid/pay" });
    const response = await fetch(`${flow.base}/api/domains/order`, { method: "POST", headers: headers(), body: JSON.stringify({ domainName: "example.com", contact }) });
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("foreign.invalid");
    expect(flow.payments[0].status).toBe("pending");
  });
});
it("preserves saved package snapshots and hides foreign domain fulfilment", async () => {
  const snapshot = { packageName: "Original package", category: "domain", domainOrderId: 1 };
  const view = await presentPayment({ userId: "buyer-a", plan: "domain-registration", purchaseDetails: snapshot, status: "completed" },
    async () => ({ userId: "buyer-b", status: "active" }));
  expect(view.purchaseDetails).toEqual(snapshot); expect(view.fulfilmentStatus).toBe("review"); expect(view.completedAt).toBeNull();
  expect(purchaseDetails("business")?.billingPeriod).toBe("monthly");
  expect(purchaseDetails("payg-pack5")?.credits).toBe(500);
  expect(purchaseDetails("unknown")).toBeNull();
});
