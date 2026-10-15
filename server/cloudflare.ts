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
    signal: options.signal || AbortSignal.timeout(15_000),
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

/** Delete only the serving records for this app, and verify absence. */
export async function removePublishedAppDns(subdomain: string): Promise<void> {
  if (!isValidSubdomain(subdomain).valid) throw new Error("Invalid app hostname");
  const name = `${subdomain}.${DOMAIN}`;
  const records = () => cfFetch<(CloudflareDnsRecord & { type: string })[]>(
    `/zones/${ZONE_ID}/dns_records?name=${encodeURIComponent(name)}`);
  const serving = (await records()).result.filter(record => ["CNAME", "A", "AAAA"].includes(record.type));
  for (const record of serving) await deleteSubdomainRecord(record.id);
  if ((await records()).result.some(record => ["CNAME", "A", "AAAA"].includes(record.type))) {
    throw new Error("App DNS cleanup could not be verified");
  }
}

/** Target this app's host and its own preview URL, never purge the whole zone. */
export async function purgePublishedAppCache(subdomain: string): Promise<void> {
  if (!isValidSubdomain(subdomain).valid) throw new Error("Invalid app hostname");
  const token = process.env.CLOUDFLARE_PURGE_TOKEN || API_TOKEN;
  if (!ZONE_ID || !token) throw new Error("Cache purge is not configured");
  for (const payload of [
    { hosts: [`${subdomain}.${DOMAIN}`] },
    { files: [`https://${DOMAIN}/site/${subdomain}`, `https://${DOMAIN}/site/${subdomain}/`] },
  ]) {
    const response = await fetch(`${CLOUDFLARE_API_BASE}/zones/${ZONE_ID}/purge_cache`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json() as CloudflareResponse<unknown>;
    if (!response.ok || !data.success) throw new Error("App cache purge was not confirmed");
  }
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

