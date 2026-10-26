/**
 * One-shot: email every existing Postgres user who has no password_hash a
 * one-time "set your password" link, so they can finish the migration onto
 * the new Cloudflare Worker auth system.
 *
 * For each candidate we:
 *   1. Ask the Worker to mint a single-use reset token (POST /cf-auth/admin/mint-reset-token),
 *      which returns the canonical reset URL.
 *   2. Send the "set_password" email through the Express SES bridge
 *      (server/mailer.ts → AWS SES) — same provider as every other
 *      transactional email in the platform.
 *
 * Usage:
 *   tsx scripts/blast-set-password.ts --dry-run         # print what we'd send
 *   tsx scripts/blast-set-password.ts --apply           # actually send
 *   tsx scripts/blast-set-password.ts --apply --limit 50
 *
 * Required env:
 *   INTERNAL_EMAIL_SECRET   shared secret (also set on the Worker)
 *   WORKER_BASE_URL         e.g. https://afroaigroup.com  (defaults to APP_URL)
 *   AWS_REGION + AWS creds  for SES (already configured in Express runtime)
 *   EMAIL_API_DEMO_FROM     verified SES sender (already configured)
 */
import { db } from "../server/db";
import { users } from "@shared/models/auth";
import { sql } from "drizzle-orm";
import { sendSetPasswordEmail } from "../server/mailer";

interface MintResponse {
  ok?: boolean;
  resetUrl?: string;
  name?: string;
  message?: string;
}

async function mintToken(workerBase: string, secret: string, email: string): Promise<MintResponse> {
  const res = await fetch(`${workerBase}/cf-auth/admin/mint-reset-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
  const json = (await res.json().catch(() => ({}))) as MintResponse;
  if (!res.ok) {
    return { ok: false, message: json.message || `HTTP ${res.status}` };
  }
  return json;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const limitArg = process.argv.find((a) => a.startsWith("--limit"));
  const limit = limitArg ? parseInt(limitArg.split("=")[1] || process.argv[process.argv.indexOf(limitArg) + 1] || "0", 10) : 0;

  const secret = process.env.INTERNAL_EMAIL_SECRET;
  if (!secret) {
    console.error("[blast] INTERNAL_EMAIL_SECRET is required");
    process.exit(1);
  }
  const workerBase =
    process.env.WORKER_BASE_URL ||
    process.env.APP_URL ||
    "https://afroaigroup.com";

  console.log(`[blast] mode: ${dryRun ? "DRY-RUN" : "APPLY"}  worker: ${workerBase}`);

  // Existing users with no password set yet (i.e. carried over from the old
  // Replit auth system and not yet migrated onto the email/password flow).
  const candidates = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
    })
    .from(users)
    .where(sql`${users.passwordHash} IS NULL AND ${users.email} IS NOT NULL`);

  const targets = limit > 0 ? candidates.slice(0, limit) : candidates;
  console.log(`[blast] candidates: ${candidates.length}  sending: ${targets.length}`);

  let ok = 0;
  let mintFail = 0;
  let sendFail = 0;

  for (const u of targets) {
    const email = (u.email || "").trim().toLowerCase();
    if (!email) continue;

    if (dryRun) {
      console.log(`[blast] DRY would mint+send to ${email}`);
      ok++;
      continue;
    }

    const minted = await mintToken(workerBase, secret, email);
    if (!minted.ok || !minted.resetUrl) {
      mintFail++;
      console.warn(`[blast] mint failed for ${email}: ${minted.message || "unknown"}`);
      continue;
    }

    const sent = await sendSetPasswordEmail(email, {
      name: minted.name || u.firstName || "",
      resetUrl: minted.resetUrl,
    });
    if (sent) {
      ok++;
      console.log(`[blast] sent → ${email}`);
    } else {
      sendFail++;
      console.warn(`[blast] send failed → ${email}`);
    }

    // Polite pacing — SES sandbox/limits, Worker DB writes.
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`[blast] done. ok=${ok}  mintFail=${mintFail}  sendFail=${sendFail}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[blast] fatal:", e);
    process.exit(1);
  });
