import { describe, it, expect } from "vitest";
import { modelInputBound, measuredUsage } from "./model-metering";
describe("complete model-call metering", () => {
  it("includes selected-file UTF-8 content and all system context before dispatch", () => {
    const messages = [{ role: "system" as const, content: "file: " + "漢".repeat(4000) }, { role: "user" as const, content: "Change it" }];
    const bound = modelInputBound({ messages });
    expect(bound).toBeGreaterThan(8000 + 1024);
    expect(bound).toBeLessThan(12000 + 1024);
  });
  it("budgets image processing rather than counting encoded bytes as text", () => {
    const bound = modelInputBound({ messages: [{role:"user",content:[{type:"image_url",image_url:{url:"data:image/png;base64,"+"A".repeat(100000)}}]}] });
    expect(bound).toBeGreaterThan(21000); expect(bound).toBeLessThan(22000);
  });
  it("does not treat output-only counts as complete provider usage", () => {
    expect(measuredUsage({completionTokens:5},10000,4000)).toEqual({tokens:14000,estimated:true});
    expect(measuredUsage({promptTokens:20,completionTokens:5},10000,4000)).toEqual({tokens:25,estimated:false});
  });
  it("does not interpret special-token-looking customer text as tokenizer control", () => {
    expect(() => modelInputBound({ messages: [{ role: "user", content: "<|endoftext|> literal text" }] })).not.toThrow();
  });
});
