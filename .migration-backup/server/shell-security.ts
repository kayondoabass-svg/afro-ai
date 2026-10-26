import { timingSafeEqual } from "node:crypto";
import { FOUNDER_EMAIL } from "./replit_integrations/auth";

// Unlike the general API CORS policy, a privileged shell cannot trust every
// *.pages.dev project: anyone can create one. Only configured Pages deployments
// and the first-party / Replit origins used by this app are accepted.
export function isAllowedShellOrigin(origin: string | undefined, pagesUrl = process.env.CLOUDFLARE_PAGES_URL): boolean {
  if (!origin) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.origin !== origin) return false;
  if (pagesUrl) {
    try {
      if (origin === new URL(pagesUrl).origin) return true;
    } catch {
      // Invalid configuration does not grant access.
    }
  }
  if (parsed.protocol === "https:") {
    return parsed.hostname === "afroaigroup.com" ||
      parsed.hostname === "www.afroaigroup.com" ||
      /^[a-z0-9-]+\.afroaigroup\.com$/.test(parsed.hostname) ||
      /^[a-z0-9-]+\.replit\.dev$/.test(parsed.hostname) ||
      /^[a-z0-9-]+\.repl\.co$/.test(parsed.hostname);
  }
  return process.env.NODE_ENV !== "production" &&
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
}

export function hasShellAccess(
  request: { isAuthenticated?: () => boolean; user?: { claims?: { email?: string } } },
  suppliedKey: unknown,
  configuredSecret: string,
  sandboxAvailable: boolean,
): boolean {
  if (!sandboxAvailable || configuredSecret.length < 32 || typeof suppliedKey !== "string" ||
      !request.isAuthenticated?.() || request.user?.claims?.email !== FOUNDER_EMAIL) return false;
  const expected = Buffer.from(configuredSecret);
  const supplied = Buffer.from(suppliedKey);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}