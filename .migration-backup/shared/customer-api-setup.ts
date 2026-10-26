import { validTenantOrigin } from "./tenant-origins";

export function prepareAuthOrigins(text: string): string[] {
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  const origins = lines.map((line, index) => {
    try {
      const url = new URL(line);
      if (url.pathname !== "/" || url.search || url.hash || url.username || url.password ||
          !validTenantOrigin(url.origin)) throw new Error();
      return url.origin;
    } catch {
      throw new Error(`Line ${index + 1}: use an exact HTTPS website origin, such as https://app.example.com. No wildcards, paths, query strings or credentials. HTTP localhost and 127.0.0.1 are allowed for development.`);
    }
  });
  const unique = [...new Set(origins)];
  if (unique.length > 10) throw new Error("Add at most 10 distinct website origins.");
  return unique;
}

export function normalizeSendingDomain(input: unknown): string {
  if (typeof input !== "string") throw new Error("Enter a domain, such as example.com.");
  const raw = input.trim().toLowerCase();
  if (!raw || /[/:@?#\s*]/u.test(raw)) throw new Error("Enter only the sending domain, such as example.com — not a website URL, email address or wildcard.");
  let domain: string;
  try { domain = new URL(`https://${raw}`).hostname; } catch { throw new Error("Enter a valid sending domain, such as example.com."); }
  const labels = domain.split(".");
  if (domain.length > 253 || labels.length < 2 || !/[a-z]/i.test(labels.at(-1) || "") ||
      labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    throw new Error("Enter a valid sending domain, such as example.com.");
  }
  return domain;
}

export function readableApiError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const text = error.message.replace(/^\d{3}:\s*/, "");
  try {
    const data = JSON.parse(text);
    return typeof data.error === "string" ? data.error : typeof data.message === "string" ? data.message : fallback;
  } catch { return text || fallback; }
}
