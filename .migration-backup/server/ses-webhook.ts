import crypto from "crypto";
import https from "https";
import { db } from "./db";
import { emailApiLogs, emailSuppressions } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// SNS message validation
//
// References:
//   https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
//
// We validate every notification ourselves rather than trusting the body,
// because the endpoint is public and Amazon does not authenticate to it.
// ─────────────────────────────────────────────────────────────────────────────

const SIGNING_CERT_HOST_RE = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/i;
const certCache = new Map<string, { pem: string; expires: number }>();
const CERT_TTL_MS = 60 * 60 * 1000; // 1h

export interface SnsMessage {
  Type: string;
  MessageId: string;
  Token?: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  UnsubscribeURL?: string;
}

function fetchUrl(url: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if ((res.statusCode || 0) >= 400) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error(`Timeout fetching ${url}`)); });
  });
}

async function getSigningCert(certUrl: string): Promise<string> {
  const cached = certCache.get(certUrl);
  if (cached && cached.expires > Date.now()) return cached.pem;

  // Validate URL is genuinely from AWS SNS before fetching
  let parsed: URL;
  try { parsed = new URL(certUrl); } catch { throw new Error("Invalid SigningCertURL"); }
  if (parsed.protocol !== "https:") throw new Error("SigningCertURL must use HTTPS");
  if (!SIGNING_CERT_HOST_RE.test(parsed.hostname)) throw new Error(`SigningCertURL host not trusted: ${parsed.hostname}`);
  if (!parsed.pathname.endsWith(".pem")) throw new Error("SigningCertURL is not a .pem file");

  const pem = await fetchUrl(certUrl);
  certCache.set(certUrl, { pem, expires: Date.now() + CERT_TTL_MS });
  return pem;
}

function buildCanonicalString(msg: SnsMessage): string {
  // Order and presence are defined by the SNS docs and depend on Type.
  const isSubscription = msg.Type === "SubscriptionConfirmation" || msg.Type === "UnsubscribeConfirmation";
  const fields: string[] = isSubscription
    ? ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"]
    : ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"];

  let out = "";
  for (const f of fields) {
    const v = (msg as any)[f];
    if (v === undefined || v === null) continue; // Subject is optional and skipped if absent
    out += `${f}\n${v}\n`;
  }
  return out;
}

export async function verifySnsMessage(msg: SnsMessage): Promise<boolean> {
  if (!msg || !msg.Signature || !msg.SigningCertURL) return false;
  const algo = msg.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1";
  if (msg.SignatureVersion !== "1" && msg.SignatureVersion !== "2") return false;

  const pem = await getSigningCert(msg.SigningCertURL);
  const verifier = crypto.createVerify(algo);
  verifier.update(buildCanonicalString(msg), "utf8");
  return verifier.verify(pem, msg.Signature, "base64");
}

// ─────────────────────────────────────────────────────────────────────────────
// Suppression list helpers
// ─────────────────────────────────────────────────────────────────────────────

const suppressionCache = new Set<string>();
let suppressionCacheLoad: Promise<void> | null = null;

function loadSuppressionCache(): Promise<void> {
  if (suppressionCacheLoad) return suppressionCacheLoad;
  suppressionCacheLoad = (async () => {
    try {
      const rows = await db.select({ email: emailSuppressions.email }).from(emailSuppressions);
      for (const r of rows) suppressionCache.add(r.email.toLowerCase());
    } catch (e: any) {
      // Likely table doesn't exist yet; silently leave cache empty so sending isn't blocked.
      console.warn("[ses-webhook] Could not load suppression cache:", e?.message || e);
      // Allow a retry on the next call rather than caching a permanent failure
      suppressionCacheLoad = null;
    }
  })();
  return suppressionCacheLoad;
}

export async function isSuppressed(email: string): Promise<boolean> {
  if (!email) return false;
  const norm = email.trim().toLowerCase();
  await loadSuppressionCache();
  if (suppressionCache.has(norm)) return true;
  // Fall back to a DB check in case another process added it
  try {
    const [row] = await db.select().from(emailSuppressions).where(eq(emailSuppressions.email, norm)).limit(1);
    if (row) {
      suppressionCache.add(norm);
      return true;
    }
  } catch {/* ignore */}
  return false;
}

