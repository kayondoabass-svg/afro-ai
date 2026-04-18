import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
});

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
  try {
    await sesClient.send(new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: text, Charset: "UTF-8" },
        },
      },
    }));
    console.log(`[mailer] Sent "${subject}" to ${to}`);
    return true;
  } catch (e: any) {
    console.error(`[mailer] Failed to send "${subject}" to ${to}:`, e?.message || e);
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
