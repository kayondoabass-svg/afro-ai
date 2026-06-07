import { isSuppressed } from "./ses-webhook";
import { sendEmail, activeEmailProvider } from "./email-provider";

const FROM = process.env.EMAIL_API_DEMO_FROM || "noreply@afroaigroup.com";
const PLATFORM = "Afro AI";
const BRAND_COLOR = "#f5b400";

function shell(title: string, bodyHtml: string, bodyText: string) {
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0b0b0c;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;color:#fff;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:22px;font-weight:700;color:${BRAND_COLOR};">${PLATFORM}</span>
    </div>
    <div style="background:#18181b;border:1px solid #27272a;border-radius:14px;padding:28px;">
      <h2 style="margin:0 0 16px;color:#fff;font-size:20px;">${title}</h2>
      <div style="line-height:1.65;color:#e5e5e5;font-size:15px;">${bodyHtml}</div>
    </div>
    <p style="text-align:center;font-size:12px;color:#71717a;margin-top:18px;">Sent by ${PLATFORM} · KEYO TECHNOLOGIES · <a href="https://afroaigroup.com" style="color:${BRAND_COLOR};text-decoration:none;">afroaigroup.com</a></p>
  </div></body></html>`;
  const text = `${PLATFORM}\n\n${title}\n\n${bodyText}\n\n— Afro AI · KEYO TECHNOLOGIES · https://afroaigroup.com`;
  return { html, text };
}

async function send(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;
  if (!FROM) {
    console.warn("[mailer] EMAIL_API_DEMO_FROM not set — skipping send to", to);
    return false;
  }
  // Honor the suppression list — never email an address that hard-bounced or complained.
  if (await isSuppressed(to)) {
    console.warn(`[mailer] Skipped "${subject}" to ${to} — recipient is on suppression list`);
    return false;
  }
  try {
    const result = await sendEmail({ from: FROM, to, subject, html, text });
    console.log(`[mailer] Sent "${subject}" to ${to} via ${result.provider} (${result.messageId})`);
    return true;
  } catch (e: any) {
    console.error(`[mailer] Failed to send "${subject}" to ${to} via ${activeEmailProvider()}:`, e?.message || e);
    return false;
  }
}

// ─────────── Templates ───────────

export async function sendReceiptEmail(to: string, opts: {
  customerName: string; plan: string; amount: string; currency: string; method: string; confirmationCode: string; merchantRef: string; date: string;
}): Promise<boolean> {
  const subject = `Receipt — ${opts.plan} · ${opts.currency} ${opts.amount}`;
  const row = (k: string, v: string) => `<tr><td style="padding:8px 0;color:#a1a1aa;font-size:13px;">${k}</td><td style="padding:8px 0;color:#fff;font-size:13px;text-align:right;font-family:ui-monospace,monospace;">${v}</td></tr>`;
  const html = `
    <p>Hi ${opts.customerName || "there"},</p>
    <p>Thanks for your payment to ${PLATFORM}. Your subscription / credits are now active. Here's your receipt:</p>
    <table style="width:100%;border-collapse:collapse;margin:18px 0;border-top:1px solid #27272a;">
      ${row("Plan", opts.plan)}
      ${row("Amount", `${opts.currency} ${opts.amount}`)}
      ${row("Payment method", opts.method || "—")}
      ${row("Confirmation code", opts.confirmationCode || "—")}
      ${row("Reference", opts.merchantRef)}
      ${row("Date", opts.date)}
    </table>
    <p style="margin-top:18px;"><a href="https://afroaigroup.com/billing" style="background:${BRAND_COLOR};color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">View in your account →</a></p>`;
  const text = `Receipt for ${opts.plan}\nAmount: ${opts.currency} ${opts.amount}\nMethod: ${opts.method}\nConfirmation: ${opts.confirmationCode}\nRef: ${opts.merchantRef}\nDate: ${opts.date}\n\nView in your account: https://afroaigroup.com/billing`;
  const wrapped = shell("Payment received ✓", html, text);
  return send(to, subject, wrapped.html, wrapped.text);
}

