import crypto from "node:crypto";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { storage } from "./storage";

export class ChatbotVerificationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function normalizeChatbotHostname(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) throw new ChatbotVerificationError(400, "Enter a public website hostname.");
  let url: URL;
  try { url = new URL(value.trim().includes("://") ? value.trim() : `https://${value.trim()}`); }
  catch { throw new ChatbotVerificationError(400, "Enter a valid website hostname."); }
  const hostname = domainToASCII(url.hostname).toLowerCase().replace(/\.$/, "");
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      url.port || hostname.length > 230 || isIP(hostname) || !hostname.includes(".") ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(hostname) ||
      !hostname.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new ChatbotVerificationError(400, "Use a public domain, without credentials, custom ports, or wildcards.");
  }
  return hostname;
}

function hostnameOrNull(value: unknown) {
  try { return normalizeChatbotHostname(value); } catch { return null; }
}
function iso(value: Date | string | null) { return value ? new Date(value).toISOString() : null; }
function domainDto(row: any) {
  return {
    id: row.id, hostname: row.hostname, status: row.verified_at ? "verified" : "pending",
    createdAt: iso(row.created_at), verifiedAt: iso(row.verified_at), lastCheckedAt: iso(row.last_checked_at),
    verification: { type: "TXT", name: `_afro-chatbot.${row.hostname}`, value: row.token, ttl: 300 },
  };
}
export async function chatbotVerificationState(widget: { id: number; websiteUrl: string | null; isActive?: boolean }) {
  const [{ rows: settings }, { rows: domains }] = await Promise.all([
    pool.query("SELECT * FROM chatbot_site_settings WHERE widget_id=$1", [widget.id]),
    pool.query("SELECT * FROM chatbot_verified_domains WHERE widget_id=$1 ORDER BY created_at,id", [widget.id]),
  ]);
  const policy = settings[0];
  if (!policy) throw new ChatbotVerificationError(503, "Website verification needs an operator schema update.");
  const hostname = hostnameOrNull(widget.websiteUrl);
  const verified = domains.some(row => row.hostname === hostname && row.verified_at);
  const installation = policy.installation_checked_at && policy.installation_url === widget.websiteUrl ? {
    verified: policy.installation_verified, code: policy.installation_code,
    message: policy.installation_message, url: policy.installation_url, checkedAt: iso(policy.installation_checked_at),
  } : null;
  const visitorTest = policy.test_checked_at && policy.test_url === widget.websiteUrl ? {
    succeeded: policy.test_succeeded, checkedAt: iso(policy.test_checked_at),
  } : null;
  const statusLabel = widget.isActive === false ? "Disabled" : !verified
    ? "Enabled — ownership pending" : !installation?.verified
      ? "Ownership verified — installation not confirmed" : visitorTest?.succeeded
        ? "Installed — reply test passed" : "Installed — visitor reply not tested";
  return { enforcement: policy.enforcement, websiteHostname: hostname, statusLabel, domains: domains.map(domainDto), installation, visitorTest };
}

export async function addChatbotDomain(widgetId: number, input: unknown) {
  const hostname = normalizeChatbotHostname(input);
  const { rows } = await pool.query(
    `INSERT INTO chatbot_verified_domains(id,widget_id,hostname,token)
     SELECT $1,$2,$3,$4 WHERE (SELECT count(*) FROM chatbot_verified_domains WHERE widget_id=$2)<20
     ON CONFLICT(widget_id,hostname) DO UPDATE SET hostname=EXCLUDED.hostname RETURNING *`,
    [crypto.randomUUID(), widgetId, hostname, `afro-chatbot-verification=${crypto.randomBytes(32).toString("hex")}`],
  );
  if (!rows[0]) throw new ChatbotVerificationError(400, "A chatbot can have at most 20 website hostnames.");
  return domainDto(rows[0]);
}

