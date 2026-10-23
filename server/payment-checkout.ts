import type { Express, RequestHandler, Response } from "express";
import { createHash } from "node:crypto";
import rateLimit from "express-rate-limit";
import { CREDIT_PACKS, creditCheckoutUrl } from "../shared/credit-checkout";
import { paymentProvider } from "./payment-provider";

/** Scope browser-origin protection to dashboard payment creation, not customer APIs/IPNs. */
export const paymentBrowserGuard: RequestHandler = (req, res, next) => {
  const origin = req.get("Origin");
  const expected = process.env.BASE_URL;
  let allowed = false;
  try {
    const supplied = origin ? new URL(origin).origin : "";
    allowed = Boolean(supplied && (supplied === `${req.protocol}://${req.get("host")}` ||
      supplied === (expected ? new URL(expected).origin : "") ||
      ["https://afroaigroup.com", "https://www.afroaigroup.com"].includes(supplied)));
  } catch {}
  // Legacy non-browser clients remain compatible; JSON + authentication are
  // required. Reject browser cross-site and simple form requests explicitly.
  if ((!origin && req.get("Sec-Fetch-Site") === "cross-site") ||
      (origin && !allowed) || !req.is("application/json")) {
    res.status(403).json({ message: "Start checkout from your signed-in Afro AI account." });
    return;
  }
  next();
};

export function checkoutResponse(payment: any, order: any) {
  return {
    redirectUrl: creditCheckoutUrl(order.redirect_url), paymentId: payment.id,
    amount: payment.amount, currency: payment.currency, plan: payment.plan, provider: paymentProvider.id,
  };
}

export function paymentReturnPage(res: Response) {
  // Some bank/provider paths return at the top level instead of in the frame.
  // Resume the authenticated app; it checks the saved order before showing success.
  const resume = 'if(window.top===window.self)window.location.replace("/dashboard");';
  const hash = createHash("sha256").update(resume).digest("base64");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'`);
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  return res.type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Afro AI payment verification</title><body style="background:#111;color:#fff;font:16px system-ui;padding:32px">
    <h1 style="color:#f5b400">Afro AI</h1><p>Checking your payment</p>
    <p>Your checkout will show the verified result. If confirmation is delayed, check the payment status before starting another purchase.</p>
    <p><a href="/dashboard" target="_top" style="color:#f5b400">Return to Afro AI</a></p><script>${resume}</script></body></html>`);
}

export function registerPaymentCheckoutStatus(app: Express, auth: RequestHandler, dependencies: {
  getPayment: (id: number) => Promise<any>;
  reconcile: (payment: any) => Promise<void>;
}) {
  const statusLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req: any) => String(req.user.claims.sub),
    message: { message: "Please wait a moment before checking this payment again." } });
  app.get("/api/payments/:id/status", auth, statusLimiter, async (req: any, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid payment." });
    try {
      let payment = await dependencies.getPayment(id);
      // Deliberately return the same response for foreign and missing records.
      if (!payment || payment.userId !== req.user.claims.sub) return res.status(404).json({ message: "Payment not found." });
      let verificationDelayed = false;
      if (payment.status !== "completed" && payment.pesapalTrackingId) {
        try { await dependencies.reconcile(payment); }
        catch { verificationDelayed = true; }
        payment = await dependencies.getPayment(id);
      }
      if (!payment || payment.userId !== req.user.claims.sub) return res.status(404).json({ message: "Payment not found." });
      res.json({
        id: payment.id, status: payment.status, amount: payment.amount, currency: payment.currency,
        plan: payment.plan, credits: CREDIT_PACKS.find(p => `payg-${p.key}` === payment.plan)?.credits ?? null,
        verificationDelayed,
      });
    } catch {
      res.status(503).json({ message: "Payment status is temporarily unavailable. Check this purchase again before paying again." });
    }
  });
}