export async function sendPaymentCongratsEmail(to: string, opts: {
  customerName: string; plan: string; amount: string; currency: string;
}): Promise<boolean> {
  const name = opts.customerName || "valued customer";
  const subject = `Your ${opts.plan} plan is now active`;
  const html = `
    <p>Dear ${name},</p>
    <p>We are pleased to confirm that your payment has been received successfully and your <strong>${opts.plan}</strong> plan is now active.</p>
    <table style="width:100%;border-collapse:collapse;margin:18px 0;border-top:1px solid #27272a;">
      <tr><td style="padding:8px 0;color:#a1a1aa;font-size:13px;">Plan</td><td style="padding:8px 0;color:#fff;font-size:13px;text-align:right;">${opts.plan}</td></tr>
      <tr><td style="padding:8px 0;color:#a1a1aa;font-size:13px;border-top:1px solid #27272a;">Amount paid</td><td style="padding:8px 0;color:#fff;font-size:13px;text-align:right;border-top:1px solid #27272a;">${opts.currency} ${opts.amount}</td></tr>
    </table>
    <p>You now have full access to every feature included in your plan. We encourage you to sign in to your account to get started right away.</p>
    <p style="margin-top:18px;"><a href="https://afroaigroup.com/dashboard" style="background:${BRAND_COLOR};color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Go to your dashboard →</a></p>
    <p style="margin-top:18px;">Thank you for choosing ${PLATFORM}. We look forward to supporting your work.</p>
    <p>Kind regards,<br/>The ${PLATFORM} Team</p>`;
  const text = `Dear ${name},\n\nWe are pleased to confirm that your payment has been received and your ${opts.plan} plan is now active.\n\nPlan: ${opts.plan}\nAmount paid: ${opts.currency} ${opts.amount}\n\nSign in to your dashboard: https://afroaigroup.com/dashboard\n\nThank you for choosing ${PLATFORM}.\n\nKind regards,\nThe ${PLATFORM} Team`;
  const wrapped = shell("Payment confirmed", html, text);
  return send(to, subject, wrapped.html, wrapped.text);
}

export async function sendPaymentNudgeEmail(to: string, opts: {
  customerName: string; plan: string; amount: string; currency: string;
}): Promise<boolean> {
  const name = opts.customerName || "valued customer";
  const subject = `Completing your ${opts.plan} subscription`;
  const html = `
    <p>Dear ${name},</p>
    <p>We noticed that your recent attempt to subscribe to the <strong>${opts.plan}</strong> plan (${opts.currency} ${opts.amount}) was not completed.</p>
    <p>If you experienced any difficulty, the most common causes and their quick resolutions are listed below:</p>
    <ul style="padding-left:18px;margin:14px 0;color:#d4d4d8;">
      <li style="margin-bottom:8px;"><strong>Insufficient balance</strong> — please ensure your Mobile Money or card account holds sufficient funds.</li>
      <li style="margin-bottom:8px;"><strong>Incorrect PIN</strong> — re-enter your Mobile Money PIN carefully when prompted.</li>
      <li style="margin-bottom:8px;"><strong>Network timeout</strong> — allow a brief moment and try again on a stable connection.</li>
    </ul>
    <p>You may resume your subscription at any time using the button below. Your selection has been saved for your convenience.</p>
    <p style="margin-top:18px;"><a href="https://afroaigroup.com/billing" style="background:${BRAND_COLOR};color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Complete your payment →</a></p>
    <p style="margin-top:18px;">Should you require any assistance, please reply to this email and our team will be glad to help.</p>
    <p>Kind regards,<br/>The ${PLATFORM} Team</p>`;
  const text = `Dear ${name},\n\nWe noticed that your recent attempt to subscribe to the ${opts.plan} plan (${opts.currency} ${opts.amount}) was not completed.\n\nCommon causes and resolutions:\n- Insufficient balance: ensure your account holds sufficient funds.\n- Incorrect PIN: re-enter your Mobile Money PIN carefully.\n- Network timeout: try again on a stable connection.\n\nComplete your payment: https://afroaigroup.com/billing\n\nShould you require assistance, simply reply to this email.\n\nKind regards,\nThe ${PLATFORM} Team`;
  const wrapped = shell("Complete your subscription", html, text);
  return send(to, subject, wrapped.html, wrapped.text);
}

