type MailContext = {
  tenantId: string;
  userId: string;
  purpose: "verify" | "reset";
  attemptId: string;
};

function record(context: MailContext, fields: Record<string, unknown>) {
  // Never log recipients, message bodies, credentials or confirmation/reset tokens.
  console.info(JSON.stringify({ event: "tenant_auth_mail", ...context, ...fields }));
}

function rejectionReason(status: number, data: any) {
  const message = String(data?.message || "").toLowerCase();
  if (status === 401) return "provider_authentication";
  if (message.includes("domain") && message.includes("not verified")) return "sender_domain_unverified";
  if (message.includes("testing emails") || message.includes("own email")) return "provider_testing_restriction";
  if (message.includes("daily") && message.includes("limit")) return "provider_daily_limit";
  if (message.includes("monthly") && message.includes("limit")) return "provider_monthly_limit";
  if (status === 429) return "provider_rate_limit";
  if (status === 403) return "provider_permission";
  if (status >= 500) return "provider_unavailable";
  return "provider_validation";
}

export async function sendTenantMail(
  env: { RESEND_API_KEY?: string; MAIL_FROM?: string },
  context: MailContext,
  tokenHash: string,
  message: { to: string; subject: string; text: string; html: string },
) {
  if (!env.RESEND_API_KEY) {
    record(context, { outcome: "unavailable", reason: "missing_provider_credential" });
    throw new Error("Email transport unavailable");
  }
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `tenant-auth/${tokenHash}`,
      },
      body: JSON.stringify({ from: env.MAIL_FROM || "Afro AI <noreply@afroaigroup.com>", ...message }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // An interrupted request may already have been accepted. Do not retry blindly.
    record(context, { outcome: "unknown", reason: "provider_transport_interrupted" });
    throw new Error("Email submission could not be confirmed");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    record(context, {
      outcome: "rejected",
      providerStatus: response.status,
      reason: rejectionReason(response.status, data),
      providerCode: typeof data?.name === "string" && /^[a-z_]{1,60}$/.test(data.name) ? data.name : null,
    });
    throw new Error("Email delivery failed");
  }
  const messageId = typeof data?.id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(data.id) ? data.id : null;
  record(context, { outcome: "accepted", providerStatus: response.status, messageId });
  // Provider acceptance is not inbox delivery. Delivery must be checked separately.
  return { sent: true, accepted: true, messageId };
}
