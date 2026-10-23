// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CREDIT_PACKS, creditCheckoutModeError, creditCheckoutUrl, normalizeCreditCountryCode } from "../../shared/credit-checkout";
describe("credit purchase contract", () => {
  it.each([["ug", "UG"], [" UG ", "UG"], ["KE", "KE"], ["US", "US"], ["", undefined], [null, undefined], [{}, undefined], ["Uganda", undefined]])(
    "normalizes checkout country without claiming specific payment-network availability: %s", (input, expected) => {
      expect(normalizeCreditCountryCode(input)).toBe(expected);
    });
  it("preserves all existing one-time pack prices and wallet amounts", () => {
    expect(CREDIT_PACKS).toEqual([
      { key: "pack5", usd: 5, credits: 500 }, { key: "pack10", usd: 10, credits: 1000 },
      { key: "pack20", usd: 20, credits: 2000 }, { key: "pack50", usd: 50, credits: 5000 },
    ]);
    expect(creditCheckoutModeError({ pack: "pack5" })).toBeNull();
    expect(creditCheckoutModeError({ pack: "pack5", mode: "one-time" })).toBeNull();
  });
  it.each([{ mode: "auto-topup" }, { autoTopUp: true }, { autoRenew: true }, { recurring: true }])(
    "rejects automatic charging rather than silently downgrading it: %s", body => {
      expect(creditCheckoutModeError(body)).toMatchObject({ status: 409, code: "AUTO_TOPUP_UNAVAILABLE" });
    });
  it.each([null, [], { mode: "monthly" }, { autoTopUp: "true" }])("rejects an invalid purchase mode: %s", body => {
    expect(creditCheckoutModeError(body)?.status).toBe(400);
  });
  it.each(["https://pay.pesapal.com/checkout", "https://cybqa.pesapal.com/checkout"])("accepts secure provider checkout: %s", url => {
    expect(creditCheckoutUrl(url)).toBe(url);
  });
  it.each(["http://pay.pesapal.com/checkout", "https://evil.test/checkout", "https://customer:password@pay.pesapal.com/checkout", "", undefined])(
    "rejects unsafe payment redirects: %s", url => { expect(() => creditCheckoutUrl(url)).toThrow(); });
});
