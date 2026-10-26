/** Auth is billed independently from app-builder, credits and Email API packages. */
export const AUTH_PACKAGES = [
  { key: "free", name: "Starter", usd: 0, mau: 5_000, apps: 1 },
  { key: "builder", name: "Builder", usd: 5, mau: 25_000, apps: 1 },
  { key: "business", name: "Business", usd: 25, mau: 100_000, apps: 5 },
  { key: "scale", name: "Scale", usd: 100, mau: 500_000, apps: -1 },
] as const;
export type AuthPlan = typeof AUTH_PACKAGES[number]["key"];
export function authPackage(key: unknown) {
  return AUTH_PACKAGES.find(p => p.key === key) || AUTH_PACKAGES[0];
}
export function authFeatures(key: unknown) {
  const level = AUTH_PACKAGES.findIndex(p => p.key === key);
  return { identity: level >= 1, senderDomain: level >= 2, copy: level >= 2, whiteLabel: level >= 2, html: level >= 3 };
}
export const EMAIL_PACKAGES = [
  { key: "starter", name: "Starter", usd: 0 },
  { key: "pro", name: "Pro", usd: 15 },
  { key: "business", name: "Business", usd: 25 },
] as const;
