import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CUSTOMER_BRANDING_POLICY, needsCustomerName, customerNameQuestion, hasForbiddenCustomerBrand } from "../customer-branding";
import { sanitizeKeyoImpersonation } from "../security";

describe("preferred customer name", () => {
  it.each(["Build a USSD app for selling airtime", "Create a website", "Make a business dashboard"])("asks before unnamed build: %s", prompt => {
    expect(needsCustomerName([], prompt, "")).toBe(true);
  });
  it.each(["Build a website named Shakuibs Traders", "Create an app called Sunrise Finance", "Business name: Shakuibs Traders. Build a website."])("uses explicit names: %s", prompt => {
    expect(needsCustomerName([], prompt, "")).toBe(false);
  });
  it("uses the owner's project name rather than login/profile details", () => {
    expect(needsCustomerName([], "Build a website", "", "Shakuibs Traders")).toBe(false);
    expect(needsCustomerName([], "Build a website", "", "New Project")).toBe(true);
    expect(needsCustomerName([], "Build a website", "", "KEYO")).toBe(true);
  });
  it("retains a naming answer across later turns", () => {
    const history = [
      { role: "user", content: "Build a shop website" },
      { role: "assistant", content: customerNameQuestion("en") },
      { role: "user", content: "Shakuibs Traders" },
    ];
    expect(needsCustomerName(history, "Add an about section too", "")).toBe(false);
  });
  it("does not treat approval or vendor names as a customer name", () => {
    const history = [{ role: "assistant", content: customerNameQuestion("en") }];
    for (const answer of ["yes", "go ahead", "KEYO", "Afro AI", "AfroBalance", "choose for me"]) {
      expect(needsCustomerName(history, answer, ""), answer).toBe(true);
    }
  });
  it("recognizes localized intake answers", () => {
    expect(needsCustomerName([{ role: "assistant", content: customerNameQuestion("sw") }], "Duka la Amina", "")).toBe(false);
  });
  it("does not interrupt ordinary questions or edits", () => {
    expect(needsCustomerName([], "How do I build a website?", "")).toBe(false);
    expect(needsCustomerName([], "Make the app blue", "<html>existing</html>")).toBe(false);
  });
  it("does not accept assistant-invented branding as the customer's choice", () => {
    expect(needsCustomerName([{ role: "assistant", content: "App name: Sunrise" }], "Build an app", "")).toBe(true);
  });
});

describe("generated and published client branding", () => {
  it.each([
    "<title>AfroBalance</title>", "<h1>KEYO Technologies</h1>",
    "<h2>Afro AI</h2>", "<title>AfroBank</title>",
    "<h1>Afro<span>Balance</span></h1>", "<h1>&#65;froBalance</h1>",
  ])("detects vendor/invented app identity: %s", html => expect(hasForbiddenCustomerBrand(html)).toBe(true));
  it("allows customer brands and explicitly supplied non-platform Afro-prefixed brands", () => {
    expect(hasForbiddenCustomerBrand("<title>Shakuibs Traders</title>")).toBe(false);
    expect(hasForbiddenCustomerBrand("<title>AfroMusic</title>", "Our actual app is named AfroMusic")).toBe(false);
    expect(hasForbiddenCustomerBrand("<p>Compare with Afro AI.</p>")).toBe(false);
  });
  it("removes unwanted vendor attribution without renaming customer content", () => {
    const html = "<title>Shakuibs Traders</title><footer>Powered by Afro AI</footer><p>Built by KEYO TECHNOLOGIES</p>";
    expect(sanitizeKeyoImpersonation(html)).not.toMatch(/Powered by Afro AI|Built by KEYO/);
    expect(sanitizeKeyoImpersonation(html)).toContain("Shakuibs Traders");
  });
  it("covers naming and product-specific design without faking a USSD integration", () => {
    expect(CUSTOMER_BRANDING_POLICY).toContain("ask ONE short question");
    expect(CUSTOMER_BRANDING_POLICY).toContain("heading and four plain buttons");
    expect(CUSTOMER_BRANDING_POLICY).toContain("do not claim live airtime");
  });
  it("wires unconditional policy and pre-save checks into real generation and publishing", () => {
    const chat = readFileSync("server/replit_integrations/chat/routes.ts", "utf8");
    expect(chat).not.toContain("If unsure of a name or color: make a smart assumption");
    expect(chat).toContain("contextPrompt += CUSTOMER_BRANDING_POLICY");
    expect(chat).toContain("needsCustomerName(namingHistory");
    expect(chat.indexOf("hasForbiddenCustomerBrand(fullResponse")).toBeLessThan(chat.indexOf('createMessage(conversationId, "assistant", fullResponse)'));
    expect(readFileSync("server/routes.ts", "utf8")).toContain("hasForbiddenCustomerBrand(sanitizedHtml");
    expect(readFileSync("server/project-tools.ts", "utf8")).toContain("${CUSTOMER_BRANDING_POLICY}");
  });
});