export async function addSuppression(input: {
  email: string;
  reason: "hard_bounce" | "complaint" | "manual";
  bounceType?: string;
  bounceSubType?: string;
  complaintFeedbackType?: string;
  diagnosticCode?: string;
  source?: "ses" | "manual";
  notes?: string;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email) return;
  try {
    await db.insert(emailSuppressions).values({
      email,
      reason: input.reason,
      bounceType: input.bounceType,
      bounceSubType: input.bounceSubType,
      complaintFeedbackType: input.complaintFeedbackType,
      diagnosticCode: input.diagnosticCode,
      source: input.source || "ses",
      notes: input.notes,
    }).onConflictDoNothing();
    suppressionCache.add(email);
  } catch (e: any) {
    console.error("[ses-webhook] Failed to add suppression for", email, e?.message || e);
  }
}

export async function removeSuppression(email: string): Promise<void> {
  const norm = email.trim().toLowerCase();
  await db.delete(emailSuppressions).where(eq(emailSuppressions.email, norm));
  suppressionCache.delete(norm);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounce / complaint / delivery processing
// ─────────────────────────────────────────────────────────────────────────────

interface SesEventRecipient { emailAddress: string; status?: string; diagnosticCode?: string; }
interface SesEventBounce {
  bounceType: "Permanent" | "Transient" | "Undetermined";
  bounceSubType?: string;
  bouncedRecipients: SesEventRecipient[];
  timestamp?: string;
}
interface SesEventComplaint {
  complainedRecipients: { emailAddress: string }[];
  complaintFeedbackType?: string;
  timestamp?: string;
}
interface SesEventDelivery {
  recipients: string[];
  timestamp?: string;
}
interface SesEventEnvelope {
  notificationType?: "Bounce" | "Complaint" | "Delivery";
  eventType?: "Bounce" | "Complaint" | "Delivery";
  mail?: { messageId?: string; source?: string };
  bounce?: SesEventBounce;
  complaint?: SesEventComplaint;
  delivery?: SesEventDelivery;
}

async function updateLogsByMessageId(messageId: string | undefined, patch: Record<string, any>): Promise<void> {
  if (!messageId) return;
  try {
    await db.update(emailApiLogs).set(patch).where(eq(emailApiLogs.messageId, messageId));
  } catch (e: any) {
    console.warn("[ses-webhook] Could not patch email_api_logs:", e?.message || e);
  }
}

export async function handleSesEvent(envelope: SesEventEnvelope): Promise<{ ok: true; type: string; processed: number }> {
  const type = envelope.notificationType || envelope.eventType || "Unknown";
  const messageId = envelope.mail?.messageId;
  let processed = 0;

  if (type === "Bounce" && envelope.bounce) {
    const b = envelope.bounce;
    const isPermanent = b.bounceType === "Permanent";
    for (const r of b.bouncedRecipients || []) {
      processed++;
      await updateLogsByMessageId(messageId, {
        status: "bounced",
        bouncedAt: new Date(),
        bounceType: b.bounceType,
        bounceSubType: b.bounceSubType,
        error: r.diagnosticCode || `${b.bounceType}/${b.bounceSubType || ""}`,
      });
      if (isPermanent) {
        await addSuppression({
          email: r.emailAddress,
          reason: "hard_bounce",
          bounceType: b.bounceType,
          bounceSubType: b.bounceSubType,
          diagnosticCode: r.diagnosticCode,
        });
        console.log(`[ses-webhook] Hard bounce → suppressed ${r.emailAddress} (${b.bounceSubType || "Permanent"})`);
      } else {
        console.log(`[ses-webhook] Soft bounce for ${r.emailAddress} (${b.bounceType}/${b.bounceSubType || ""}) — not suppressing`);
      }
    }
  } else if (type === "Complaint" && envelope.complaint) {
    const c = envelope.complaint;
    for (const r of c.complainedRecipients || []) {
      processed++;
      await updateLogsByMessageId(messageId, {
        status: "complained",
        complainedAt: new Date(),
        complaintFeedbackType: c.complaintFeedbackType,
      });
      await addSuppression({
        email: r.emailAddress,
        reason: "complaint",
        complaintFeedbackType: c.complaintFeedbackType,
      });
      console.log(`[ses-webhook] Complaint → suppressed ${r.emailAddress} (${c.complaintFeedbackType || "unspecified"})`);
    }
  } else if (type === "Delivery" && envelope.delivery) {
    for (const _r of envelope.delivery.recipients || []) {
      processed++;
      await updateLogsByMessageId(messageId, {
        status: "delivered",
        deliveredAt: new Date(),
      });
    }
  } else {
    console.warn(`[ses-webhook] Unknown SES event type: ${type}`);
  }

  return { ok: true, type, processed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Express handler — wire as POST /api/ses/sns with express.text() body parser.
// SNS sends `Content-Type: text/plain` with a JSON body, so we parse here.
// ─────────────────────────────────────────────────────────────────────────────

export async function handleSnsRequest(rawBody: string): Promise<{ status: number; body: any }> {
  let msg: SnsMessage;
  try { msg = JSON.parse(rawBody); }
  catch { return { status: 400, body: { error: "Invalid JSON" } }; }

  if (!msg.Type || !msg.Signature) return { status: 400, body: { error: "Missing SNS fields" } };

  // Optionally pin to a known TopicArn
  const allowedTopic = process.env.SES_SNS_TOPIC_ARN;
  if (allowedTopic && msg.TopicArn !== allowedTopic) {
    console.warn(`[ses-webhook] Rejected message from unexpected topic: ${msg.TopicArn}`);
    return { status: 403, body: { error: "Topic not allowed" } };
  }

  // Verify signature
  let valid = false;
  try { valid = await verifySnsMessage(msg); } catch (e: any) {
    console.error("[ses-webhook] Signature verify error:", e?.message || e);
    return { status: 400, body: { error: "Signature verification failed" } };
  }
  if (!valid) return { status: 403, body: { error: "Invalid signature" } };

  // Subscription handshake — auto-confirm by GETting SubscribeURL
  if (msg.Type === "SubscriptionConfirmation" || msg.Type === "UnsubscribeConfirmation") {
    if (!msg.SubscribeURL) return { status: 400, body: { error: "Missing SubscribeURL" } };
    try {
      const u = new URL(msg.SubscribeURL);
      if (u.protocol !== "https:" || !/amazonaws\.com$/i.test(u.hostname.split(".").slice(-2).join("."))) {
        return { status: 400, body: { error: "SubscribeURL not trusted" } };
      }
      await fetchUrl(msg.SubscribeURL);
      console.log(`[ses-webhook] Confirmed SNS subscription for topic ${msg.TopicArn}`);
      return { status: 200, body: { confirmed: true } };
    } catch (e: any) {
      console.error("[ses-webhook] SubscribeURL fetch failed:", e?.message || e);
      return { status: 500, body: { error: "Subscription confirm failed" } };
    }
  }

  if (msg.Type !== "Notification") {
    return { status: 400, body: { error: `Unsupported Type: ${msg.Type}` } };
  }

  // The Message field contains the SES JSON envelope (as a string)
  let envelope: SesEventEnvelope;
  try { envelope = JSON.parse(msg.Message); }
  catch { return { status: 400, body: { error: "Inner Message is not JSON" } }; }

  const result = await handleSesEvent(envelope);
  return { status: 200, body: result };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate stats helper for the admin dashboard
// ─────────────────────────────────────────────────────────────────────────────

export async function getReputationStats(): Promise<{
  sent: number; delivered: number; bounced: number; complained: number;
  bounceRate: number; complaintRate: number; suppressed: number;
}> {
  const [counts] = await db.execute<{ sent: number; delivered: number; bounced: number; complained: number }>(
    sql`SELECT
          COUNT(*) FILTER (WHERE status IN ('sent','delivered','bounced','complained'))::int AS sent,
          COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
          COUNT(*) FILTER (WHERE status = 'bounced')::int AS bounced,
          COUNT(*) FILTER (WHERE status = 'complained')::int AS complained
        FROM email_api_logs` as any
  ) as any;
  const sent = Number(counts?.sent || 0);
  const delivered = Number(counts?.delivered || 0);
  const bounced = Number(counts?.bounced || 0);
  const complained = Number(counts?.complained || 0);

  const [supRow] = await db.select({ c: sql<number>`count(*)::int` }).from(emailSuppressions);
  const suppressed = Number(supRow?.c || 0);

  return {
    sent, delivered, bounced, complained,
    bounceRate: sent > 0 ? bounced / sent : 0,
    complaintRate: sent > 0 ? complained / sent : 0,
    suppressed,
  };
}
