// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn() }));
vi.mock("../db", () => ({ pool: mocks }));
import { reserveJob, dispatchJobCall, recordJobUsage, recordJobRejection, finishJob, tokenBudget, deleteConversationWithBudgetGuard } from "./job-budget";
import { FOUNDER_EMAILS } from "../founder-access";

let balance = 2, spent = 0, accountEmail = "customer@example.org";
let records: { id: number; content: string }[] = [];
let lock: Promise<void> = Promise.resolve();
beforeEach(() => {
  vi.clearAllMocks(); balance = 2; spent = 0; accountEmail = "customer@example.org"; records = []; lock = Promise.resolve();
  mocks.connect.mockImplementation(async () => {
    let unlock: (() => void) | undefined;
    let before: { balance: number; spent: number; records: typeof records } | undefined;
    return {
      release: vi.fn(),
      query: vi.fn(async (sql: string, args: any[] = []) => {
        if (sql.includes("FROM users") && sql.includes("FOR UPDATE")) {
          const prior = lock; lock = new Promise(resolve => { unlock = resolve; }); await prior;
          before = { balance, spent, records: records.map(r => ({ ...r })) };
          return { rows: args[0] === "owner" ? [{ id: "owner", email: accountEmail, payg_balance: balance, payg_limit: 10, payg_spent: spent }] : [] };
        }
        if (sql.includes("SELECT id FROM conversations")) return { rows: args[0] === "11" && args[1] === "owner" ? [{ id: 11 }] : [] };
        if (sql.includes("JOIN conversations")) return { rows: args[0] === "owner" && args[1] === "11" ? records.filter(r => JSON.parse(r.content).id === args[2]) : [] };
        if (sql.includes("SELECT 1 FROM messages")) return { rows: records.filter(r => ["reserved", "dispatched", "uncertain"].includes(JSON.parse(r.content).status)) };
        if (sql.startsWith("DELETE FROM messages")) records = [];
        if (sql.startsWith("UPDATE users")) {
          if (sql.includes("payg_balance -")) { balance -= args[1]; spent += args[1]; }
          else { balance += args[1]; spent -= args[1]; }
        }
        if (sql.startsWith("INSERT INTO messages")) records.push({ id: records.length + 1, content: args[1] });
        if (sql.startsWith("UPDATE messages")) records.find(r => r.id === args[0])!.content = args[1];
        if (sql === "ROLLBACK" && before) { balance = before.balance; spent = before.spent; records = before.records; }
        if (sql === "COMMIT" || sql === "ROLLBACK") unlock?.();
        return { rows: [] };
      }),
    };
  });
});
describe("durable generation reservations", () => {
  it("exempts a matching founder session and account without losing metering or charging PAYG", async () => {
    accountEmail = FOUNDER_EMAILS[0];
    balance = 0;
    const job = await reserveJob("owner", "11", 50000, 2, FOUNDER_EMAILS[0]);
    expect(await dispatchJobCall(job, 90000, 32000, true)).toMatchObject({ quotaExempt: true, outputLimit: 32000, reservedCents: 0 });
    await recordJobUsage(job, 110000, false);
    expect((await dispatchJobCall(job, 90000, 32000, true)).outputLimit).toBe(32000);
    await recordJobUsage(job, 110000, false);
    expect(await finishJob(job)).toMatchObject({ status: "settled", usedTokens: 220000, quotaExempt: true });
    expect(balance).toBe(0); expect(spent).toBe(0);
  });
  it.each(["session-only", "account-only", "neither"])("does not grant founder exemption for %s identity", async mode => {
    accountEmail = mode === "account-only" ? FOUNDER_EMAILS[0] : "customer@example.org";
    const job = await reserveJob("owner", "11", 50000, 0, mode === "session-only" ? FOUNDER_EMAILS[0] : undefined);
    await expect(dispatchJobCall(job, 90000, 32000, true)).rejects.toThrow("too small");
    expect(JSON.parse(records[0].content).quotaExempt).not.toBe(true);
  });
  it("keeps founder jobs owner-scoped, validates estimates and prevents unbounded loops", async () => {
    accountEmail = FOUNDER_EMAILS[0];
    await expect(reserveJob("owner", "99", 50000, 0, FOUNDER_EMAILS[0])).rejects.toThrow("Conversation");
    const job = await reserveJob("owner", "11", 50000, 0, FOUNDER_EMAILS[0]);
    await expect(dispatchJobCall(job, -1, 32000, true)).rejects.toThrow("Invalid");
    for (let i = 0; i < 5; i++) {
      await dispatchJobCall(job, 90000, 32000, true);
      await recordJobUsage(job, 110000, false);
    }
    await expect(dispatchJobCall(job, 90000, 32000, true)).rejects.toThrow("safety limit");
  });
  it("serializes competing reservations and never spends one balance twice", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => reserveJob("owner", "11", 50000, 2)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(balance).toBe(0); expect(spent).toBe(2); expect(records).toHaveLength(1);
  });
  it("releases an undispatched reservation once, including repeated settlement", async () => {
    const job = await reserveJob("owner", "11", 50000, 2);
    expect((await finishJob(job)).status).toBe("released");
    await finishJob(job);
    expect(balance).toBe(2); expect(spent).toBe(0);
  });
  it("atomically fits the requested output to the remaining job allowance", async () => {
    const job = await reserveJob("owner", "11", 50000, 2);
    const dispatched = await dispatchJobCall(job, 25000, 32000, true);
    expect(dispatched.outputLimit).toBe(25000);
    await recordJobUsage(job, 20000, false);
    expect((await dispatchJobCall(job, 25000, 32000, true)).outputLimit).toBe(5000);
    await recordJobUsage(job, 29000, false);
    await expect(dispatchJobCall(job, 750, 1000, true)).rejects.toThrow("too small");
  });
  it("settles completed usage and retains ambiguous dispatches", async () => {
    const job = await reserveJob("owner", "11", 50000, 2);
    await dispatchJobCall(job, 4000, 1000); await recordJobUsage(job, 1200, false);
    expect(await finishJob(job)).toMatchObject({ status: "settled", usedTokens: 1200, estimated: false });
    expect(balance).toBe(0);
    const free = await reserveJob("owner", "11");
    await dispatchJobCall(free, 4000, 1000);
    expect((await finishJob(free)).status).toBe("uncertain");
  });
  it("stops before a further provider call would exceed the allowance", async () => {
    const job = await reserveJob("owner", "11", 10000);
    await dispatchJobCall(job, 1000, 1000); await recordJobUsage(job, 5000, true);
    await expect(dispatchJobCall(job, 5000, 1000)).rejects.toThrow("budget");
    expect(JSON.parse(records[0].content).calls).toBe(1);
    expect((await finishJob(job)).status).toBe("settled");
  });
  it("refunds a definitive rejected request, not an ambiguous timeout", async () => {
    const job = await reserveJob("owner", "11", 50000, 2);
    await dispatchJobCall(job, 1, 1); await recordJobRejection(job);
    expect((await finishJob(job)).status).toBe("released");
    expect(balance).toBe(2);
  });
  it.each(["invalid model edit", "file persistence failure"])("releases customer charges after %s without erasing provider usage", async () => {
    const job = await reserveJob("owner", "11", 50000, 2);
    await dispatchJobCall(job, 4000, 1000); await recordJobUsage(job, 1200, false);
    expect(await finishJob(job, false)).toMatchObject({ status: "released", usedTokens: 1200 });
    await finishJob(job, false);
    expect(balance).toBe(2); expect(spent).toBe(0);
  });
  it("rejects wrong owners, spending limits, and client-invented tariffs", async () => {
    await expect(reserveJob("other", "11", 50000, 2)).rejects.toThrow("Account");
    await expect(reserveJob("owner", "99", 50000, 2)).rejects.toThrow("Conversation");
    await expect(reserveJob("owner", "11", 50000, 200)).rejects.toThrow("charge");
    expect(() => tokenBudget(9999)).toThrow(); expect(() => tokenBudget(50001)).toThrow();
    expect(tokenBudget(undefined)).toBe(50000);
  });
  it("preserves unsettled billing records when a customer deletes a conversation", async () => {
    const job = await reserveJob("owner", "11", 50000, 2);
    await expect(deleteConversationWithBudgetGuard("owner", "11")).rejects.toThrow("unresolved");
    expect(records).toHaveLength(1);
    await finishJob(job);
    await deleteConversationWithBudgetGuard("owner", "11");
    expect(records).toHaveLength(0);
  });
});
