import { expect, it, vi } from "vitest";
import { verifyAppDomain } from "../domain-connection";
it("does not verify a domain just because it has an IP address", async () => {
  const dns = { resolveCname: vi.fn().mockResolvedValue(["other.example"]), resolve4: vi.fn(async (name: string) => [name === "afroaigroup.com" ? "203.0.113.1" : "203.0.113.2"]), resolve6: vi.fn().mockResolvedValue([]) };
  expect(await verifyAppDomain("customer.example", dns as any)).toBe(false);
});
it("verifies canonical CNAMEs and flattened apex records against the real target", async () => {
  const dns = { resolveCname: vi.fn().mockResolvedValue(["AFROAIGROUP.COM."]), resolve4: vi.fn().mockResolvedValue(["203.0.113.1"]), resolve6: vi.fn().mockResolvedValue([]) };
  expect(await verifyAppDomain("customer.example", dns as any)).toBe(true);
  dns.resolveCname.mockRejectedValue(new Error("No CNAME"));
  expect(await verifyAppDomain("customer.example", dns as any)).toBe(true);
  dns.resolve4.mockRejectedValue(new Error("DNS unavailable"));
  expect(await verifyAppDomain("customer.example", dns as any)).toBe(false);
});