export async function sendAppPublishedEmail(to: string, opts: { title: string; url: string; isUpdate: boolean }): Promise<boolean> {
  const verb = opts.isUpdate ? "Updated" : "Published";
  const subject = `${verb}: ${opts.title} is live`;
  const html = `
    <p>Your app <strong>${opts.title}</strong> is live and ready to share.</p>
    <p style="background:#0b0b0c;border:1px solid #27272a;border-radius:8px;padding:14px;font-family:ui-monospace,monospace;font-size:13px;color:${BRAND_COLOR};word-break:break-all;">${opts.url}</p>
    <p style="margin-top:18px;">
      <a href="${opts.url}" style="background:${BRAND_COLOR};color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:8px;">Visit live app →</a>
      <a href="https://afroaigroup.com/apps" style="color:${BRAND_COLOR};text-decoration:none;font-weight:500;">Manage apps</a>
    </p>
    <p style="font-size:13px;color:#a1a1aa;margin-top:18px;">Tip: connect a custom domain from your dashboard to use your own URL instead.</p>`;
  const text = `Your app "${opts.title}" is live at ${opts.url}\n\nManage your apps: https://afroaigroup.com/apps`;
  const wrapped = shell(`${verb} ${opts.isUpdate ? "" : "✨"}`, html, text);
  return send(to, subject, wrapped.html, wrapped.text);
}

export async function sendLowBalanceEmail(to: string, opts: { balanceCents: number; remainingGenerations: number }): Promise<boolean> {
  const subject = `Heads up: only ${opts.remainingGenerations} generations left`;
  const html = `
    <p>Your Pay-As-You-Go credit is running low.</p>
    <p style="background:#0b0b0c;border:1px solid #27272a;border-radius:8px;padding:14px;text-align:center;">
      <span style="font-size:28px;font-weight:700;color:${BRAND_COLOR};">$${(opts.balanceCents/100).toFixed(2)}</span><br>
      <span style="color:#a1a1aa;font-size:13px;">≈ ${opts.remainingGenerations} more AI generations</span>
    </p>
    <p>Top up now to avoid interruptions. Packs start at $5.</p>
    <p style="margin-top:18px;"><a href="https://afroaigroup.com/pricing" style="background:${BRAND_COLOR};color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Buy more credits →</a></p>`;
  const text = `Low balance alert: $${(opts.balanceCents/100).toFixed(2)} (~${opts.remainingGenerations} generations left). Top up at https://afroaigroup.com/pricing`;
  const wrapped = shell("Credits running low ⚠️", html, text);
  return send(to, subject, wrapped.html, wrapped.text);
}

export async function sendDepletedEmail(to: string): Promise<boolean> {
  const subject = "Your AI credits are used up";
  const html = `
    <p>Your Pay-As-You-Go balance has reached <strong>$0.00</strong>. AI generations are now paused on your account.</p>
    <p>Top up in 30 seconds to keep building:</p>
    <p style="margin-top:18px;"><a href="https://afroaigroup.com/pricing" style="background:${BRAND_COLOR};color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Add credits →</a></p>
    <p style="font-size:13px;color:#a1a1aa;margin-top:18px;">Or upgrade to a monthly plan for predictable pricing — no top-ups needed.</p>`;
  const text = `Your Afro AI credits are used up. Top up at https://afroaigroup.com/pricing`;
  const wrapped = shell("Out of credits", html, text);
  return send(to, subject, wrapped.html, wrapped.text);
}

