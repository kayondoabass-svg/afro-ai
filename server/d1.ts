const CF_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "fe7bcfa7be264c172e444e854a6bccbb";

export function isD1Configured(): boolean {
  return !!(process.env.CLOUDFLARE_D1_TOKEN && process.env.CLOUDFLARE_D1_DATABASE_ID);
}

function getHeaders() {
  return {
    "Authorization": `Bearer ${process.env.CLOUDFLARE_D1_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function getBaseUrl() {
  const dbId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}`;
}

export async function d1Query(sql: string, params: any[] = []): Promise<{ results: any[]; meta: any }> {
  const resp = await fetch(`${getBaseUrl()}/query`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ sql, params }),
  });
  const data = await resp.json() as any;
  if (!data.success) {
    const errMsg = data.errors?.map((e: any) => e.message).join(", ") || "D1 query failed";
    throw new Error(errMsg);
  }
  const result = data.result?.[0];
  return { results: result?.results ?? [], meta: result?.meta ?? {} };
}

export async function d1ListTables(): Promise<string[]> {
  const { results } = await d1Query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return results.map((r: any) => r.name);
}

export async function d1CreateTable(sql: string): Promise<void> {
  await d1Query(sql);
}

export async function d1GetTableInfo(tableName: string): Promise<any[]> {
  const safe = tableName.replace(/[^a-zA-Z0-9_]/g, "");
  const { results } = await d1Query(`PRAGMA table_info(${safe})`);
  return results;
}

export async function d1GetTableRows(tableName: string, limit = 100, offset = 0): Promise<{ results: any[]; meta: any }> {
  const safe = tableName.replace(/[^a-zA-Z0-9_]/g, "");
  return d1Query(`SELECT * FROM ${safe} LIMIT ? OFFSET ?`, [limit, offset]);
}

export async function d1Export(): Promise<{ url: string }> {
  const resp = await fetch(`${getBaseUrl()}/export`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ output_format: "polling" }),
  });
  const data = await resp.json() as any;
  if (!data.success) throw new Error("D1 export failed");
  return data.result;
}
