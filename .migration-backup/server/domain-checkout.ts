import crypto from "node:crypto";
import type { RequestHandler } from "express";
import type { storage as applicationStorage } from "./storage";
import type { PaymentProvider } from "./payment-provider";
import { checkoutResponse } from "./payment-checkout";
import type { Pool } from "pg";

export async function lockDomainCheckout(pool: Pick<Pool, "connect">, key: string) {
  const conn = await pool.connect();
  try {
    const result = await conn.query("SELECT pg_try_advisory_lock(hashtext('domain-checkout'),hashtext($1)) AS locked", [key]);
    if (!result.rows[0]?.locked) { conn.release(); return null; }
    return async () => {
      try {
        await conn.query("SELECT pg_advisory_unlock(hashtext('domain-checkout'),hashtext($1))", [key]);
        conn.release();
      } catch (error) { conn.release(error instanceof Error ? error : true); throw error; }
    };
  } catch (error) { conn.release(); throw error; }
}

type DomainStore = Pick<typeof applicationStorage, "getDomainOrdersByUser" | "createDomainOrder" |
  "updateDomainOrder" | "createPayment" | "updatePaymentByMerchantRef">;

/** Shared by the production route and isolated request-to-provider tests. */
export function domainCheckoutHandler(deps: {
  storage: DomainStore;
  provider: Pick<PaymentProvider, "registerIpnUrl" | "submitOrder">;
  getCostPrice: (domain: string) => Promise<number | null>;
  acquireLock?: (key: string) => Promise<(() => Promise<void>) | null>;
}): RequestHandler {
  return async (req: any, res) => {
    let release: (() => Promise<void>) | null | undefined;
    try {
      const { contact } = req.body;
      const userId = req.user.claims.sub;
      const domainName = typeof req.body.domainName === "string" ? req.body.domainName.trim().toLowerCase() : "";
      if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domainName) || !contact) {
        return res.status(400).json({ message: "A valid domain name and contact info are required." });
      }
      if (deps.acquireLock) {
        release = await deps.acquireLock(`${userId}:${domainName}`);
        if (!release) return res.status(409).json({ message: "This domain checkout is already being prepared. Check My Domains before trying again." });
      }
      const existing = await deps.storage.getDomainOrdersByUser(userId);
      if (existing.some(order => order.domainName.toLowerCase() === domainName &&
          ["active", "registering", "registration_review", "pending_payment"].includes(order.status))) {
        return res.status(409).json({ message: "This domain already has an order in My Domains. Manage or complete that order instead of paying again." });
      }
      if (["firstName", "lastName", "email", "phone", "address", "city"].some(key =>
        typeof contact[key] !== "string" || !contact[key].trim())) {
        return res.status(400).json({ message: "Complete your name, email, phone, address, and city before payment." });
      }
      const country = typeof contact.country === "string" ? contact.country.trim().toUpperCase() : "";
      if (!/^[A-Z]{2}$/.test(country)) return res.status(400).json({ message: "Enter your two-letter country code." });
      const yearsNum = Math.max(1, Math.min(10, parseInt(req.body.years) || 1));
      const costPricePerYear = await deps.getCostPrice(domainName);
      if (!Number.isFinite(costPricePerYear) || !costPricePerYear || costPricePerYear <= 0) {
        return res.status(400).json({ message: "Domain not available or price could not be verified." });
      }
      // Keep existing markup and prices. Submitted display prices are never authoritative.
      const totalRetail = Number((costPricePerYear * 1.35 * yearsNum).toFixed(2));
      const totalCost = Number((costPricePerYear * yearsNum).toFixed(2));
      const order = await deps.storage.createDomainOrder({
        userId, domainName, status: "pending_payment", pricePaid: Math.round(totalRetail * 100),
        costPrice: Math.round(totalCost * 100), years: yearsNum,
        contactFirstName: contact.firstName, contactLastName: contact.lastName, contactEmail: contact.email,
        contactPhone: contact.phone, contactAddress: contact.address, contactCity: contact.city,
        contactState: contact.state, contactZip: contact.zip, contactCountry: country,
      });
      const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
      const ipnId = await deps.provider.registerIpnUrl(`${baseUrl}/api/pesapal/ipn`);
      const merchantReference = `domain-${order.id}-${crypto.randomBytes(8).toString("hex")}`;
      const payment = await deps.storage.createPayment({
        userId, plan: "domain-registration", amount: String(totalRetail), currency: "USD",
        merchantReference, status: "pending",
        purchaseDetails: { packageName: `Domain: ${domainName}`, category: "domain", billingPeriod: "one-time",
          quantity: 1, domainName, domainOrderId: order.id, registrationYears: yearsNum },
      });
      const result = await deps.provider.submitOrder({
        id: merchantReference, amount: totalRetail, currency: "USD",
        description: `Domain: ${domainName} (${yearsNum} year${yearsNum > 1 ? "s" : ""})`,
        callback_url: `${baseUrl}/api/pesapal/callback${req.body.embedded === true ? "?embedded=1" : ""}`,
        notification_id: ipnId,
        billing_address: { email_address: contact.email, phone_number: contact.phone, country_code: country,
          first_name: contact.firstName, last_name: contact.lastName },
      });
      // Validate before allowing a provider URL into the client.
      const response = checkoutResponse(payment, result);
      await deps.storage.updateDomainOrder(order.id, { pesapalOrderId: result.order_tracking_id });
      await deps.storage.updatePaymentByMerchantRef(merchantReference, { pesapalTrackingId: result.order_tracking_id });
      return res.json({ ...response, orderId: order.id, paymentUrl: response.redirectUrl });
    } catch {
      // An ambiguous submission is not a license to create another charge.
      res.status(503).json({ message: "Domain checkout could not be confirmed. Check My Domains or contact support before starting another purchase." });
    } finally {
      if (release) await release().catch(() => { console.error("[domain-checkout] Database lock cleanup failed; connection discarded."); });
    }
  };
}
