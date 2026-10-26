// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { chatbotReplyAllowance } from "../../shared/chatbot-display";
import { manualKnowledge, scanFailure, verifyWidgetHtml, CUSTOMER_CHAT_POLICY } from "../chatbot-support";

describe("customer-independent chatbot support", () => {
  it("formats founder/unlimited, finite, exhausted and invalid usage without NaN", () => {
    expect(chatbotReplyAllowance({ repliesLimit: -1, repliesUsed: 42 })).toBe("Unlimited AI replies");
    expect(chatbotReplyAllowance({ repliesLimit: 100, repliesUsed: 37 })).toContain("63 AI replies");
    expect(chatbotReplyAllowance({ repliesLimit: 100, repliesUsed: 120 })).toContain("0 AI replies");
    for (const bad of [{}, { repliesLimit: 50 }, { repliesLimit: NaN, repliesUsed: 1 }, { repliesLimit: 5, repliesUsed: -1 }]) {
      expect(chatbotReplyAllowance(bad)).toBe("Reply usage unavailable");
    }
  });
  it("keeps real facts, removes legacy owner placeholders and redacts private tokens", () => {
    const facts = manualKnowledge("We offer bookkeeping.\n[Add your email here]\n[This website uses JavaScript rendering. Please fill in services]\nsecret key: abcdefghijklmnopqrstuvwxyz");
    expect(facts).toContain("bookkeeping");
    expect(facts).not.toContain("Add your email");
    expect(facts).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
  it.each(["https://shop.example", "https://school.example"])("matches query keys on any customer site %s", site => {
    expect(verifyWidgetHtml('<script defer src="https://afroaigroup.com/widget.js?key=public-widget"></script>', site, "public-widget").verified).toBe(true);
  });
  it("supports legacy data-key, attribute order, unquoted attributes and escaped query separators", () => {
    expect(verifyWidgetHtml('<script data-key="public-widget" async src="https://afroaigroup.com/widget.js"></script>', "https://school.example", "public-widget").verified).toBe(true);
    expect(verifyWidgetHtml('<script SRC=https://afroaigroup.com/widget.js?x=1&amp;key=public-widget defer></script>', "https://school.example", "public-widget").verified).toBe(true);
  });
  it("does not accept another script, unrelated inline text, comments or a wrong key", () => {
    for (const html of [
      '<p>public-widget widget.js</p>',
      '<script src="https://evil.example/widget.js?key=public-widget"></script>',
      '<!-- <script src="https://afroaigroup.com/widget.js?key=public-widget"></script> -->',
      '<script src="https://afroaigroup.com/not-widget.js?key=public-widget"></script>',
      '<script src="https://afroaigroup.com/widget.js?key=old-key"></script><p>public-widget</p>',
    ]) expect(verifyWidgetHtml(html, "https://shop.example", "public-widget").verified).toBe(false);
  });
  it("allows a correct installation alongside an unrelated old embed", () => {
    const result = verifyWidgetHtml('<script src="https://afroaigroup.com/widget.js?key=old"></script><script src="https://afroaigroup.com/widget.js?key=current"></script>', "https://shop.example", "current");
    expect(result.code).toBe("MATCHED");
    expect(result.message).not.toContain("live and working");
  });
  it("does not leak SQL/parameters to customers", () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error('Failed query: insert into chatbot_scanned_pages params secret-value');
    const message = scanFailure(error);
    expect(message).toMatch(/reference [a-f0-9]{8}/);
    expect(message).not.toMatch(/insert into|params|secret-value/);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("chatbot-scan:"), error);
    logger.mockRestore();
  });
  it("uses a generic business policy without promising actions it cannot execute", () => {
    expect(CUSTOMER_CHAT_POLICY).toContain("Do not claim to create files");
    expect(CUSTOMER_CHAT_POLICY).not.toMatch(/Brightboard|Africa only/i);
  });
});
