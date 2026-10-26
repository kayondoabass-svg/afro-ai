import type { Express, Request, RequestHandler, Response } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import { storage } from "./storage";
import { getDomainInfo, listDomainRecords, writeDomainRecord, deleteDomainRecord, setNameservers } from "./namedotcom";

const resolver = new Resolver({ timeout: 3000, tries: 2 });
resolver.setServers(["1.1.1.1", "8.8.8.8"]);
let tableReady: Promise<unknown> | undefined;
function ensureExternalTable() {
  tableReady ??= db.execute(sql`CREATE TABLE IF NOT EXISTS external_domains (
    id UUID PRIMARY KEY, user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain_name TEXT NOT NULL, registrar TEXT, verification_token TEXT NOT NULL,
    verified_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, domain_name)
  )`).catch(error => { tableReady = undefined; throw error; });
  return tableReady;
}
class DomainError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function normalizeDomain(value: unknown): string {
  if (typeof value !== "string") throw new DomainError(400, "Enter a domain name, not a URL");
  if (/[\/\\:@?#\s]/.test(value.trim())) throw new DomainError(400, "Enter a domain name without a protocol, port, or path");
  const name = domainToASCII(value.trim().toLowerCase().replace(/\.$/, ""));
  if (!name || name.length > 253 || isIP(name) || !name.includes(".") ||
      !name.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      !/^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/.test(name.split(".").at(-1)!)) {
    throw new DomainError(400, "Enter a valid public domain without a protocol, port, or path");
  }
  return name;
}
export function validateNameservers(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 13) throw new DomainError(400, "Enter 2–13 nameservers");
  const names = value.map(normalizeDomain);
  if (new Set(names).size !== names.length) throw new DomainError(400, "Nameservers must be unique");
  return names;
}
const recordSchema = z.object({
  hostname: z.string().trim().max(253).default(""),
  type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"]),
  answer: z.string().trim().min(1).max(4096),
  ttl: z.number().int().min(300).max(604800),
  priority: z.number().int().min(0).max(65535).optional(),
});
export function validateDnsRecord(body: unknown) {
  const parsed = recordSchema.safeParse(body);
  if (!parsed.success) throw new DomainError(400, "Provide a supported record type, host, answer, and TTL of 300–604800 seconds");
  const record = parsed.data;
  const host = record.hostname === "@" ? "" : record.hostname;
  if (host && !host.split(".").every((part, i) => (part === "*" && i === 0) || /^[a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?$/.test(part))) {
    throw new DomainError(400, "Use a relative DNS host such as www, @, or _service");
  }
  if ((record.type === "A" && isIP(record.answer) !== 4) || (record.type === "AAAA" && isIP(record.answer) !== 6)) {
    throw new DomainError(400, "Use a valid IP address for this record type");
  }
  if (["MX", "CNAME", "NS"].includes(record.type)) normalizeDomain(record.answer);
  if (["MX", "SRV"].includes(record.type) && record.priority === undefined) throw new DomainError(400, "Priority is required for MX and SRV records");
  return { host, type: record.type, answer: record.answer, ttl: record.ttl, ...(record.priority === undefined ? {} : { priority: record.priority }) };
}

function userId(req: Request) { return (req as any).user.claims.sub as string; }
function purchasedSummary(order: any) {
  return { id: `afro:${order.id}`, source: "afro", domainName: order.domainName, status: order.status,
    expiresAt: order.expiryDate || null, verifiedAt: null, pricePaid: order.pricePaid, registrar: "Name.com" };
}
function externalSummary(row: any) {
  return { id: `external:${row.id}`, source: "external", domainName: row.domain_name,
    status: row.verified_at ? "verified" : "unverified", expiresAt: null,
    verifiedAt: row.verified_at || null, pricePaid: null, registrar: row.registrar || null };
}
async function ownedDomain(id: string, owner: string) {
  if (/^afro:[1-9]\d*$/.test(id)) {
    const order = await storage.getDomainOrder(Number(id.slice(5)));
    if (!order || order.userId !== owner) throw new DomainError(404, "Domain not found");
    return { summary: purchasedSummary(order), order, external: null };
  }
  if (id.startsWith("external:") && z.string().uuid().safeParse(id.slice(9)).success) {
    await ensureExternalTable();
    const result = await db.execute(sql`SELECT * FROM external_domains WHERE id = ${id.slice(9)}::uuid AND user_id = ${owner}`);
    if (result.rows[0]) return { summary: externalSummary(result.rows[0]), order: null, external: result.rows[0] as any };
  }
  throw new DomainError(404, "Domain not found");
}
async function activeOwnedDomain(req: Request) {
  const owned = await ownedDomain(String(req.params.id), userId(req));
  if (!owned.order || owned.order.status !== "active") throw new DomainError(403, "Registrar changes are only available for your active Afro AI purchases");
  return owned;
}
async function publicDns(name: string) {
  const records: any[] = [], errors: string[] = [];
  await Promise.all(["A", "AAAA", "MX", "NS", "TXT", "CNAME"].map(async type => {
    try {
      const values = await resolver.resolve(name, type);
      for (const value of values as any[]) records.push({
        hostname: "", type, answer: Array.isArray(value) ? value.join("") : typeof value === "object" ? value.exchange : value,
        ...(typeof value === "object" && value.priority !== undefined ? { priority: value.priority } : {}),
      });
    } catch (error: any) {
      if (!["ENODATA", "ENOTFOUND", "ENONAME"].includes(error.code)) errors.push(`${type} lookup failed; retry later`);
    }
  }));
  return { records, errors };
}
function handler(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res) => { void fn(req, res).catch(error => {
    if (error instanceof DomainError) return res.status(error.status).json({ message: error.message });
    console.error("[domain-manager]", error instanceof Error ? error.message : "Unknown failure");
    res.status(503).json({ message: "Domain service temporarily unavailable. Please retry; no automatic retry of registrar changes was made." });
  }); };
}
export function registerDomainManagementRoutes(app: Express, auth: RequestHandler) {
  app.use("/api/domain-manager", auth, rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }),
    (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.get("/api/domain-manager", handler(async (req, res) => {
    await ensureExternalTable();
    const [orders, external] = await Promise.all([
      storage.getDomainOrdersByUser(userId(req)),
      db.execute(sql`SELECT * FROM external_domains WHERE user_id = ${userId(req)} ORDER BY created_at DESC`),
    ]);
    res.json({ domains: [...orders.map(purchasedSummary), ...external.rows.map(externalSummary)] });
  }));
  app.post("/api/domain-manager/external", handler(async (req, res) => {
    const name = normalizeDomain(req.body?.domainName);
    const registrar = z.string().trim().max(100).optional().safeParse(req.body?.registrar);
    if (!registrar.success) throw new DomainError(400, "Registrar must be text up to 100 characters");
    await ensureExternalTable();
    const result = await db.execute(sql`INSERT INTO external_domains (id,user_id,domain_name,registrar,verification_token)
      SELECT ${randomUUID()}::uuid, ${userId(req)}, ${name}, ${registrar.data || null}, ${randomBytes(24).toString("hex")}
      WHERE (SELECT COUNT(*) FROM external_domains WHERE user_id = ${userId(req)}) < 100
      ON CONFLICT (user_id,domain_name) DO NOTHING RETURNING *`);
    if (!result.rows[0]) throw new DomainError(409, "Domain already added or the 100-domain limit has been reached");
    res.status(201).json({ domain: externalSummary(result.rows[0]) });
  }));
  app.get("/api/domain-manager/:id", handler(async (req, res) => {
    const owned = await ownedDomain(String(req.params.id), userId(req));
    const domain = owned.summary;
    let info: any = {}, registrarAvailable = false, message: string | undefined;
    let dns: { records: any[]; errors: string[] } = { records: [], errors: [] };
    if (owned.order?.status === "active") {
      try { info = await getDomainInfo(domain.domainName); registrarAvailable = true; }
      catch { message = "Name.com is currently unavailable. Showing saved details; registrar changes are disabled."; }
      if (registrarAvailable) {
        try { dns.records = (await listDomainRecords(domain.domainName)).map(record => ({
          id: record.id, hostname: record.host || "", type: record.type, answer: record.answer, ttl: record.ttl, priority: record.priority,
        })); } catch { dns.errors.push("Registrar DNS records unavailable; changes are disabled"); }
      }
    } else if (owned.external) { dns = await publicDns(domain.domainName); }
    const apps = await storage.getPublishedAppsByUser(userId(req));
    const website = apps.find(item => item.customDomain?.toLowerCase() === domain.domainName);
    const ns = Array.isArray(info.nameservers) ? info.nameservers : owned.order?.nameservers ||
      dns.records.filter(record => record.type === "NS").map(record => record.answer);
    res.json({
      domain, details: { nameservers: ns, locked: typeof info.locked === "boolean" ? info.locked : null,
        privacyEnabled: typeof info.privacyEnabled === "boolean" ? info.privacyEnabled : null,
        autoRenewEnabled: typeof info.autorenewEnabled === "boolean" ? info.autorenewEnabled : null,
        createDate: info.createDate || null, expireDate: info.expireDate || domain.expiresAt },
      dns, verification: owned.external ? { name: `_afro-verify.${domain.domainName}`, value: `afro-domain-verification=${owned.external.verification_token}` } : null,
      registrarAvailable, message,
      website: website ? { appId: website.id, appName: website.title, verified: website.customDomainVerified, dnsTarget: "afroaigroup.com" } : null,
      capabilities: { nameservers: registrarAvailable, dns: registrarAvailable && dns.errors.length === 0 },
    });
  }));
  app.post("/api/domain-manager/:id/verify", handler(async (req, res) => {
    const owned = await ownedDomain(String(req.params.id), userId(req));
    if (!owned.external) throw new DomainError(400, "This domain is an Afro AI purchase");
    let texts: string[][] = [];
    try { texts = await resolver.resolveTxt(`_afro-verify.${owned.summary.domainName}`); }
    catch (error: any) {
      if (!["ENODATA", "ENOTFOUND", "ENONAME"].includes(error.code)) throw new DomainError(503, "DNS verification unavailable; try again shortly");
    }
    const verified = texts.some(parts => parts.join("") === `afro-domain-verification=${owned.external.verification_token}`);
    await db.execute(sql`UPDATE external_domains SET verified_at = ${verified ? new Date() : null}
      WHERE id = ${owned.external.id}::uuid AND user_id = ${userId(req)}`);
    res.json({ verified, message: verified ? "Domain ownership verified" : "TXT record not found yet. Check the value and allow time for DNS propagation." });
  }));
  app.delete("/api/domain-manager/:id", handler(async (req, res) => {
    const owned = await ownedDomain(String(req.params.id), userId(req));
    if (!owned.external) throw new DomainError(400, "Purchased domains cannot be removed here");
    await db.execute(sql`DELETE FROM external_domains WHERE id = ${owned.external.id}::uuid AND user_id = ${userId(req)}`);
    res.status(204).end();
  }));
  app.put("/api/domain-manager/:id/nameservers", handler(async (req, res) => {
    const owned = await activeOwnedDomain(req);
    const nameservers = validateNameservers(req.body?.nameservers);
    await setNameservers(owned.summary.domainName, nameservers);
    await storage.updateDomainOrder(owned.order.id, { nameservers });
    res.json({ success: true });
  }));
  const saveRecord = handler(async (req, res) => {
    const owned = await activeOwnedDomain(req);
    const body = validateDnsRecord(req.body);
    const id = req.params.recordId === undefined ? undefined : Number(req.params.recordId);
    if (id !== undefined && (!Number.isSafeInteger(id) || id < 1)) throw new DomainError(400, "Invalid record ID");
    if (id !== undefined && !(await listDomainRecords(owned.summary.domainName)).some(record => record.id === id)) throw new DomainError(404, "DNS record not found");
    const record = await writeDomainRecord(owned.summary.domainName, body, id);
    res.json({ record });
  });
  app.post("/api/domain-manager/:id/dns", saveRecord);
  app.put("/api/domain-manager/:id/dns/:recordId", saveRecord);
  app.delete("/api/domain-manager/:id/dns/:recordId", handler(async (req, res) => {
    const owned = await activeOwnedDomain(req);
    const id = Number(req.params.recordId);
    if (!Number.isSafeInteger(id) || id < 1) throw new DomainError(400, "Invalid record ID");
    if (!(await listDomainRecords(owned.summary.domainName)).some(record => record.id === id)) throw new DomainError(404, "DNS record not found");
    await deleteDomainRecord(owned.summary.domainName, id);
    res.status(204).end();
  }));
}