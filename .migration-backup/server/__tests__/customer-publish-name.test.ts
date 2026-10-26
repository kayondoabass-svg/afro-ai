import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyCustomerPublishName, hasForbiddenCustomerBrand } from "../customer-branding";

it("uses the publish-form name for the screenshot's incorrect app title and heading", () => {
  const html = '<html><head><title>AfroBalance</title></head><body><h1>AfroBalance</h1><button>Check Balance</button></body></html>';
  const result = applyCustomerPublishName(html, "shakuibstraders");
  expect(result).toContain("<title>shakuibstraders</title>");
  expect(result).toContain("<h1>shakuibstraders</h1>");
  expect(result).toContain("<button>Check Balance</button>");
  expect(hasForbiddenCustomerBrand(result)).toBe(false);
});
it("retitles a renamed customer brand without overwriting descriptive hero text or scripts", () => {
  const html = '<title>Old Shop</title><a class="logo">Old Shop</a><h1>Everything you need in one place</h1><script>const name = "Old Shop";</script>';
  const result = applyCustomerPublishName(html, "New Shop");
  expect(result).toContain('<a class="logo">New Shop</a>');
  expect(result).toContain("<h1>Everything you need in one place</h1>");
  expect(result).toContain('<script>const name = "Old Shop";</script>');
});
it("requires a name rather than silently selecting vendor identity or a hostname", () => {
  for (const name of ["", "Afro AI", "KEYO Technologies", null, "AfroBalance"]) {
    expect(() => applyCustomerPublishName("<title>App</title>", name)).toThrow("preferred");
  }
});
it("escapes the chosen name as text", () => {
  expect(applyCustomerPublishName("<title>App</title>", '<img src=x onerror=alert(1)>')).not.toContain("<img");
});
it("does not prefill a publish target from an unrelated latest project", () => {
  const code = readFileSync("client/src/pages/ai-chat.tsx", "utf8");
  const dialog = code.slice(code.indexOf("export function PublishDialog"), code.indexOf("export function PublishDialog") + 5000);
  expect(dialog).not.toContain("const latest = apps[0]");
  expect(dialog).toContain('app.htmlContent.trim() === code.trim()');
});