export async function sendQuotaReachedEmail(to: string, opts: {
  name?: string;
  kind: "chat" | "image" | "audio" | "video";
  used: number;
  limit: number;
  plan: string;
  resetHours: number;
}): Promise<boolean> {
  const kindLabel: Record<string, string> = {
    chat: "messages", image: "image generations", audio: "voice messages", video: "video clips",
  };
  const label = kindLabel[opts.kind] || opts.kind;
  const subject = `You've reached today's Afro AI ${label} limit`;
  const html = `
    <p>Hi ${opts.name || "there"},</p>
    <p>You've used all <strong>${opts.limit}</strong> daily ${label} on your <strong>${opts.plan}</strong> plan today. Your project is saved — pick up exactly where you left off.</p>
    <p style="margin:24px 0;text-align:center;">
      <a href="https://afroaigroup.com/pricing" style="background:${BRAND_COLOR};color:#000;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin:4px;">Upgrade plan →</a>
      <a href="https://afroaigroup.com/pricing#payg" style="background:#27272a;color:#fff;border:1px solid #3f3f46;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin:4px;">Buy credits</a>
    </p>
    <p style="font-size:13px;color:#a1a1aa;">Or wait — your free limit resets in about <strong>${opts.resetHours} hour${opts.resetHours === 1 ? "" : "s"}</strong> (midnight UTC).</p>
    <p style="font-size:12px;color:#71717a;margin-top:18px;">You'll only get this email once per day, even if you hit the limit again.</p>`;
  const text = `Hi ${opts.name || "there"},\n\nYou've used your ${opts.limit} daily ${label} on Afro AI today (${opts.plan} plan).\n\nUpgrade or buy credits: https://afroaigroup.com/pricing\nOr wait — resets in ~${opts.resetHours} hour(s).`;
  const wrapped = shell("Daily limit reached", html, text);
  return send(to, subject, wrapped.html, wrapped.text);
}

export async function sendChatbotLimitEmail(to: string, opts: { plan: string; limit: number }): Promise<boolean> {
  const subject = "Your chatbot has hit its monthly reply limit";
  const html = `
    <p>Your Afro AI chatbot has reached its monthly reply quota of <strong>${opts.limit.toLocaleString()}</strong> messages on the <strong>${opts.plan}</strong> plan.</p>
    <p>It will continue to load on your visitors' sites, but it can't reply to new questions until you upgrade or the next billing cycle starts.</p>
    <p style="margin-top:18px;"><a href="https://afroaigroup.com/chatbot-api" style="background:${BRAND_COLOR};color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Upgrade chatbot plan →</a></p>`;
  const text = `Your chatbot hit its ${opts.limit.toLocaleString()}-reply monthly limit (${opts.plan}). Upgrade at https://afroaigroup.com/chatbot-api`;
  const wrapped = shell("Chatbot limit reached", html, text);
  return send(to, subject, wrapped.html, wrapped.text);
}

export async function sendPasswordResetEmail(to: string, opts: { name: string; resetUrl: string }): Promise<boolean> {
  const subject = "Reset your Afro AI password";
  const html = `
    <p>Hi ${opts.name || "there"},</p>
    <p>We got a request to reset the password on your Afro AI account. Tap the button below to set a new one. The link works for the next <strong>60 minutes</strong> and can only be used once.</p>
    <p style="margin:24px 0;text-align:center;"><a href="${opts.resetUrl}" style="background:${BRAND_COLOR};color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Reset my password →</a></p>
    <p style="font-size:13px;color:#a1a1aa;">If the button doesn't work, copy this link into your browser:<br/><span style="word-break:break-all;color:${BRAND_COLOR};">${opts.resetUrl}</span></p>
    <p style="font-size:13px;color:#a1a1aa;margin-top:18px;">Didn't ask to reset your password? You can safely ignore this email — your account stays the same.</p>`;
  const text = `Hi ${opts.name || "there"},\n\nReset your Afro AI password using this link (works for 60 minutes):\n${opts.resetUrl}\n\nIf you didn't ask for this, just ignore the email.`;
  const wrapped = shell("Reset your password", html, text);
  return send(to, subject, wrapped.html, wrapped.text);
}

