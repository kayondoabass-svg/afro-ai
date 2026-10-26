import { describe, expect, it } from "vitest";
import { affiliateApplicationInput } from "../affiliate-application";

describe("public affiliate application input", () => {
  it("normalizes names and emails and leaves omitted optional fields empty", () => {
    expect(affiliateApplicationInput.parse({ fullName: "  Ada Lovelace ", email: " ADA@Example.COM " })).toEqual({
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: null,
      country: null,
      promotionMethod: null,
      socialMedia: null,
    });
  });

  it.each([
    null,
    {},
    { fullName: " ", email: "ada@example.com" },
    { fullName: "Ada", email: "not-an-email" },
    { fullName: 42, email: "ada@example.com" },
    { fullName: "Ada", email: "ada@example.com", phone: { invalid: true } },
    { fullName: "Ada", email: "ada@example.com", promotionMethod: "x".repeat(2001) },
  ])("rejects malformed or oversized applications: %j", (input) => {
    expect(affiliateApplicationInput.safeParse(input).success).toBe(false);
  });
});