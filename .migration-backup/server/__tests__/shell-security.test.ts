import { describe, expect, it } from "vitest";
import { FOUNDER_EMAIL } from "../replit_integrations/auth";
import { hasShellAccess, isAllowedShellOrigin } from "../shell-security";

const secret = "a".repeat(40);
const founder = { isAuthenticated: () => true, user: { claims: { email: FOUNDER_EMAIL } } };

describe("shell connection security", () => {
  it("requires an authenticated founder AND a matching, strong shared secret", () => {
    expect(hasShellAccess(founder, secret, secret, true)).toBe(true);
    expect(hasShellAccess(founder, secret, secret, false)).toBe(false);
    expect(hasShellAccess({ ...founder, isAuthenticated: () => false }, secret, secret, true)).toBe(false);
    expect(hasShellAccess({ ...founder, user: { claims: { email: "admin@example.com" } } }, secret, secret, true)).toBe(false);
    expect(hasShellAccess({ user: founder.user }, secret, secret, true)).toBe(false);
    expect(hasShellAccess(founder, "b".repeat(40), secret, true)).toBe(false);
    expect(hasShellAccess(founder, "a".repeat(39), secret, true)).toBe(false);
    expect(hasShellAccess(founder, {}, secret, true)).toBe(false);
    expect(hasShellAccess(founder, "short", "short", true)).toBe(false);
  });

  it("restricts origins, including WebSocket upgrades without CORS enforcement", () => {
    expect(isAllowedShellOrigin("https://afroaigroup.com")).toBe(true);
    expect(isAllowedShellOrigin("https://site.pages.dev", "https://site.pages.dev")).toBe(true);
    expect(isAllowedShellOrigin("https://other.pages.dev", "https://site.pages.dev")).toBe(false);
    expect(isAllowedShellOrigin("https://evil.example")).toBe(false);
    expect(isAllowedShellOrigin("https://afroaigroup.com.evil.example")).toBe(false);
    expect(isAllowedShellOrigin("http://afroaigroup.com")).toBe(false);
    expect(isAllowedShellOrigin("null")).toBe(false);
    expect(isAllowedShellOrigin(undefined)).toBe(false);
  });
});