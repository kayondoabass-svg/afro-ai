export function chatbotReplyAllowance(sub?: { repliesLimit?: unknown; repliesUsed?: unknown; status?: string } | null): string {
  if (!sub) return "Embed AI customer service on any website";
  if (sub.repliesLimit === -1) return "Unlimited AI replies";
  const limit = sub.repliesLimit;
  const used = sub.repliesUsed;
  if (typeof limit !== "number" || typeof used !== "number" ||
      !Number.isFinite(limit) || !Number.isFinite(used) || limit < 0 || used < 0) {
    return "Reply usage unavailable";
  }
  return `${Math.max(0, limit - used).toLocaleString()} AI replies remaining this month`;
}
