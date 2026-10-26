import { expect, it } from "vitest";
import { formatPaymentAmount, paymentTotalsByCurrency } from "./payment-currency";
it("shows the actual payment currency rather than a dollar label", () => {
  expect(formatPaymentAmount("300200", "UGX")).toContain("UGX");
  expect(formatPaymentAmount("435", "GHS")).toContain("GHS");
  expect(formatPaymentAmount("29", "USD")).toContain("USD");
  expect(formatPaymentAmount("300200", "UGX")).not.toContain("$");
});
it("never adds different currencies together", () => {
  const totals = paymentTotalsByCurrency([
    { amount: "300200", currency: "UGX", status: "pending" },
    { amount: "29", currency: "USD", status: "pending" },
    { amount: "1", currency: "USD", status: "pending" },
    { amount: "99", currency: "USD", status: "completed" },
  ], "pending");
  expect(totals).toEqual([formatPaymentAmount(300200, "UGX"), formatPaymentAmount(30, "USD")]);
});
it("does not assume unknown currencies are dollars or invalid amounts are zero", () => {
  expect(formatPaymentAmount(12, null)).toContain("currency unknown");
  expect(formatPaymentAmount("invalid", "USD")).toBe("Amount unavailable");
  expect(paymentTotalsByCurrency([{ amount: "x", currency: "USD", status: "pending" }], "pending")).toEqual(["Some amounts or currencies unavailable"]);
});