export async function checkChatbotDomain(widgetId: number, domainId: string, lookup?: (name: string) => Promise<string[][]>) {
  if (!/^[a-f0-9-]{36}$/i.test(domainId)) throw new ChatbotVerificationError(404, "Domain not found.");
  const { rows } = await pool.query(
    `UPDATE chatbot_verified_domains SET last_checked_at=now()
     WHERE id=$1 AND widget_id=$2 AND (last_checked_at IS NULL OR last_checked_at<now()-interval '15 seconds')
     RETURNING *`, [domainId, widgetId],
  );
  if (!rows[0]) {
    const found = await pool.query("SELECT id FROM chatbot_verified_domains WHERE id=$1 AND widget_id=$2", [domainId, widgetId]);
    throw new ChatbotVerificationError(found.rows[0] ? 429 : 404, found.rows[0] ? "Wait 15 seconds before checking DNS again." : "Domain not found.");
  }
  const domain = rows[0];
  let records: string[][] = [];
  try {
    records = await (lookup || ((name: string) => new Resolver({ timeout: 3000, tries: 2 }).resolveTxt(name)))(`_afro-chatbot.${domain.hostname}`);
  } catch (error: any) {
    if (!["ENODATA", "ENOTFOUND", "NXDOMAIN"].includes(error.code)) {
      throw new ChatbotVerificationError(503, "DNS lookup is temporarily unavailable. Previous ownership proof was not changed.");
    }
  }
  const verified = records.some(parts => parts.join("") === domain.token);
  const saved = await pool.query("UPDATE chatbot_verified_domains SET verified_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE id=$1 AND widget_id=$2 AND token=$4",
    [domainId, widgetId, verified, domain.token]);
  if (!saved.rowCount) throw new ChatbotVerificationError(409, "This ownership challenge changed. Refresh before checking again.");
  return { verified, message: verified ? "Website ownership verified." : "The matching TXT record was not found. Check the record name and value, allow DNS propagation, then check again." };
}

// An embed key is public. Origin restrictions are browser-abuse controls, not
// cryptographic authentication for arbitrary non-browser clients.
export async function chatbotBrowserOrigin(widgetId: number, origin: unknown) {
  const { rows } = await pool.query("SELECT enforcement FROM chatbot_site_settings WHERE widget_id=$1", [widgetId]);
  if (!rows[0]) throw new ChatbotVerificationError(503, "Website verification needs an operator schema update.");
  if (rows[0].enforcement === "legacy") return { allowed: true, origin: "*" };
  if (typeof origin !== "string") return { allowed: false, origin: null };
  let hostname: string;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.pathname !== "/" || url.search || url.hash) return { allowed: false, origin: null };
    hostname = normalizeChatbotHostname(origin);
  } catch { return { allowed: false, origin: null }; }
  const verified = await pool.query("SELECT id FROM chatbot_verified_domains WHERE widget_id=$1 AND hostname=$2 AND verified_at IS NOT NULL", [widgetId, hostname]);
  return { allowed: Boolean(verified.rows[0]), origin: verified.rows[0] ? origin : null };
}

export async function saveChatbotInstallation(widgetId: number, url: string, result: { verified: boolean; code?: string; message: string }) {
  const checkedAt = new Date().toISOString();
  const saved = await pool.query(`UPDATE chatbot_site_settings SET installation_verified=$2,installation_code=$3,
    installation_message=$4,installation_url=$5,installation_checked_at=$6 WHERE widget_id=$1`,
    [widgetId, result.verified, result.code || "UNAVAILABLE", result.message, url, checkedAt]);
  if (!saved.rowCount) throw new ChatbotVerificationError(409, "The chatbot changed before its installation result could be saved.");
  return { ...result, url, checkedAt };
}
export async function saveChatbotReplyTest(widgetId: number, url: string, succeeded: boolean) {
  const saved = await pool.query("UPDATE chatbot_site_settings SET test_succeeded=$2,test_url=$3,test_checked_at=now() WHERE widget_id=$1", [widgetId, succeeded, url]);
  if (!saved.rowCount) throw new ChatbotVerificationError(409, "The chatbot changed before its test result could be saved.");
}

