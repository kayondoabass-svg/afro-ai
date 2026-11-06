/** Hosting expiry does not change saved projects or daily AI usage allowances. */
export const FREE_HOSTING_DAYS = 30;
export const FREE_HOSTING_EXPIRY_REASON = "Free plan 30-day limit reached. Upgrade to keep your app live.";
export function suspensionReason(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 5 || value.trim().length > 1000)
    throw new Error("Enter a suspension reason between 5 and 1000 characters.");
  return value.trim();
}
export function suspensionNotice(app: { id: number; title: string }, reason: string, at: Date) {
  return {
    subject: `Your app "${app.title}" is offline`,
    text: [
      `Your app "${app.title}" has been taken offline.`,
      `Reason: ${reason}`,
      `Time: ${at.toISOString()}`,
      `Reference: app ${app.id}`,
      "Your saved app and project have not been deleted. You can still access your saved work in your account.",
      "Existing daily free-use limits and the midnight reset remain unchanged. This does not extend the free public-hosting period.",
      reason === FREE_HOSTING_EXPIRY_REASON
        ? "Next step: open your Afro AI dashboard and choose a hosting plan to restore public hosting."
        : "Next step: open your Afro AI dashboard and contact support to request a review. Payment does not override an administrative suspension.",
      "Dashboard: https://afroaigroup.com/dashboard",
    ].join("\n\n"),
  };
}
