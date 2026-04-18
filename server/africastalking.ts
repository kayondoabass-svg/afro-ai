// Africa's Talking REST integration (no SDK — uses fetch)
// Docs: https://developers.africastalking.com/docs

const USERNAME = process.env.AFRICASTALKING_USERNAME || "";
const API_KEY = process.env.AFRICASTALKING_API_KEY || "";

// Sandbox uses sandbox.africastalking.com; live uses api.africastalking.com
const isSandbox = USERNAME === "sandbox";
const SMS_BASE = isSandbox
  ? "https://api.sandbox.africastalking.com/version1"
  : "https://api.africastalking.com/version1";
// Application API (used for fetching account balance) is on a different host
const APP_BASE = isSandbox
  ? "https://api.sandbox.africastalking.com/version1"
  : "https://api.africastalking.com/version1";

export function isAtConfigured(): boolean {
  return !!USERNAME && !!API_KEY;
}

export function atMode(): "sandbox" | "live" | "unconfigured" {
  if (!isAtConfigured()) return "unconfigured";
  return isSandbox ? "sandbox" : "live";
}

interface SmsRecipient {
  number: string;
  cost: string;
  status: string;
  statusCode: number;
  messageId: string;
}

interface SendSmsResponse {
  SMSMessageData: {
    Message: string;
    Recipients: SmsRecipient[];
  };
}

export async function sendSms(opts: {
  to: string | string[];
  message: string;
  from?: string; // sender ID / shortcode (optional, must be approved on AT)
}): Promise<SendSmsResponse> {
  if (!isAtConfigured()) throw new Error("Africa's Talking is not configured (missing username or API key)");

  const recipients = Array.isArray(opts.to) ? opts.to.join(",") : opts.to;
  const body = new URLSearchParams({
    username: USERNAME,
    to: recipients,
    message: opts.message,
  });
  if (opts.from) body.set("from", opts.from);

  const res = await fetch(`${SMS_BASE}/messaging`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      apiKey: API_KEY,
    },
    body: body.toString(),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Africa's Talking SMS API is temporarily unavailable (HTTP ${res.status}). Please retry in a moment.`);
  }
  if (!res.ok) {
    const cleanMsg = data?.SMSMessageData?.Message || `HTTP ${res.status}`;
    throw new Error(`Africa's Talking SMS failed: ${cleanMsg}`);
  }
  return data;
}

interface UserDataResponse {
  UserData: {
    balance: string; // e.g. "KES 1000.0000"
  };
}

export async function getAccountBalance(): Promise<{ balance: string; currency: string; amount: number }> {
  if (!isAtConfigured()) throw new Error("Africa's Talking is not configured");

  const res = await fetch(`${APP_BASE}/user?username=${encodeURIComponent(USERNAME)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      apiKey: API_KEY,
    },
  });

  const text = await res.text();
  let data: UserDataResponse;
  try {
    data = JSON.parse(text);
  } catch {
    // Upstream returned HTML (e.g. Cloudflare 5xx) — keep error message clean
    throw new Error(`Africa's Talking API is temporarily unavailable (HTTP ${res.status}). Please retry in a moment.`);
  }
  if (!res.ok) {
    throw new Error(`Africa's Talking returned an error (HTTP ${res.status}). Check your username and API key.`);
  }
  // Parse "KES 1,000.0000" or "USD -3.50" → currency + amount
  const raw = data.UserData?.balance || "";
  const match = raw.match(/^([A-Z]{3})\s+(-?[\d,]+(?:\.\d+)?)/);
  const numeric = match ? parseFloat(match[2].replace(/,/g, "")) : NaN;
  return {
    balance: raw,
    currency: match?.[1] || "USD",
    amount: Number.isFinite(numeric) ? numeric : 0,
  };
}
