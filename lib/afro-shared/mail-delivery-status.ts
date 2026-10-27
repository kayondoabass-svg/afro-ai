/** Provider retrieval deliberately never returns message bodies, addresses or raw errors. */
export const DELIVERY_MESSAGES = {
  unavailable: "Delivery status could not be checked. No email was resent.",
  unconfigured: "Delivery lookup is not configured. Contact Afro Auth support.",
  invalid_credential: "The email provider rejected the delivery lookup credential. Contact Afro Auth support; do not replace your project key.",
  forbidden: "The provider does not permit delivery lookup with this credential. Contact Afro Auth support.",
  not_found: "The provider could not find this message with the configured account. Delivery remains unconfirmed.",
  limited: "The provider rate-limited delivery lookup. Try refreshing later; no email was resent.",
  unsupported: "This provider has no delivery lookup configured. Acceptance does not confirm delivery.",
  unknown: "The provider has not reported a supported delivery result. Delivery remains unconfirmed.",
  missing_id: "No provider message ID was recorded for this request. Delivery cannot be confirmed; no email was resent.",
} as const;
export type DeliveryCheck = { status: string | null; error: string | null; checkedAt: string | null };
export async function checkResendDelivery(messageId: string, key: string | undefined): Promise<DeliveryCheck> {
  const checkedAt = new Date().toISOString(); // Lookup time, never used as the event's send time.
  const fail = (error: string): DeliveryCheck => ({ status: null, error, checkedAt });
  if (!key) return fail(DELIVERY_MESSAGES.unconfigured);
  if (!/^[a-zA-Z0-9_.:-]{1,200}$/.test(messageId)) return fail(DELIVERY_MESSAGES.not_found);
  try {
    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(messageId)}`, {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return fail(response.status === 401 ? DELIVERY_MESSAGES.invalid_credential
      : response.status === 403 ? DELIVERY_MESSAGES.forbidden : response.status === 404 ? DELIVERY_MESSAGES.not_found
      : response.status === 429 ? DELIVERY_MESSAGES.limited : DELIVERY_MESSAGES.unavailable);
    const body = await response.json() as { last_event?: unknown };
    const status = typeof body.last_event === "string" ? body.last_event.replace(/^email\./, "") : "";
    return ["queued", "scheduled", "sent", "delivered", "bounced", "complained", "delivery_delayed", "failed", "suppressed", "canceled"].includes(status)
      ? { status, error: null, checkedAt } : fail(DELIVERY_MESSAGES.unknown);
  } catch { return fail(DELIVERY_MESSAGES.unavailable); }
}
