type Payment = { amount: string | number | null; currency?: string | null; status: string };
export function formatPaymentAmount(amount: Payment["amount"], currency: Payment["currency"]) {
  const value = amount === null || amount === "" ? NaN : Number(amount);
  if (!Number.isFinite(value)) return "Amount unavailable";
  const code = currency?.trim().toUpperCase();
  if (!code || !/^[A-Z]{3}$/.test(code)) return `${value.toLocaleString("en-US")} (currency unknown)`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code, currencyDisplay: "code" }).format(value);
}
export function paymentTotalsByCurrency(payments: Payment[], status: string) {
  const totals = new Map<string, number>();
  let unavailable = false;
  for (const payment of payments.filter(p => p.status === status)) {
    const amount = payment.amount === null || payment.amount === "" ? NaN : Number(payment.amount);
    const currency = payment.currency?.trim().toUpperCase();
    if (!Number.isFinite(amount) || !currency || !/^[A-Z]{3}$/.test(currency)) { unavailable = true; continue; }
    totals.set(currency, (totals.get(currency) ?? 0) + Math.round(amount * 100));
  }
  const lines = [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, cents]) => formatPaymentAmount(cents / 100, currency));
  if (unavailable) lines.push("Some amounts or currencies unavailable");
  return lines.length ? lines : ["No payments"];
}