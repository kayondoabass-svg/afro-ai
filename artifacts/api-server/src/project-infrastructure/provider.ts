import { ProjectFileError } from "../project-file-policy";

type Database = { uuid: string; name: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const resourceName = /^afro-project-\d+-[0-9a-f]{24}$/;

function credentials() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_PROJECTS_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !/^[0-9a-f]{32}$/i.test(account) || !token) {
    throw new ProjectFileError(503, "Project database credentials are not configured. Contact the platform administrator.");
  }
  return { account, token };
}

export function infrastructureConfigured() {
  try { credentials(); return true; } catch { return false; }
}

export function validateDatabaseIdentity(database: Database, expectedName: string, expectedId?: string | null) {
  if (!resourceName.test(expectedName) || database.name !== expectedName || !uuid.test(database.uuid) ||
      (expectedId && database.uuid !== expectedId) ||
      database.uuid === process.env.CLOUDFLARE_D1_DATABASE_ID) {
    throw new ProjectFileError(409, "Database identity could not be verified. No changes were made.");
  }
  return database;
}

async function api(path: string, method = "GET", body?: unknown, allowMissing = false) {
  const { account, token } = credentials();
  let response: Response;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new ProjectFileError(503, "Cloudflare did not confirm the operation. Retry setup to reconcile the existing resource; do not create another project.");
  }
  if (allowMissing && response.status === 404) return null;
  let data: any;
  try { data = await response.json(); } catch { throw new ProjectFileError(503, "Cloudflare returned an invalid response."); }
  if (!response.ok || data?.success !== true) {
    // Never forward provider error text: it can contain SQL, identifiers or credentials.
    throw new ProjectFileError(503, response.status === 403 || response.status === 401
      ? "Cloudflare denied this operation. The administrator must verify D1 permissions."
      : "Cloudflare could not complete this operation. Retry later.");
  }
  return data;
}

export async function findDatabase(name: string): Promise<Database | null> {
  if (!resourceName.test(name)) throw new ProjectFileError(400, "Invalid managed database name.");
  const data = await api(`?name=${encodeURIComponent(name)}&per_page=100`);
  if (!Array.isArray(data.result)) throw new ProjectFileError(503, "Invalid database lookup response.");
  const matches = data.result.filter((item: Database) => item.name === name);
  if (matches.length > 1) throw new ProjectFileError(409, "Database identity is ambiguous. Ask the administrator to reconcile it.");
  return matches.length ? validateDatabaseIdentity(matches[0], name) : null;
}

export async function createDatabase(name: string): Promise<Database> {
  if (!resourceName.test(name)) throw new ProjectFileError(400, "Invalid managed database name.");
  const data = await api("", "POST", { name });
  return validateDatabaseIdentity(data.result, name);
}

export async function verifyDatabase(id: string, name: string): Promise<Database | null> {
  if (!uuid.test(id)) throw new ProjectFileError(409, "Invalid managed database identity.");
  const data = await api(`/${id}`, "GET", undefined, true);
  return data ? validateDatabaseIdentity(data.result, name, id) : null;
}

export async function queryDatabase(id: string, sql: string, params: unknown[] = []) {
  if (!uuid.test(id)) throw new ProjectFileError(409, "Invalid managed database identity.");
  const data = await api(`/${id}/query`, "POST", { sql, params });
  if (!Array.isArray(data.result) || data.result.some((r: any) => r.success === false)) {
    throw new ProjectFileError(503, "Database migration did not complete.");
  }
  return data.result[0]?.results ?? [];
}

export async function deleteDatabase(id: string, name: string) {
  const existing = await verifyDatabase(id, name);
  if (existing) await api(`/${id}`, "DELETE", undefined, true);
}