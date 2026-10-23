export const FREE_DAILY_CAP_MESSAGE = "You've used up your free daily cap. Purchase credits to continue using Afro AI.";

export const CREDIT_PACKS = [
  { key: "pack5", usd: 5, credits: 500 },
  { key: "pack10", usd: 10, credits: 1000 },
  { key: "pack20", usd: 20, credits: 2000 },
  { key: "pack50", usd: 50, credits: 5000 },
] as const;

// Current Pesapal integration has no verified balance-triggered charging API.
// Never turn an auto-top-up request into scheduled billing or a one-time order.
export function creditCheckoutModeError(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { status: 400, code: "INVALID_CHECKOUT_MODE", message: "Choose a supported credit purchase option." };
  }
  const body = input as Record<string, unknown>;
  if (body.mode === "auto-topup" || body.autoTopUp === true || body.autoRenew === true || body.recurring === true) {
    return { status: 409, code: "AUTO_TOPUP_UNAVAILABLE", message: "Automatic top-ups are not enabled. Choose a one-time credit purchase instead." };
  }
  if ((body.mode !== undefined && body.mode !== "one-time") ||
      [body.autoTopUp, body.autoRenew, body.recurring].some(value => value !== undefined && typeof value !== "boolean")) {
    return { status: 400, code: "INVALID_CHECKOUT_MODE", message: "Choose a supported credit purchase option." };
  }
  return null;
}

export function creditCheckoutUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("Secure checkout is unavailable. Please try again.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password ||
      !["pay.pesapal.com", "cybqa.pesapal.com"].includes(url.hostname)) {
    throw new Error("Secure checkout is unavailable. Please try again.");
  }
  return url.href;
}
