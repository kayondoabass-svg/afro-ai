// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), nested: vi.fn(), execute: vi.fn(), returning: vi.fn() }));
vi.mock("../db", () => ({ db: { transaction: mocks.transaction }, pool: {} }));
import { storage } from "../storage";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.returning.mockResolvedValue([{ balance: 1000 }]);
  mocks.execute.mockResolvedValue({});
  mocks.nested.mockImplementation(async fn => fn({ execute: mocks.execute }));
  mocks.transaction.mockImplementation(async fn => fn({
    update: () => ({ set: () => ({ where: () => ({ returning: mocks.returning }) }) }),
    transaction: mocks.nested,
  }));
});
describe("top-ups and reminder rearming", () => {
  it("atomically rearms reminders above five dollars", async () => {
    await storage.addPaygBalance("owner", 500);
    expect(mocks.nested).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it("does not rearm while still in the same low-balance period", async () => {
    mocks.returning.mockResolvedValue([{ balance: 500 }]);
    await storage.addPaygBalance("owner", 100);
    expect(mocks.nested).not.toHaveBeenCalled();
  });
  it("does not roll back purchased credits when the reminder reset fails", async () => {
    mocks.execute.mockRejectedValue(new Error("Notification storage unavailable"));
    await expect(storage.addPaygBalance("owner", 500)).resolves.toBeUndefined();
    expect(mocks.nested).toHaveBeenCalled();
  });
  it("uses the same rearming flow for founder-granted credits", async () => {
    await storage.adminAddPaygCredits("owner", 500);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.nested).toHaveBeenCalledTimes(1);
  });
});
