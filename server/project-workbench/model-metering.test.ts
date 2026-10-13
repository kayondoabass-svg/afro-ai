import { describe, it, expect } from "vitest";
import { modelInputBound, measuredUsage } from "./model-metering";
describe("complete model-call metering", () => {
  it("includes selected-file UTF-8 content and all system context before dispatch", () => {
    const messages = [{ role: "system" as const, content: "file: " + "漢".repeat(4000) }, { role: "user" as const, content: "Change it" }];
    expect(modelInputBound({ messages })).toBeGreaterThan(12000 + 4096);
  });
  it("budgets image processing rather than counting encoded bytes as text", () => {
    const bound = modelInputBound({ messages: [{role:"user",content:[{type:"image_url",image_url:{url:"data:image/png;base64,"+"A".repeat(100000)}}]}] });
    expect(bound).toBeGreaterThan(24000); expect(bound).toBeLessThan(25000);
  });
  it("does not treat output-only counts as complete provider usage", () => {
    expect(measuredUsage({completionTokens:5},10000,4000)).toEqual({tokens:14000,estimated:true});
    expect(measuredUsage({promptTokens:20,completionTokens:5},10000,4000)).toEqual({tokens:25,estimated:false});
  });
});
