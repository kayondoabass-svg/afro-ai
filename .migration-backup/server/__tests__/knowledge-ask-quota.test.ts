import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("knowledge ask quota wiring", () => {
  it("records exactly one successful ask using the guard's plan and cost, not tool rounds", () => {
    const routes = readFileSync(resolve(__dirname, "../routes.ts"), "utf8");
    const section = routes.split('app.post("/api/knowledge/ask"')[1]?.split("// ============ CHATBOT WIDGETS")[0];
    expect(section).toBeDefined();
    expect(section).toContain('aiBurstLimiters.chat, aiQuotaGuard("chat")');
    expect(section).toContain('if (!ctx) return res.status(503)');
    expect(section).toContain("if (!controller.signal.aborted && !res.headersSent && !res.destroyed)");
    expect(section?.match(/await recordAiUsage\(/g)).toHaveLength(1);
    expect(section).toContain("costCents: ctx.cost");
    expect(section).toContain("plan: ctx.plan");
    expect(section).toContain("tokensUsed: 0");
  });
});