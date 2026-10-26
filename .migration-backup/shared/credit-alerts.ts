import { africanCountries } from "./currencies";

// Wallets are denominated in USD cents. Local currency is presentation only.
export const LOW_CREDIT_THRESHOLD_CENTS = 500;

export function isLowCredit(balanceCents: number) {
  return Number.isSafeInteger(balanceCents) && balanceCents > 0 && balanceCents <= LOW_CREDIT_THRESHOLD_CENTS;
}

export function creditAmount(balanceCents: number, preferredCurrency = "USD") {
  const code = preferredCurrency.toUpperCase();
  const country = africanCountries.find(item => item.currencyCode === code);
  const currency = country ? code : "USD";
  const amount = balanceCents / 100 * (country?.usdExchangeRate ?? 1);
  return {
    currency, amount, approximate: currency !== "USD",
    label: new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" }).format(amount),
  };
}
