import { describe, it, expect } from "vitest";
import { safeReturnTo } from "../github";

describe("safeReturnTo", () => {
  it("allows internal paths", () => {
    expect(safeReturnTo("/ai-chat")).toBe("/ai-chat");
    expect(safeReturnTo("/dashboard/auth/42")).toBe("/dashboard/auth/42");
  });
  it("blocks protocol-relative urls", () => {
    expect(safeReturnTo("//evil.com/x")).toBe("/ai-chat");
  });
  it("blocks absolute urls", () => {
    expect(safeReturnTo("https://evil.com/x")).toBe("/ai-chat");
    expect(safeReturnTo("http://evil.com")).toBe("/ai-chat");
  });
  it("blocks javascript: and other schemes", () => {
    expect(safeReturnTo("javascript:alert(1)")).toBe("/ai-chat");
    expect(safeReturnTo("/javascript:alert(1)")).toBe("/ai-chat");
  });
  it("blocks CRLF injection", () => {
    expect(safeReturnTo("/ok\r\nLocation: https://evil.com")).toBe("/ai-chat");
  });
  it("falls back on empty / wrong type / too long", () => {
    expect(safeReturnTo("")).toBe("/ai-chat");
    expect(safeReturnTo(undefined)).toBe("/ai-chat");
    expect(safeReturnTo(null)).toBe("/ai-chat");
    expect(safeReturnTo(123 as any)).toBe("/ai-chat");
    expect(safeReturnTo("/" + "a".repeat(600))).toBe("/ai-chat");
  });
});
