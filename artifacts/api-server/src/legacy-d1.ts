/**
 * Founder console and PostgreSQL sync target. Never fall back to the project-files
 * adapter: the two databases have different owners and different schemas.
 */
export class LegacyD1IdentityError extends Error {
  constructor() {
    super("Legacy D1 target is not configured or its identity could not be verified");
    this.name = "LegacyD1IdentityError";
  }
}

const AUTH_DATABASE_ID = "e796b2ab-d062-42c2-8412-7d281e4c0f5d"; // cloudflare/wrangler.toml auth binding
const RESERVED_NAMES = new Set(["afro-ai-auth", "afro-ai-project-files"]);

function target() {
  const id = process.env.CLOUDFLARE_LEGACY_D1_DATABASE_ID?.trim();
  const name = process.env.LEGACY_D1_DATABASE_NAME?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_D1_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || "fe7bcfa7be264c172e444e854a6bccbb";
  if (!id || !name || !token || !account ||
      id === process.env.CLOUDFLARE_D1_DATABASE_ID?.trim() ||
      id === AUTH_DATABASE_ID ||
      id === process.env.CLOUDFLARE_AUTH_D1_DATABASE_ID?.trim() ||
      id === process.env.AUTH_D1_DATABASE_ID?.trim() ||
      RESERVED_NAMES.has(name.toLowerCase())) {
    throw new LegacyD1IdentityError();
  }
  return {
    id, name,
    url: `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${encodeURIComponent(id)}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  };
}

/** Verify remote UUID and name before *every* operation, including exports and writes. */
async function verifiedTarget() {
  const config = target();
  try {
    const response = await fetch(config.url, { headers: config.headers });
    if (!response.ok) throw new LegacyD1IdentityError();
    const data = await response.json() as any;
    if (data.success !== true || data.result?.uuid !== config.id || data.result?.name !== config.name ||
        RESERVED_NAMES.has(data.result.name?.toLowerCase())) {
      throw new LegacyD1IdentityError();
    }
  } catch {
    // Do not expose Cloudflare error bodies, credentials, or database identifiers.
    throw new LegacyD1IdentityError();
  }
  return config;
}

export async function legacyD1Status(): Promise<{ configured: true; role: string; name: string }> {
  const config = await verifiedTarget();
  return { configured: true, role: "legacy/general", name: config.name };
}

export async function legacyD1Query(sql: string, params: any[] = []): Promise<{ results: any[]; meta: any }> {
  const config = await verifiedTarget();
  try {
    const response = await fetch(`${config.url}/query`, {
      method: "POST", headers: config.headers, body: JSON.stringify({ sql, params }),
    });
    if (!response.ok) throw new Error("Legacy D1 query failed");
    const data = await response.json() as any;
    if (data.success !== true) throw new Error("Legacy D1 query failed");
    return { results: data.result?.[0]?.results ?? [], meta: data.result?.[0]?.meta ?? {} };
  } catch {
    throw new Error("Legacy D1 query failed");
  }
}

export async function legacyD1ListTables(): Promise<string[]> {
  const { results } = await legacyD1Query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return results.map((r: any) => r.name);
}

export async function legacyD1GetTableInfo(tableName: string): Promise<any[]> {
  const safe = tableName.replace(/[^a-zA-Z0-9_]/g, "");
  const { results } = await legacyD1Query(`PRAGMA table_info(${safe})`);
  return results;
}

export async function legacyD1GetTableRows(tableName: string, limit = 100, offset = 0) {
  const safe = tableName.replace(/[^a-zA-Z0-9_]/g, "");
  return legacyD1Query(`SELECT * FROM ${safe} LIMIT ? OFFSET ?`, [limit, offset]);
}

export async function legacyD1Export(): Promise<{ url: string }> {
  const config = await verifiedTarget();
  try {
    const response = await fetch(`${config.url}/export`, {
      method: "POST", headers: config.headers, body: JSON.stringify({ output_format: "polling" }),
    });
    if (!response.ok) throw new Error("Legacy D1 export failed");
    const data = await response.json() as any;
    if (data.success !== true) throw new Error("Legacy D1 export failed");
    return data.result;
  } catch {
    throw new Error("Legacy D1 export failed");
  }
}