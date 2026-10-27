/**
 * Mail API timestamp contract: ISO 8601 UTC strings, or null when unavailable.
 * Legacy input accepts Unix seconds, Unix milliseconds (>= 1e11), numeric
 * strings and timezone-qualified ISO date-times. Never use "now" as a fallback.
 * Numeric timestamps describe positive modern application event times.
 */
export function mailTimestamp(value: unknown): string | null {
  let milliseconds: number;
  if (value instanceof Date) milliseconds = value.getTime();
  else if (typeof value === "number" || (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()))) {
    const number = Number(value);
    milliseconds = number < 100_000_000_000 ? number * 1000 : number;
  } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim())) {
    const text = value.trim();
    const [year, month, day] = text.slice(0, 10).split("-").map(Number);
    // Date.parse normalizes impossible dates such as February 30.
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
    milliseconds = Date.parse(text);
  } else return null;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function formatMailTime(value: unknown, timeZone?: string): string {
  const timestamp = mailTimestamp(value);
  return timestamp ? new Date(timestamp).toLocaleString(undefined, timeZone ? { timeZone } : undefined) : "Time unavailable";
}

export function mailEventTimes<T extends { created_at?: unknown; updated_at?: unknown }>(event: T) {
  return { ...event, created_at: mailTimestamp(event.created_at), updated_at: mailTimestamp(event.updated_at) };
}
