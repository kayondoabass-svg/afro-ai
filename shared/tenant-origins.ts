export function parseTenantOrigins(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(v => typeof v === "string") : [];
  } catch {
    // Read old comma/newline records while all new writes use JSON.
    return raw.split(/[\s,]+/).filter(Boolean);
  }
}

export function validTenantOrigin(value: string): boolean {
  try {
    const u = new URL(value);
    return u.origin === value && !u.username && !u.password &&
      (u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)));
  } catch { return false; }
}