// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { checkoutResponse, paymentBrowserGuard, paymentReturnPage, registerPaymentCheckoutStatus } from "../payment-checkout";
import { verifySettlement } from "../payment-settlement";
import { hasPesapalError } from "../pesapal";

const servers: Server[] = [];
async function start(app: express.Express) {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as any).port}`;
}
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
const payment = { id: 14, userId: "owner", merchantReference: "ref", pesapalTrackingId: "track",
  plan: "payg-pack5", amount: "19000", currency: "UGX", status: "pending" };

describe("owned embedded checkout status", () => {
  function appFor(getPayment: any, reconcile = vi.fn()) {
    const app = express();
    registerPaymentCheckoutStatus(app, (req: any, res, next) => {
      if (!req.get("x-test-user")) return res.status(401).json({ message: "Sign in" });
      req.user = { claims: { sub: req.get("x-test-user") } };
      next();
    }, { getPayment, reconcile });
    return app;
  }
  it("rejects anonymous access and foreign records before any provider call", async () => {
    const reconcile = vi.fn();
    const base = await start(appFor(vi.fn().mockResolvedValue(payment), reconcile));
    expect((await fetch(`${base}/api/payments/14/status`)).status).toBe(401);
    const response = await fetch(`${base}/api/payments/14/status`, { headers: { "x-test-user": "stranger" } });
    expect(response.status).toBe(404);
    expect(reconcile).not.toHaveBeenCalled();
  });
  it("refreshes pending orders server-side and returns only the verified result", async () => {
    let saved = { ...payment };
    const reconcile = vi.fn(async () => { saved = { ...saved, status: "completed" }; });
    const base = await start(appFor(async () => saved, reconcile));
    const response = await fetch(`${base}/api/payments/14/status`, { headers: { "x-test-user": "owner" } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ id: 14, status: "completed", amount: "19000",
      currency: "UGX", plan: "payg-pack5", credits: 500, verificationDelayed: false });
    expect(reconcile).toHaveBeenCalledOnce();
  });
  it("never invents success when the provider is unavailable", async () => {
    const base = await start(appFor(async () => payment, vi.fn().mockRejectedValue(new Error("Unavailable"))));
    const response = await fetch(`${base}/api/payments/14/status`, { headers: { "x-test-user": "owner" } });
    expect(await response.json()).toMatchObject({ status: "pending", verificationDelayed: true });
  });
  it("does not contact the provider again for an already settled purchase", async () => {
    const reconcile = vi.fn();
    const base = await start(appFor(async () => ({ ...payment, status: "completed" }), reconcile));
    await fetch(`${base}/api/payments/14/status`, { headers: { "x-test-user": "owner" } });
    expect(reconcile).not.toHaveBeenCalled();
  });
});

describe("payment creation and provider verification boundaries", () => {
  it("accepts the documented API 3 null-filled error object without hiding real errors", () => {
    expect(hasPesapalError({ error_type: null, code: null, message: null, call_back_url: null })).toBe(false);
    expect(hasPesapalError({ error_type: "validation_error", code: "bad_order", message: null })).toBe(true);
    expect(hasPesapalError("Rejected")).toBe(true);
  });
  it("blocks foreign browser origins and simple HTML forms without blocking authenticated JSON clients", async () => {
    const app = express();
    app.use(express.json());
    app.post("/pay", paymentBrowserGuard, (_req, res) => res.json({ ok: true }));
    const base = await start(app);
    const foreign = await fetch(`${base}/pay`, { method: "POST", headers: { Origin: "https://evil.test", "Content-Type": "application/json" }, body: "{}" });
    expect(foreign.status).toBe(403);
    expect((await fetch(`${base}/pay`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "amount=1" })).status).toBe(403);
    expect((await fetch(`${base}/pay`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: "{}" })).status).toBe(200);
  });
  it("allows only configured secure Pesapal checkout URLs", () => {
    expect(checkoutResponse(payment, { redirect_url: "https://pay.pesapal.com/checkout" })).toMatchObject({ paymentId: 14, amount: "19000", currency: "UGX", provider: "pesapal" });
    expect(() => checkoutResponse(payment, { redirect_url: "https://evil.test/checkout" })).toThrow();
  });
  it("requires paid status and an exact saved reference, tracking ID, currency and amount", () => {
    const paid = { status_code: 1, merchant_reference: "ref", amount: 19000, currency: "UGX" };
    expect(() => verifySettlement(payment, "track", paid)).not.toThrow();
    for (const patch of [{ status_code: 0 }, { merchant_reference: "other" }, { amount: 5 }, { currency: "USD" }, { error: {} }]) {
      expect(() => verifySettlement(payment, "track", { ...paid, ...patch })).toThrow();
    }
    expect(() => verifySettlement(payment, "someone-elses-payment", paid)).toThrow();
  });
  it("renders an isolated iframe return page with only a hash-authorized top-level resume script", async () => {
    const app = express();
    app.get("/return", (_req, res) => paymentReturnPage(res));
    const response = await fetch(`${await start(app)}/return`);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("content-security-policy")).toContain("script-src 'sha256-");
    const html = await response.text();
    expect(html).toContain("Checking your payment");
    expect(html).toContain('if(window.top===window.self)window.location.replace("/dashboard")');
    expect(html).not.toContain('src="/src');
  });
});
