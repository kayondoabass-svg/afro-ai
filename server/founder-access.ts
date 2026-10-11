// Server-controlled identity, never a role supplied in a request body.
export const FOUNDER_EMAILS = ["kayondoabass@gmail.com"];

export function isFounderEmail(email: unknown): boolean {
  return typeof email === "string" && FOUNDER_EMAILS.includes(email.trim().toLowerCase());
}

export function presentEmailApiKey<T extends { plan: string; secretKeyHash: string }>(key: T, ownerEmail: unknown) {
  const founderAccess = isFounderEmail(ownerEmail);
  return {
    ...key, secretKeyHash: undefined,
    plan: founderAccess ? "enterprise" : key.plan,
    founderAccess, quotaExempt: founderAccess,
  };
}
