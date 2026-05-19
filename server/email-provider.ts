import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Unified email sender. Picks Resend or AWS SES based on env so we can switch
// providers in one place. While AWS SES is in production-access review we
// route everything through Resend (afroaigroup.com is already verified there).
//
// EMAIL_PROVIDER explicitly forces a provider ("resend" | "ses"). When unset,
// Resend is used if RESEND_API_KEY is configured; otherwise we fall back to
// SES. SES credentials read from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
// AWS_REGION as before.

export type EmailProvider = "resend" | "ses";

export interface SendEmailInput {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  messageId: string;
  provider: EmailProvider;
}

export function activeEmailProvider(): EmailProvider {
  const forced = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  if (forced === "resend" || forced === "ses") return forced;
  return process.env.RESEND_API_KEY ? "resend" : "ses";
}

let _sesClient: SESClient | null = null;
function sesClient(): SESClient {
  if (_sesClient) return _sesClient;
  _sesClient = new SESClient({
    region: (process.env.AWS_REGION || "us-east-1").toLowerCase(),
    ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    } : {}),
  });
  return _sesClient;
}

async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const body: Record<string, unknown> = {
    from: input.from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
  };
  if (input.html) body.html = input.html;
  if (input.text) body.text = input.text;
  if (input.replyTo) body.reply_to = input.replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Resend errors come back as { name, message, statusCode }
    const msg = data?.message || data?.error || `Resend HTTP ${res.status}`;
    throw new Error(`Resend send failed: ${msg}`);
  }
  return { messageId: data?.id || "", provider: "resend" };
}

async function sendViaSes(input: SendEmailInput): Promise<SendEmailResult> {
  const configSet = process.env.SES_CONFIGURATION_SET;
  const cmd = new SendEmailCommand({
    Source: input.from,
    Destination: { ToAddresses: Array.isArray(input.to) ? input.to : [input.to] },
    Message: {
      Subject: { Data: input.subject, Charset: "UTF-8" },
      Body: input.html
        ? { Html: { Data: input.html, Charset: "UTF-8" }, ...(input.text ? { Text: { Data: input.text, Charset: "UTF-8" } } : {}) }
        : { Text: { Data: input.text || "", Charset: "UTF-8" } },
    },
    ...(input.replyTo ? { ReplyToAddresses: [input.replyTo] } : {}),
    ...(configSet ? { ConfigurationSetName: configSet } : {}),
  });
  const result = await sesClient().send(cmd);
  return { messageId: result.MessageId || "", provider: "ses" };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = activeEmailProvider();
  if (provider === "resend") return sendViaResend(input);
  return sendViaSes(input);
}
