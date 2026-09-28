import { beforeEach, describe, expect, it, vi } from "vitest";
const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("../db", () => ({ pool: { connect } }));
vi.mock("../replit_integrations/quota", () => ({
  COST_CENTS: { audio: 5 },
  DAILY_REQUEST_LIMITS: { audio: { starter: 20, payg: 2000, pro: 400, business: 800 } },
}));
import { reserveAudioUsage } from "../audio-reservation";

let user: any;
let logs: Array<{ model: string; cost: number }>;
let used: number;
let failInsert: boolean;
let queries: string[];
beforeEach(() => {
  user = { plan: "payg", payg_balance: 5, payg_limit: 0, payg_spent: 0 };
  logs = []; used = 0; failInsert = false; queries = [];
  let tail = Promise.resolve();
  connect.mockImplementation(async () => {
    let unlock: (() => void) | undefined;
    let debit = 0;
    let pending: { model: string; cost: number } | undefined;
    return {
      release: vi.fn(),
      query: async (sql: string, params: any[] = []) => {
        queries.push(sql);
        if (sql.includes("FOR UPDATE")) {
          const previous = tail;
          tail = new Promise<void>((resolve) => { unlock = resolve; });
          await previous;
          return { rows: [{ ...user }] };
        }
        if (sql.startsWith("SELECT model")) return { rows: logs.filter((log) => log.model.startsWith(params[1].slice(0, -1))) };
        if (sql.includes("count(*)")) return { rows: [{ used: used + logs.length, spent: logs.reduce((sum, log) => sum + log.cost, 0) }] };
        if (sql.startsWith("UPDATE users")) debit = params[1];
        if (sql.startsWith("INSERT INTO usage_logs")) {
          if (failInsert) throw new Error("insert failed");
          pending = { model: params[1], cost: params[2] };
        }
        if (sql === "COMMIT") {
          user.payg_balance -= debit; user.payg_spent += debit;
          if (pending) logs.push(pending);
          unlock?.();
        }
        if (sql === "ROLLBACK") unlock?.();
        return { rows: [] };
      },
    };
  });
});
describe("atomic audio reservation using users row lock", () => {
  it("serializes concurrent duplicate keys into one usage row and one debit", async () => {
    const results = await Promise.allSettled([
      reserveAudioUsage("u", "request-key-123456", "default", Buffer.from("a")),
      reserveAudioUsage("u", "request-key-123456", "default", Buffer.from("a")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.code).toBe("AUDIO_ALREADY_RESERVED");
    expect(logs).toHaveLength(1);
    expect(user.payg_balance).toBe(0);
    expect(user.payg_spent).toBe(5);
    expect(queries).toContain("SELECT * FROM users WHERE id=$1 FOR UPDATE");
  });
  it("prevents voice conversation and standalone audio requests overspending shared PAYG", async () => {
    const results = await Promise.allSettled([
      reserveAudioUsage("u", "request-key-123456", "default", Buffer.from("a")),
      reserveAudioUsage("u", "request-key-654321", "conversation:12:voice:alloy", Buffer.from("b"), 12),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(user.payg_balance).toBe(0);
  });
  it("rejects payload conflicts, daily limits and spend caps", async () => {
    await reserveAudioUsage("u", "request-key-123456", "default", Buffer.from("a"));
    await expect(reserveAudioUsage("u", "request-key-123456", "afro-test", Buffer.from("a"))).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    user.plan = "starter"; used = 20;
    await expect(reserveAudioUsage("u", "request-key-654321", "default", Buffer.from("a"))).rejects.toMatchObject({ code: "DAILY_QUOTA_REACHED" });
    user.plan = "payg"; used = 0; user.payg_balance = 100; user.payg_limit = 5;
    await expect(reserveAudioUsage("u", "request-key-654321", "default", Buffer.from("a"))).rejects.toMatchObject({ code: "PAYG_LIMIT_REACHED" });
  });
  it("rolls back the debit when the usage insert fails", async () => {
    failInsert = true;
    await expect(reserveAudioUsage("u", "request-key-123456", "default", Buffer.from("a"))).rejects.toThrow("insert failed");
    expect(user.payg_balance).toBe(5);
    expect(logs).toHaveLength(0);
    expect(queries.at(-1)).toBe("ROLLBACK");
  });
});