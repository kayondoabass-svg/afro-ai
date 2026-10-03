// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";
vi.hoisted(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { clear() {} } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { clear() {} } });
});
const mocks = vi.hoisted(() => ({
  execute: vi.fn(), orders: vi.fn(), order: vi.fn(), apps: vi.fn(), update: vi.fn(),
  info: vi.fn(), records: vi.fn(), write: vi.fn(), remove: vi.fn(), nameservers: vi.fn(),
  resolve: vi.fn(), txt: vi.fn(),
}));
vi.mock("../db", () => ({ db: { execute: mocks.execute } }));
vi.mock("../storage", () => ({ storage: {
  getDomainOrdersByUser: mocks.orders, getDomainOrder: mocks.order, getPublishedAppsByUser: mocks.apps, updateDomainOrder: mocks.update,
} }));
vi.mock("../namedotcom", () => ({ getDomainInfo: mocks.info, listDomainRecords: mocks.records,
  writeDomainRecord: mocks.write, deleteDomainRecord: mocks.remove, setNameservers: mocks.nameservers }));
vi.mock("node:dns/promises", () => ({ Resolver: class { setServers() {} resolve = mocks.resolve; resolveTxt = mocks.txt; } }));
import { registerDomainManagementRoutes, normalizeDomain, validateDnsRecord, validateNameservers } from "../domain-management";
const extId = "235422fa-bbc1-4de8-bff2-e3d45882cf1a";
let server: Server, origin: string;
beforeAll(async () => {
  const app = express(); app.use(express.json());
  registerDomainManagementRoutes(app, (req: any, res, next) => {
    if (!req.headers["x-user"]) return void res.status(401).json({ message: "Sign in" });
    req.user = { claims: { sub: req.headers["x-user"] } }; next();
  });
  server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  origin = `http://127.0.0.1:${(server.address() as any).port}/api/domain-manager`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue({ rows: [] }); mocks.apps.mockResolvedValue([]);
  const order = { id: 1, userId: "owner", domainName: "example.com", status: "active", pricePaid: 1754 };
  mocks.order.mockResolvedValue(order); mocks.orders.mockImplementation(async owner => owner === "owner" ? [order] : []);
  mocks.info.mockResolvedValue({ nameservers: ["ns1.example.net", "ns2.example.net"], locked: true, privacyEnabled: true, autorenewEnabled: false });
  mocks.records.mockResolvedValue([{ id: 10, host: "www", type: "A", answer: "203.0.113.1", ttl: 300 }]);
  mocks.resolve.mockResolvedValue([]); mocks.txt.mockResolvedValue([]);
});
const request = (path = "", method = "GET", body?: unknown, owner = "owner") => fetch(origin + path, {
  method, headers: { "x-user": owner, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});
it("requires authentication and scopes the domain list", async () => {
  expect((await fetch(origin)).status).toBe(401);
  expect((await (await request()).json()).domains[0].domainName).toBe("example.com");
  expect((await (await request("", "GET", undefined, "other")).json()).domains).toEqual([]);
});
it("denies cross-user registrar reads and edits before provider access", async () => {
  expect((await request("/afro:1", "GET", undefined, "other")).status).toBe(404);
  expect((await request("/afro:1/dns/10", "DELETE", undefined, "other")).status).toBe(404);
  expect(mocks.info).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
});
it("shows owned provider details, flags, and DNS records without exposing raw contacts", async () => {
  mocks.info.mockResolvedValue({ locked: true, contacts: { secret: "private" }, nameservers: [] });
  const data = await (await request("/afro:1")).json();
  expect(data.details.locked).toBe(true); expect(data.dns.records[0].hostname).toBe("www");
  expect(data.details.contacts).toBeUndefined(); expect(data.capabilities.dns).toBe(true);
});
it("returns saved details and disables controls on registrar failure", async () => {
  mocks.info.mockRejectedValueOnce(new Error("Unavailable"));
  const data = await (await request("/afro:1")).json();
  expect(data.registrarAvailable).toBe(false); expect(data.capabilities.nameservers).toBe(false);
  expect(data.message).toContain("unavailable");
});
it("blocks unpaid registrar changes and validates DNS record IDs within the owned domain", async () => {
  mocks.order.mockResolvedValueOnce({ id: 1, userId: "owner", domainName: "example.com", status: "pending_payment" });
  expect((await request("/afro:1/dns", "POST", {})).status).toBe(403);
  expect((await request("/afro:1/dns/99", "DELETE")).status).toBe(404);
  expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
});
it("supports validated create, edit, and deletion of owned DNS records", async () => {
  const record = { hostname: "www", type: "A", answer: "203.0.113.5", ttl: 300 };
  expect((await request("/afro:1/dns", "POST", record)).status).toBe(200);
  expect(mocks.write).toHaveBeenCalledWith("example.com", { host: "www", type: "A", answer: "203.0.113.5", ttl: 300 }, undefined);
  expect((await request("/afro:1/dns/10", "PUT", record)).status).toBe(200);
  expect((await request("/afro:1/dns/10", "DELETE")).status).toBe(204);
});
it("verifies the exact external TXT token and never calls the platform registrar", async () => {
  const row = { id: extId, domain_name: "external.example", verification_token: "token", verified_at: null };
  mocks.execute.mockImplementation(async query => {
    const { sql, params } = new PgDialect().sqlToQuery(query);
    return { rows: sql.includes("SELECT *") && params.includes("owner") ? [row] : [] };
  });
  mocks.txt.mockResolvedValue([["afro-domain-", "verification=token"]]);
  const verified = await (await request(`/external:${extId}/verify`, "POST")).json();
  expect(verified.verified).toBe(true);
  expect((await request(`/external:${extId}/nameservers`, "PUT", { nameservers: ["ns1.example.com", "ns2.example.com"] })).status).toBe(403);
  expect((await request(`/external:${extId}`, "GET", undefined, "other")).status).toBe(404);
  expect(mocks.info).not.toHaveBeenCalled(); expect(mocks.nameservers).not.toHaveBeenCalled();
});
it("validates public domain names, nameservers, and record values", () => {
  expect(normalizeDomain(" EXAMPLE.COM. ")).toBe("example.com");
  for (const name of ["https://example.com", "127.0.0.1", "example.com/path", "localhost"]) expect(() => normalizeDomain(name)).toThrow();
  expect(() => validateNameservers(["ns1.example.com", "ns1.example.com"])).toThrow();
  expect(() => validateDnsRecord({ hostname: "@", type: "A", answer: "invalid", ttl: 300 })).toThrow();
  expect(validateDnsRecord({ hostname: "@", type: "TXT", answer: "proof", ttl: 300 }).host).toBe("");
});