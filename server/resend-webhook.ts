// Resend → Afro AI webhook receiver. Resend signs every event with Svix.
//
// Set up:
//   1. Run `bash scripts/deploy.sh` once this code is live.
//   2. https://resend.com/webhooks → Add endpoint
//        URL:    https://afroaigroup.com/api/resend/webhook
//        Events: email.sent, email.delivered, email.bounced,
//                email.complained, email.delivery_delayed,
//                email.opened, email.clicked
//   3. Copy the signing secret (starts `whsec_`) into the Replit secret
//      RESEND_WEBHOOK_SECRET and into /srv/afro-ai/shared/.env on the
//      droplet. Restart afro-ai.
//
// We feed events into the same `email_api_logs` + `email_suppressions`
// tables the SES pipeline uses, so the existing /email-audit dashboard
// "just works" for Resend traffic too.

import crypto from "crypto";
import { db } from "./db";
import { emailApiLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { addSuppression } from "./ses-webhook";

interface SvixHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

const TOLERANCE_SECONDS = 5 * 60;

function getSvixHeaders(req: any): SvixHeaders | null {
  const id = String(req.headers["svix-id"] || "");
  const timestamp = String(req.headers["svix-timestamp"] || "");
  const signature = String(req.headers["svix-signature"] || "");
  if (!id || !timestamp || !signature) return null;
  return { id, timestamp, signature };
}

// Svix signing scheme:
//   secret  = base64-decode(whsec_xxx without the "whsec_" prefix)
//   payload = `${id}.${timestamp}.${rawBody}`
//   sig     = "v1,<base64(HMAC-SHA256(payload, secret))>"
// A single header may contain multiple space-separated signatures —
// any one matching means the event is genuine.
export function verifySvix(rawBody: string, headers: SvixHeaders, secret: string): boolean {
  if (!secret) return false;
  const cleaned = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let key: Buffer;
  try { key = Buffer.from(cleaned, "base64"); }
  catch { return false; }
  if (key.length === 0) return false;

  // Replay protection
  const tsNum = Number(headers.timestamp);
  if (!Number.isFinite(tsNum)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - tsNum);
  if (ageSec > TOLERANCE_SECONDS) return false;

  const payload = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", key).update(payload).digest();

  for (const part of headers.signature.split(" ")) {
    const [version, b64] = part.split(",");
    if (version !== "v1" || !b64) continue;
    let provided: Buffer;
    try { provided = Buffer.from(b64, "base64"); } catch { continue; }
    if (provided.length === expected.length && crypto.timingSafeEqual(provided, expected)) {
      return true;
    }
  }
  return false;
}

// ─── Event processing ────────────────────────────────────────────────────────

interface ResendEvent {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[] | string;
    subject?: string;
    // Bounce sub-shape (varies by event type)
    bounce?: { message?: string; subType?: string; type?: "Permanent" | "Transient" | "Undetermined" };
    // Complaint sub-shape
    complaint?: { type?: string };
  };
}

async function patchLog(messageId: string | undefined, patch: Record<string, any>): Promise<void> {
  if (!messageId) return;
  try {
    await db.update(emailApiLogs).set(patch).where(eq(emailApiLogs.messageId, messageId));
  } catch (e: any) {
    console.warn("[resend-webhook] Could not patch email_api_logs:", e?.message || e);
  }
}

function recipientsOf(d: ResendEvent["data"]): string[] {
  if (!d?.to) return [];
  return Array.isArray(d.to) ? d.to : [d.to];
}

export async function handleResendEvent(evt: ResendEvent): Promise<{ ok: true; type: string; processed: number }> {
  const type = evt.type || "unknown";
  const messageId = evt.data?.email_id;
  let processed = 0;

  switch (type) {
    case "email.delivered": {
      await patchLog(messageId, { status: "delivered", deliveredAt: new Date() });
      processed = 1;
      break;
    }
    case "email.bounced": {
      const b = evt.data?.bounce || {};
      const isPermanent = b.type === "Permanent";
      await patchLog(messageId, {
        status: "bounced",
        bouncedAt: new Date(),
        bounceType: b.type,
        bounceSubType: b.subType,
        error: b.message || `${b.type || "Bounce"}/${b.subType || ""}`,
      });
      for (const r of recipientsOf(evt.data)) {
        processed++;
        if (isPermanent) {
          await addSuppression({
            email: r,
            reason: "hard_bounce",
            bounceType: b.type,
            bounceSubType: b.subType,
            diagnosticCode: b.message,
            source: "ses", // schema column accepts "ses" | "manual"; we reuse "ses" to mean "provider-reported"
            notes: "Reported by Resend",
          });
          console.log(`[resend-webhook] Hard bounce → suppressed ${r} (${b.subType || "Permanent"})`);
        } else {
          console.log(`[resend-webhook] Soft bounce for ${r} (${b.type}/${b.subType || ""}) — not suppressing`);
        }
      }
      break;
    }
    case "email.complained": {
      const ftype = evt.data?.complaint?.type;
      await patchLog(messageId, {
        status: "complained",
        complainedAt: new Date(),
        complaintFeedbackType: ftype,
      });
      for (const r of recipientsOf(evt.data)) {
        processed++;
        await addSuppression({
          email: r,
          reason: "complaint",
          complaintFeedbackType: ftype,
          source: "ses",
          notes: "Reported by Resend",
        });
        console.log(`[resend-webhook] Complaint → suppressed ${r} (${ftype || "unspecified"})`);
      }
      break;
    }
    case "email.delivery_delayed": {
      // Don't suppress — Resend will retry. Just note it.
      console.log(`[resend-webhook] Delivery delayed for message ${messageId}`);
      processed = 1;
      break;
    }
    case "email.sent":
    case "email.opened":
    case "email.clicked": {
      // Acknowledged but not stored individually — the row already has
      // status:"sent" from our send-time insert.
      processed = 1;
      break;
    }
    default:
      console.warn(`[resend-webhook] Unknown event type: ${type}`);
  }

  return { ok: true, type, processed };
}
