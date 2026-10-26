/** Cookie-authenticated platform APIs must not trust arbitrary customer hosts. */
export function isTrustedPlatformOrigin(origin: string, env: NodeJS.ProcessEnv = process.env) {
  const trusted = new Set([
    "https://afroaigroup.com", "https://www.afroaigroup.com",
    env.CLOUDFLARE_PAGES_URL,
    env.REPLIT_DEV_DOMAIN ? `https://${env.REPLIT_DEV_DOMAIN}` : undefined,
  ].filter(Boolean));
  return trusted.has(origin);
}