export async function sendSetPasswordEmail(to: string, opts: { name: string; resetUrl: string }): Promise<boolean> {
  const subject = "Set your Afro AI password";
  const html = `
    <p>Hi ${opts.name || "there"},</p>
    <p>We've upgraded the way you sign in to Afro AI. Your existing account is still here — just choose a password to keep using it. Tap the button below to set one. The link works for the next <strong>60 minutes</strong> and can only be used once.</p>
    <p style="margin:24px 0;text-align:center;"><a href="${opts.resetUrl}" style="background:${BRAND_COLOR};color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Set my password →</a></p>
    <p style="font-size:13px;color:#a1a1aa;">If the button doesn't work, copy this link into your browser:<br/><span style="word-break:break-all;color:${BRAND_COLOR};">${opts.resetUrl}</span></p>
    <p style="font-size:13px;color:#a1a1aa;margin-top:18px;">If you don't recognise this account, you can safely ignore this email.</p>`;
  const text = `Hi ${opts.name || "there"},\n\nSet your Afro AI password using this one-time link (works for 60 minutes):\n${opts.resetUrl}\n\nIf you don't recognise this account, just ignore the email.`;
  const wrapped = shell("Set your password", html, text);
  return send(to, subject, wrapped.html, wrapped.text);
}

export async function sendEmailVerification(to: string, opts: { name: string; verifyUrl: string }): Promise<boolean> {
  const subject = "Confirm your email to finish setting up Afro AI";
  const html = `
    <p>Hi ${opts.name || "there"},</p>
    <p>Welcome to Afro AI! To finish setting up your account, please confirm this is your email address. Just tap the button below — the link works for the next <strong>24 hours</strong>.</p>
    <p style="margin:24px 0;text-align:center;"><a href="${opts.verifyUrl}" style="background:${BRAND_COLOR};color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Confirm my email →</a></p>
    <p style="font-size:13px;color:#a1a1aa;">If the button doesn't work, copy this link into your browser:<br/><span style="word-break:break-all;color:${BRAND_COLOR};">${opts.verifyUrl}</span></p>
    <p style="font-size:13px;color:#a1a1aa;margin-top:18px;">If you didn't sign up for Afro AI, you can safely ignore this email — no account will be activated.</p>`;
  const text = `Hi ${opts.name || "there"},\n\nConfirm your Afro AI email using this link (works for 24 hours):\n${opts.verifyUrl}\n\nIf you didn't sign up, just ignore this email.`;
  const wrapped = shell("Confirm your email", html, text);
  return send(to, subject, wrapped.html, wrapped.text);
}

export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  const subject = "Welcome to Afro AI 🎉";
  const html = `
    <p>Hi ${name || "there"},</p>
    <p>Welcome to Afro AI — you're all set up. Here's what you can do right now:</p>
    <ul style="line-height:1.9;color:#e5e5e5;padding-left:20px;">
      <li><strong>Build apps</strong> — describe what you want, no code needed</li>
      <li><strong>Add a chatbot</strong> to any website in 60 seconds</li>
      <li><strong>Send emails</strong> via our API</li>
      <li><strong>Audit your domain</strong> for spam-folder issues</li>
    </ul>
    <p style="margin-top:18px;"><a href="https://afroaigroup.com/dashboard" style="background:${BRAND_COLOR};color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Open dashboard →</a></p>`;
  const text = `Welcome to Afro AI! Open your dashboard at https://afroaigroup.com/dashboard`;
  const wrapped = shell("Welcome to Afro AI", html, text);
  return send(to, subject, wrapped.html, wrapped.text);
}
