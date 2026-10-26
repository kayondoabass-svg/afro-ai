// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), send: vi.fn() }));
vi.mock("../db", () => ({ pool: mocks }));
vi.mock("../mailer", () => ({ sendLowBalanceEmail: mocks.send }));
import { deliverCreditAlert, observeCreditBalance, queueCreditBalanceCheck, startCreditBalanceAlerts } from "../credit-balance-alerts";
import { FOUNDER_EMAILS } from "../founder-access";
import { creditAmount, isLowCredit } from "../../shared/credit-alerts";
import { DAILY_REQUEST_LIMITS } from "../replit_integrations/quota";

// No database, provider API, real email, or production scheduler is used.
type Account = { email: string; plan: string; payg_balance: number; email_verified: Date | null };
let accounts: Record<string, Account>;
let events: { id: number; owner: string; metadata: any }[];
let locks: Map<string, Promise<void>>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue(true);
  accounts = { owner: { email: "customer@example.test", plan: "payg", payg_balance: 500, email_verified: new Date() } };
  events = []; locks = new Map();
  mocks.connect.mockImplementation(async () => {
    let unlock: (() => void) | undefined;
    return {
      release: vi.fn(),
      query: vi.fn(async (sql: string, args: any[] = []) => {
        if (sql.includes("FROM users") && sql.includes("FOR UPDATE")) {
          const previous = locks.get(args[0]) ?? Promise.resolve();
          locks.set(args[0], new Promise(resolve => { unlock = resolve; }));
          await previous;
          return { rows: accounts[args[0]] ? [{ ...accounts[args[0]] }] : [] };
        }
        if (sql.includes("SELECT currency")) return { rows: [{ currency: "UGX" }] };
        if (sql.startsWith("SELECT id, metadata")) return { rows: events.filter(e => e.owner === args[0]).slice(-1) };
        if (sql.startsWith("INSERT INTO activity_logs")) {
          const event = { id: events.length + 1, owner: args[0], metadata: JSON.parse(args[4]) };
          events.push(event); return { rows: [event] };
        }
        if (sql.includes('"emailStatus":"dispatching"')) {
          const event = events.filter(e => e.owner === args[0]).at(-1);
          if (!event?.metadata.active || event.metadata.emailStatus !== "pending") return { rows: [] };
          event.metadata.emailStatus = "dispatching"; return { rows: [event] };
        }
        if (sql.startsWith("UPDATE activity_logs")) {
          Object.assign(events.find(e => e.id === args[0])!.metadata, JSON.parse(args[1]));
        }
        if (sql === "COMMIT" || sql === "ROLLBACK") unlock?.();
        return { rows: [] };
      }),
    };
  });
  mocks.query.mockImplementation(async (_sql: string, args: any[]) => {
    const event = events.find(e => e.id === args[0] && e.owner === args[1]);
    if (event) Object.assign(event.metadata, JSON.parse(args[2]));
    return { rows: [] };
  });
});

describe("five-dollar prepaid credit reminders", () => {
  it("preserves free daily allowances", () => {
    expect(Object.fromEntries(Object.entries(DAILY_REQUEST_LIMITS).map(([kind, plans]) => [kind, plans.starter])))
      .toEqual({ chat: 100, image: 5, audio: 20, video: 0 });
  });
  it("compares USD cents, not the numerical value in a local currency", () => {
    expect(isLowCredit(500)).toBe(true); expect(isLowCredit(499)).toBe(true);
    expect(isLowCredit(501)).toBe(false); expect(isLowCredit(0)).toBe(false);
    expect(isLowCredit(-1)).toBe(false); expect(isLowCredit(5.5)).toBe(false);
    expect(creditAmount(500, "UGX").amount).toBeGreaterThan(500);
    expect(creditAmount(500, "NGN").currency).toBe("NGN");
    expect(creditAmount(500, "not-a-currency")).toMatchObject({ currency: "USD", amount: 5 });
  });
  it("creates one durable notification at exactly five dollars and sends a currency-aware email", async () => {
    const notice = await observeCreditBalance("owner");
    expect(notice).toMatchObject({ id: 1, balanceCents: 500, thresholdCents: 500, balance: { currency: "UGX" } });
    await deliverCreditAlert("owner");
    expect(mocks.send).toHaveBeenCalledWith("customer@example.test", { balanceCents: 500, currency: "UGX" });
    expect(events[0].metadata.emailStatus).toBe("sent");
  });
  it("deduplicates concurrent checks and email dispatches", async () => {
    await Promise.all(Array.from({ length: 8 }, () => observeCreditBalance("owner")));
    await Promise.all(Array.from({ length: 8 }, () => deliverCreditAlert("owner")));
    expect(events).toHaveLength(1); expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("rearms only after balance rises above five dollars", async () => {
    await observeCreditBalance("owner"); await deliverCreditAlert("owner");
    accounts.owner.payg_balance = 450;
    await observeCreditBalance("owner"); await deliverCreditAlert("owner");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    accounts.owner.payg_balance = 1000;
    expect(await observeCreditBalance("owner")).toBeNull();
    accounts.owner.payg_balance = 490;
    await observeCreditBalance("owner"); await deliverCreditAlert("owner");
    expect(events).toHaveLength(2); expect(mocks.send).toHaveBeenCalledTimes(2);
  });
  it.each(["founder", "free", "no-wallet", "above-threshold", "missing"])("does not alert an ineligible %s account", async kind => {
    if (kind === "founder") accounts.owner.email = FOUNDER_EMAILS[0];
    if (kind === "free") accounts.owner.plan = "starter";
    if (kind === "no-wallet") accounts.owner.payg_balance = 0;
    if (kind === "above-threshold") accounts.owner.payg_balance = 501;
    const owner = kind === "missing" ? "another-owner" : "owner";
    expect(await observeCreditBalance(owner)).toBeNull();
    await deliverCreditAlert(owner);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not disclose or claim another customer's notification", async () => {
    await observeCreditBalance("owner");
    expect(await observeCreditBalance("other")).toBeNull();
    await deliverCreditAlert("other");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(events[0].metadata.emailStatus).toBe("pending");
  });
  it("records delivery failure without spamming automatic retries", async () => {
    mocks.send.mockRejectedValueOnce(new Error("Provider response unknown"));
    await observeCreditBalance("owner"); await deliverCreditAlert("owner");
    await deliverCreditAlert("owner");
    expect(events[0].metadata.emailStatus).toBe("uncertain");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("never mails an unverified address or starts a scheduler in development", async () => {
    accounts.owner.email_verified = null;
    await observeCreditBalance("owner"); await deliverCreditAlert("owner");
    expect(mocks.send).not.toHaveBeenCalled();
    const timer = vi.spyOn(globalThis, "setInterval");
    startCreditBalanceAlerts();
    expect(timer).not.toHaveBeenCalled();
    timer.mockRestore();
  });
  it("queues a production charge check without blocking the AI request and coalesces concurrent charges", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CI", "");
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 8; i++) queueCreditBalanceCheck("owner");
      expect(mocks.connect).not.toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect(events).toHaveLength(1);
      expect(mocks.send).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });
});
