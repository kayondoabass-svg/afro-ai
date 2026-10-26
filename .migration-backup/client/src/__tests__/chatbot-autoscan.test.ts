import { describe, it, expect } from "vitest";
import { parseRobots, isAllowedByRobots, dedupeQas, detectSensitive } from "../../../server/chatbot-autoscan";

describe("parseRobots", () => {
  it("extracts sitemaps and per-UA rules", () => {
    const txt = `
      Sitemap: https://example.com/sitemap.xml

      User-agent: *
      Disallow: /admin

      User-agent: AfroAIBot
      Allow: /admin/public
      Disallow: /admin/private
    `;
    const r = parseRobots(txt);
    expect(r.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
    expect(r.disallow).toContain("/admin/private");
    expect(r.allow).toContain("/admin/public");
  });

  it("falls back to * group when no specific UA match", () => {
    const txt = `User-agent: *\nDisallow: /private\n`;
    const r = parseRobots(txt);
    expect(r.disallow).toEqual(["/private"]);
  });
});

describe("isAllowedByRobots", () => {
  const rules = parseRobots(`
    User-agent: *
    Disallow: /admin
    Allow: /admin/public
  `);

  it("disallows under blocked prefix", () => {
    expect(isAllowedByRobots("/admin/secret", rules)).toBe(false);
  });

  it("re-allows more-specific path", () => {
    expect(isAllowedByRobots("/admin/public/page", rules)).toBe(true);
  });

  it("allows unrelated paths", () => {
    expect(isAllowedByRobots("/blog", rules)).toBe(true);
  });
});

describe("detectSensitive", () => {
  it("flags emails", () => {
    expect(detectSensitive("contact me at jane@example.com")?.reason).toBe("Email address");
  });
  it("returns null for plain marketing copy", () => {
    expect(detectSensitive("We make great chairs for offices.")).toBeNull();
  });
});

describe("dedupeQas", () => {
  it("removes near-duplicate questions", () => {
    const rows = [
      { question: "What are your shipping times?" },
      { question: "What are the shipping times?" },
      { question: "Do you ship internationally?" },
    ];
    const kept = dedupeQas(rows, 0.6);
    expect(kept.length).toBe(2);
  });
});
