import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { getTransactionStatus, isPaymentComplete } from "./pesapal";
import { registerDomain } from "./namedotcom";

export class RegistrationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function completeDomainRegistration(id: number, userId: string) {
  if (!Number.isSafeInteger(id) || id < 1) throw new RegistrationError(400, "Invalid order ID");
  const order = await storage.getDomainOrder(id);
  if (!order || order.userId !== userId) throw new RegistrationError(404, "Order not found");
  if (order.status === "active") return order;
  if (order.status !== "pending_payment") throw new RegistrationError(409, "Registration needs support review; it will not be charged again automatically");
  if (!order.pesapalOrderId) throw new RegistrationError(402, "Complete payment first");
  const payment = await getTransactionStatus(order.pesapalOrderId);
  if (!isPaymentComplete(payment) || payment.currency !== "USD" ||
      Math.round(Number(payment.amount) * 100) !== order.pricePaid ||
      !payment.merchant_reference?.startsWith(`domain-${order.id}-`)) {
    throw new RegistrationError(402, "Confirmed payment matching this domain order is required");
  }
  const contact = {
    firstName: order.contactFirstName || "", lastName: order.contactLastName || "",
    email: order.contactEmail || "", phone: order.contactPhone || "",
    address1: order.contactAddress || "", city: order.contactCity || "",
    state: order.contactState || "", zip: order.contactZip || "", country: order.contactCountry || "",
  };
  if (!contact.firstName || !contact.lastName || !contact.email || !contact.phone ||
      !contact.address1 || !contact.city || !/^[A-Z]{2}$/.test(contact.country)) {
    throw new RegistrationError(400, "Contact details are incomplete. Contact support before registration; no location will be assumed.");
  }
  // Only one request can claim a paid order, including across multiple servers.
  const claim = await db.execute(sql`UPDATE domain_orders SET status = 'registering'
    WHERE id = ${id} AND user_id = ${userId} AND status = 'pending_payment' RETURNING id`);
  if (!claim.rows.length) throw new RegistrationError(409, "Registration is already in progress");
  try {
    const result = await registerDomain(order.domainName, contact, order.costPrice / 100, order.years);
    return await storage.updateDomainOrder(id, {
      status: "active", namecomOrderId: String(result.order?.orderId || result.orderId || ""),
      expiryDate: result.domain?.expireDate || result.expireDate || "",
      nameservers: result.domain?.nameservers || result.nameservers || [],
    });
  } catch (error) {
    // A timeout can occur after the registrar charges the account. Never retry blindly.
    await storage.updateDomainOrder(id, { status: "registration_review" }).catch(() => {});
    console.error("[domain-registration] Registrar outcome needs review", error instanceof Error ? error.message : "Unknown error");
    throw new RegistrationError(503, "The registrar outcome needs support review. Do not pay again.");
  }
}