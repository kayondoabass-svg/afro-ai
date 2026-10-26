import { describe, expect, it } from "vitest";
import { calculate } from "../calculator";

describe("calculate", () => {
  it("respects precedence, grouping, unary signs and right-associative powers", () => {
    expect(calculate("2 + 3 * (4 - 1)")).toBe(11);
    expect(calculate("-2^2 + 2^3^2")).toBe(508);
    expect(calculate("2^-3 + .25")).toBe(0.375);
    expect(calculate("10 % 4 + 1e2")).toBe(102);
  });

  it("rejects execution syntax, malformed inputs, and nonfinite results", () => {
    for (const input of ["", "2+foo", "1;process.exit()", "Math.sqrt(4)", "(1+2", "1+", "2**3", "1/0", "0%0", "10^1000", "1e999"]) {
      expect(() => calculate(input)).toThrow();
    }
  });

  it("enforces length and nesting/operation limits", () => {
    expect(() => calculate("1".repeat(501))).toThrow();
    expect(() => calculate("(".repeat(33) + "1" + ")".repeat(33))).toThrow();
    expect(() => calculate("-".repeat(34) + "1")).toThrow();
    expect(() => calculate("1+".repeat(201) + "1")).toThrow();
  });
});