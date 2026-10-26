// @vitest-environment node
import { expect, it, vi } from "vitest";
const sendEmail = vi.hoisted(() => vi.fn(async (_options: any) => ({})));
vi.mock("../ses-webhook", () => ({ isSuppressed: async () => false }));
vi.mock("../email-provider", () => ({ sendEmail }));
import { sendReceiptEmail } from "../mailer";

it("includes owned purchase references and never claims pending domain registration is active", async () => {
  await sendReceiptEmail("buyer@example.invalid", {
    customerName: "<script>not markup</script>", plan: "domain-registration", amount: "27", currency: "USD",
    method: "Mobile Money", confirmationCode: "confirmed", merchantRef: "ref", date: "2026-10-24",
    userId: "buyer-a", paymentId: 14, fulfilmentStatus: "registration_review",
    purchaseDetails: { packageName: "Domain: example.com", category: "domain", quantity: 1, billingPeriod: "one-time", registrationYears: 2 },
  });
  const mail = sendEmail.mock.calls[0][0] as any;
  expect(mail.subject).toContain("Domain: example.com");
  expect(mail.html).toContain("User ID"); expect(mail.html).toContain("buyer-a");
  expect(mail.html).toContain("Payment ID"); expect(mail.html).toContain("14");
  expect(mail.html).toContain("Registration is registration_review");
  expect(mail.html).not.toContain("Your subscription / credits are now active");
  expect(mail.html).not.toContain("<script>");
  expect(mail.text).toContain("Do not pay again");
});
