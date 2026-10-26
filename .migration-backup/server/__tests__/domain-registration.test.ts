// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.hoisted(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { clear() {} } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { clear() {} } });
});
const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), execute: vi.fn(), status: vi.fn(), register: vi.fn() }));
vi.mock("../db", () => ({ db: { execute: mocks.execute } }));
vi.mock("../storage", () => ({ storage: { getDomainOrder: mocks.get, updateDomainOrder: mocks.update } }));
vi.mock("../pesapal", () => ({ getTransactionStatus: mocks.status, isPaymentComplete: (value: any) => value.status_code === 1 }));
vi.mock("../namedotcom", () => ({ registerDomain: mocks.register }));
import { completeDomainRegistration } from "../domain-registration";
const order = { id: 1, userId: "owner", domainName: "example.com", status: "pending_payment", pesapalOrderId: "payment", pricePaid: 1754, costPrice: 1300, years: 1,
  contactFirstName: "Test", contactLastName: "User", contactEmail: "test@example.com", contactPhone: "+12025550100", contactAddress: "Test address", contactCity: "Test city", contactCountry: "US" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.get.mockResolvedValue(order);
  mocks.status.mockResolvedValue({ status_code: 1, currency: "USD", amount: 17.54, merchant_reference: "domain-1-reference" });
  mocks.execute.mockResolvedValue({ rows: [{ id: 1 }] }); mocks.register.mockResolvedValue({ domain: { expireDate: "2027-10-01" } });
  mocks.update.mockImplementation(async (_id, changes) => ({ ...order, ...changes }));
});
it("rejects unowned and unpaid orders before registration", async () => {
  await expect(completeDomainRegistration(1, "other")).rejects.toMatchObject({ status: 404 });
  mocks.status.mockResolvedValueOnce({ status_code: 0 });
  await expect(completeDomainRegistration(1, "owner")).rejects.toMatchObject({ status: 402 });
  expect(mocks.register).not.toHaveBeenCalled();
});
it("requires payment amount, currency and merchant reference to match", async () => {
  for (const mismatch of [{ amount: 1 }, { currency: "UGX" }, { merchant_reference: "domain-2-other" }]) {
    mocks.status.mockResolvedValueOnce({ status_code: 1, currency: "USD", amount: 17.54, merchant_reference: "domain-1-ref", ...mismatch });
    await expect(completeDomainRegistration(1, "owner")).rejects.toMatchObject({ status: 402 });
  }
  expect(mocks.register).not.toHaveBeenCalled();
});
it("atomically claims a paid order before registering", async () => {
  expect((await completeDomainRegistration(1, "owner"))?.status).toBe("active");
  mocks.execute.mockResolvedValueOnce({ rows: [] });
  await expect(completeDomainRegistration(1, "owner")).rejects.toMatchObject({ status: 409 });
  expect(mocks.register).toHaveBeenCalledTimes(1);
});
it("does not retry ambiguous charges and does not invent missing contact details", async () => {
  mocks.register.mockRejectedValueOnce(new Error("timeout"));
  await expect(completeDomainRegistration(1, "owner")).rejects.toMatchObject({ status: 503 });
  expect(mocks.update).toHaveBeenCalledWith(1, { status: "registration_review" });
  mocks.get.mockResolvedValueOnce({ ...order, contactCountry: "" });
  await expect(completeDomainRegistration(1, "owner")).rejects.toMatchObject({ status: 400 });
  expect(mocks.register).toHaveBeenCalledTimes(1);
});