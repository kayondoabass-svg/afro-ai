const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DOMAIN = "afroaigroup.com";

interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
}

interface CloudflareResponse<T> {
  success: boolean;
  errors: Array<{ message: string }>;
  result: T;
}

async function cfFetch<T>(path: string, options: RequestInit = {}): Promise<CloudflareResponse<T>> {
  if (!ZONE_ID || !API_TOKEN) {
    throw new Error("Cloudflare credentials not configured");
  }

  const res = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await res.json() as CloudflareResponse<T>;
  if (!data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(", ") || "Unknown Cloudflare error";
    throw new Error(`Cloudflare API error: ${errorMsg}`);
  }

  return data;
}

export async function createSubdomainRecord(subdomain: string): Promise<string> {
  const existing = await getSubdomainRecord(subdomain);
  if (existing) {
    if (!existing.proxied) {
      try {
        await cfFetch(`/zones/${ZONE_ID}/dns_records/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ proxied: true }),
        });
      } catch (err) {
        console.error("Failed to enable proxy on existing record:", err);
      }
    }
    return existing.id;
  }

  const data = await cfFetch<CloudflareDnsRecord>(`/zones/${ZONE_ID}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: "CNAME",
      name: `${subdomain}.${DOMAIN}`,
      content: DOMAIN,
      proxied: true,
      ttl: 1,
    }),
  });

  return data.result.id;
}

export async function getSubdomainRecord(subdomain: string): Promise<CloudflareDnsRecord | null> {
  const data = await cfFetch<CloudflareDnsRecord[]>(
    `/zones/${ZONE_ID}/dns_records?name=${subdomain}.${DOMAIN}&type=CNAME`
  );

  return data.result.length > 0 ? data.result[0] : null;
}

export async function deleteSubdomainRecord(recordId: string): Promise<void> {
  await cfFetch(`/zones/${ZONE_ID}/dns_records/${recordId}`, {
    method: "DELETE",
  });
}

export function isValidSubdomain(subdomain: string): { valid: boolean; error?: string } {
  if (!subdomain) return { valid: false, error: "Subdomain is required" };
  if (subdomain.length < 3) return { valid: false, error: "Subdomain must be at least 3 characters" };
  if (subdomain.length > 50) return { valid: false, error: "Subdomain must be 50 characters or less" };
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
    return { valid: false, error: "Subdomain can only contain lowercase letters, numbers, and hyphens" };
  }
  const reserved = ["www", "api", "app", "admin", "mail", "ftp", "dns", "ns1", "ns2", "test", "dev", "staging"];
  if (reserved.includes(subdomain)) {
    return { valid: false, error: "This subdomain is reserved" };
  }
  return { valid: true };
}

export function getPublishedUrl(subdomain: string): string {
  return `https://${subdomain}.${DOMAIN}`;
}

function getWorkerScript(): string {
  return [
    "addEventListener('fetch', event => {",
    "  event.respondWith(handleRequest(event.request))",
    "})",
    "",
    "async function handleRequest(request) {",
    "  const url = new URL(request.url)",
    "  const hostname = url.hostname",
    "  const domain = '" + DOMAIN + "'",
    "",
    "  if (!hostname.endsWith('.' + domain) || hostname === domain || hostname === 'www.' + domain) {",
    "    return fetch(request)",
    "  }",
    "",
    "  const subdomain = hostname.replace('.' + domain, '')",
    "  const originUrl = 'https://' + domain + '/site/' + subdomain",
    "",
    "  try {",
    "    const response = await fetch(originUrl, {",
    "      method: 'GET',",
    "      headers: { 'User-Agent': 'Cloudflare-Worker' },",
    "    })",
    "    const html = await response.text()",
    "    return new Response(html, {",
    "      status: response.status,",
    "      headers: {",
    "        'Content-Type': response.headers.get('Content-Type') || 'text/html',",
    "        'Cache-Control': 'public, max-age=300',",
    "      },",
    "    })",
    "  } catch (err) {",
    "    return new Response('Site temporarily unavailable', { status: 502 })",
    "  }",
    "}",
  ].join("\n");
}

export async function deploySubdomainWorker(): Promise<{ success: boolean; error?: string }> {
  if (!ZONE_ID || !API_TOKEN) {
    return { success: false, error: "Cloudflare credentials not configured" };
  }

  const WORKER_NAME = "afroai-subdomain-router";
  const workerScript = getWorkerScript();

  try {
    const zoneRes = await fetch("https://api.cloudflare.com/client/v4/zones/" + ZONE_ID, {
      headers: { "Authorization": "Bearer " + API_TOKEN },
    });
    const zoneData = await zoneRes.json() as any;
    if (!zoneData.success || !zoneData.result?.account?.id) {
      return { success: false, error: "Could not determine Cloudflare account ID from zone" };
    }
    const accountId = zoneData.result.account.id;

    const uploadUrl = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/workers/scripts/" + WORKER_NAME;
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": "Bearer " + API_TOKEN,
        "Content-Type": "application/javascript",
      },
      body: workerScript,
    });
    const uploadData = await uploadRes.json() as any;
    if (!uploadData.success) {
      const errMsg = uploadData.errors?.map((e: any) => e.message).join(", ") || "Unknown upload error";
      return { success: false, error: "Worker upload failed: " + errMsg };
    }

    const routePattern = "*." + DOMAIN + "/*";
    const existingRoutes = await cfFetch<any[]>("/zones/" + ZONE_ID + "/workers/routes");
    const hasRoute = existingRoutes.result.some((r: any) => r.pattern === routePattern);

    if (!hasRoute) {
      await cfFetch("/zones/" + ZONE_ID + "/workers/routes", {
        method: "POST",
        body: JSON.stringify({
          pattern: routePattern,
          script: WORKER_NAME,
        }),
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Unknown error deploying worker" };
  }
}
