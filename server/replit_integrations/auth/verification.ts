import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { users, emailVerificationTokens } from "@shared/models/auth";
import { sendEmailVerification, sendWelcomeEmail } from "../../mailer";

export async function sendVerificationEmailFor(
  userId: string, email: string, name: string, origin: string, automatic = false,
): Promise<"sent" | "throttled" | "alreadyVerified"> {
  // A database row lock serializes requests across processes, not just one Node instance.
  const result = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!user || user.email !== email) throw new Error("Account email changed. Refresh and try again.");
    if (user.emailVerified) return { status: "alreadyVerified" as const };
    const [latest] = await tx.select().from(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.userId, userId), eq(emailVerificationTokens.email, email)))
      .orderBy(desc(emailVerificationTokens.createdAt)).limit(1);
    if (latest && (automatic || (latest.createdAt && Date.now() - latest.createdAt.getTime() < 60_000))) {
      return { status: "throttled" as const };
    }
    const raw = crypto.randomBytes(32).toString("base64url");
    await tx.insert(emailVerificationTokens).values({
      tokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
      userId, email, createdAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000),
    });
    return { status: "send" as const, raw };
  });
  if (result.status !== "send") return result.status;
  const verifyUrl = new URL("/api/auth/verify-email", origin);
  verifyUrl.searchParams.set("token", result.raw);
  const sent = await sendEmailVerification(email, { name, verifyUrl: verifyUrl.toString() });
  // Keep the claim after failures: ambiguous provider errors must not cause an email flood.
  if (!sent) throw new Error("Verification email delivery failed. Please wait a minute and try again.");
  return "sent";
}

export async function verifyEmailToken(token: string): Promise<string> {
  if (!token) return "missing";
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash)).for("update");
    if (!row) return { status: "invalid" };
    const [user] = await tx.select().from(users).where(eq(users.id, row.userId)).for("update");
    if (!user || user.email !== row.email) return { status: "invalid" };
    if (row.usedAt) return { status: user.emailVerified ? "used" : "invalid" };
    if (row.expiresAt <= new Date()) return { status: "expired" };
    await tx.update(emailVerificationTokens).set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.tokenHash, tokenHash));
    if (user.emailVerified) return { status: "used" };
    await tx.update(users).set({ emailVerified: new Date(), updatedAt: new Date() })
      .where(eq(users.id, row.userId));
    return { status: "ok", user };
  });
  if (result.user?.email) {
    await sendWelcomeEmail(result.user.email, result.user.firstName || result.user.email.split("@")[0])
      .catch(() => false);
  }
  return result.status;
}