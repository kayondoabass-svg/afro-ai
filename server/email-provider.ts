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
  idempotencyKey?: string;
}

export class EmailProviderError extends Error {
  constructor(public code: string, public uncertain: boolean, message: string) { super(message); }
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
    maxAttempts: 1,
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

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey ? {"Idempotency-Key":input.idempotencyKey} : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new EmailProviderError("EMAIL_OUTCOME_UNKNOWN",true,"The provider response could not be confirmed. Do not submit a new request; check this request's status.");
  }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Resend errors come back as { name, message, statusCode }
    const code = res.status===401 ? "EMAIL_PROVIDER_AUTH" : res.status===429 ? "EMAIL_PROVIDER_LIMIT"
      : res.status===403 ? "EMAIL_PROVIDER_PERMISSION" : res.status>=500 ? "EMAIL_PROVIDER_UNAVAILABLE" : "EMAIL_PROVIDER_REJECTED";
    throw new EmailProviderError(code,res.status>=500,
      res.status===401 ? "The platform email provider credential is invalid. Contact support; replacing your project key will not fix this."
        : res.status===429 ? "The email provider has reached a rate or sending limit. No automatic retry was made."
        : res.status===403 ? "The email provider did not authorize this sender. Check sending-domain verification or contact support."
        : "The email provider could not confirm this message. Check the request status before sending again.");
  }
  if (!data?.id) throw new EmailProviderError("EMAIL_OUTCOME_UNKNOWN",true,"Provider acceptance could not be confirmed. Do not send a new request.");
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
  let result;
  try {
    result = await sesClient().send(cmd, {abortSignal:AbortSignal.timeout(15_000)});
  } catch(error: any) {
    const status=error?.$metadata?.httpStatusCode;
    throw new EmailProviderError("EMAIL_PROVIDER_UNAVAILABLE",!status || status>=500,
      "The email provider could not complete the request. Check request status before trying again.");
  }
  return { messageId: result.MessageId || "", provider: "ses" };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = activeEmailProvider();
  if (provider === "resend") return sendViaResend(input);
  return sendViaSes(input);
}