export function registerChatbotVerificationRoutes(app: Express, auth: RequestHandler, replyTest: (widget: any, message: string, req: any, res: any) => Promise<void>, testLimiter: RequestHandler) {
  const owned: RequestHandler = async (req: any, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    const owner = req.user?.claims?.sub || req.user?.claims?.id;
    const id = Number(req.params.id);
    if (!owner) return res.status(401).json({ message: "Not authenticated" });
    if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ message: "Chatbot not found." });
    try {
      const widget = await storage.getChatbotWidgetById(id);
      if (!widget || widget.userId !== owner) return res.status(404).json({ message: "Chatbot not found." });
      req.ownedChatbot = widget;
      next();
    } catch { res.status(503).json({ message: "Chatbot verification unavailable." }); }
  };
  const route = (fn: (req: any, res: any) => Promise<any>): RequestHandler => async (req, res) => {
    try { await fn(req, res); }
    catch (error) {
      res.status(error instanceof ChatbotVerificationError ? error.status : 503).json({
        message: error instanceof ChatbotVerificationError ? error.message : "Website verification could not complete. Please retry.",
      });
    }
  };
  app.get("/api/chatbots/:id/verification", auth, owned, route(async (req, res) => res.json(await chatbotVerificationState(req.ownedChatbot))));
  app.post("/api/chatbots/:id/domains", auth, owned, route(async (req, res) => res.json(await addChatbotDomain(req.ownedChatbot.id, req.body?.hostname))));
  app.post("/api/chatbots/:id/domains/:domainId/check", auth, owned, route(async (req, res) => res.json(await checkChatbotDomain(req.ownedChatbot.id, req.params.domainId))));
  app.delete("/api/chatbots/:id/domains/:domainId", auth, owned, route(async (req, res) => {
    if (!/^[a-f0-9-]{36}$/i.test(req.params.domainId)) throw new ChatbotVerificationError(404, "Domain not found.");
    const result = await pool.query("DELETE FROM chatbot_verified_domains WHERE id=$1 AND widget_id=$2 RETURNING id", [req.params.domainId, req.ownedChatbot.id]);
    if (!result.rows[0]) throw new ChatbotVerificationError(404, "Domain not found.");
    res.json({ removed: true });
  }));
  app.post("/api/chatbots/:id/verification/enforce", auth, owned, route(async (req, res) => {
    const state = await chatbotVerificationState(req.ownedChatbot);
    if (!state.domains.some((domain: any) => domain.hostname === state.websiteHostname && domain.status === "verified")) {
      throw new ChatbotVerificationError(409, "Verify the website in Settings before enabling approved-origin protection.");
    }
    await pool.query("UPDATE chatbot_site_settings SET enforcement='required' WHERE widget_id=$1", [req.ownedChatbot.id]);
    res.json({ enforcement: "required" });
  }));
  app.post("/api/chatbots/:id/verification/test", auth, testLimiter, owned, route(async (req, res) => {
    if (req.body?.consent !== true) throw new ChatbotVerificationError(400, "Confirm that this test uses your existing reply allowance.");
    const state = await chatbotVerificationState(req.ownedChatbot);
    if (!state.domains.some((domain: any) => domain.hostname === state.websiteHostname && domain.status === "verified")) {
      throw new ChatbotVerificationError(409, "Verify your website before testing a visitor reply.");
    }
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message || message.length > 500) throw new ChatbotVerificationError(400, "Use a test message between 1 and 500 characters.");
    await saveChatbotReplyTest(req.ownedChatbot.id, req.ownedChatbot.websiteUrl, false);
    await replyTest(req.ownedChatbot, message, req, res);
  }));
}
