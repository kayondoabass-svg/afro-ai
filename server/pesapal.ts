const PESAPAL_API_BASE = process.env.PESAPAL_ENV === "production"
  ? "https://pay.pesapal.com/v3"
  : "https://cybqa.pesapal.com/pesapalv3";

const CONSUMER_KEY = process.env.PESAPAL_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;

interface PesapalAuthResponse {
  token: string;
  expiryDate: string;
  error: string | null;
  status: string;
  message: string;
}

interface PesapalOrderRequest {
  id: string;
  currency: string;
  amount: number;
  description: string;
  callback_url: string;
  notification_id: string;
  billing_address: {
    email_address: string;
    phone_number?: string;
    country_code?: string;
    first_name?: string;
    last_name?: string;
  };
}

interface PesapalOrderResponse {
  order_tracking_id: string;
  merchant_reference: string;
  redirect_url: string;
  error: string | null;
  status: string;
}

interface PesapalTransactionStatus {
  payment_method: string;
  amount: number;
  created_date: string;
  confirmation_code: string;
  payment_status_description: string;
  description: string;
  message: string;
  payment_account: string;
  call_back_url: string;
  status_code: number;
  merchant_reference: string;
  currency: string;
  error: { error_type: string; code: string; message: string } | null;
  status: string;
}

interface PesapalIpnRegistration {
  url: string;
  ipn_id: string;
  error: string | null;
  status: string;
}

let cachedToken: string | null = null;
let tokenExpiry: Date | null = null;

export async function getAuthToken(): Promise<string> {
  if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
    return cachedToken;
  }

  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    throw new Error("Pesapal credentials not configured. Set PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET environment variables.");
  }

  const res = await fetch(`${PESAPAL_API_BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      consumer_key: CONSUMER_KEY,
      consumer_secret: CONSUMER_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`Pesapal auth failed with status ${res.status}`);
  }

  const data = (await res.json()) as PesapalAuthResponse;

  if (data.error) {
    throw new Error(`Pesapal auth error: ${data.error}`);
  }

  cachedToken = data.token;
  tokenExpiry = new Date(data.expiryDate);

  return data.token;
}

export async function registerIpnUrl(ipnUrl: string): Promise<string> {
  const token = await getAuthToken();

  const res = await fetch(`${PESAPAL_API_BASE}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: ipnUrl,
      ipn_notification_type: "GET",
    }),
  });

  const rawText = await res.text();
  console.log(`[Pesapal] registerIPN status=${res.status} body=${rawText}`);

  if (!res.ok) {
    throw new Error(`Pesapal IPN registration failed with status ${res.status}: ${rawText}`);
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Pesapal IPN returned invalid JSON: ${rawText}`);
  }

  if (data.error) {
    const errMsg = typeof data.error === "object" ? JSON.stringify(data.error) : String(data.error);
    throw new Error(`Pesapal IPN registration error: ${errMsg}`);
  }

  return data.ipn_id;
}

export async function submitOrder(order: PesapalOrderRequest): Promise<PesapalOrderResponse> {
  const token = await getAuthToken();

  const res = await fetch(`${PESAPAL_API_BASE}/api/Transactions/SubmitOrderRequest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(order),
  });

  const rawText = await res.text();
  console.log(`[Pesapal] submitOrder status=${res.status} body=${rawText}`);

  if (!res.ok) {
    throw new Error(`Pesapal order submission failed with status ${res.status}: ${rawText}`);
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Pesapal returned invalid JSON: ${rawText}`);
  }

  if (data.error) {
    const errMsg = typeof data.error === "object" ? JSON.stringify(data.error) : String(data.error);
    throw new Error(`Pesapal order error: ${errMsg}`);
  }

  if (!data.redirect_url) {
    throw new Error(`Pesapal order missing redirect_url. Response: ${rawText}`);
  }

  return data as PesapalOrderResponse;
}

export async function getTransactionStatus(orderTrackingId: string): Promise<PesapalTransactionStatus> {
  const token = await getAuthToken();

  const res = await fetch(
    `${PESAPAL_API_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Pesapal status check failed with status ${res.status}`);
  }

  const data = (await res.json()) as PesapalTransactionStatus;

  if (data.error) {
    throw new Error(`Pesapal status error: ${JSON.stringify(data.error)}`);
  }

  return data;
}

export function isPaymentComplete(status: PesapalTransactionStatus): boolean {
  return status.status_code === 1;
}

export function isPaymentFailed(status: PesapalTransactionStatus): boolean {
  return status.status_code === 2 || status.status_code === 3;
}
