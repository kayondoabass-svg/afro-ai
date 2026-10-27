// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mailTimestamp, formatMailTime, mailEventTimes } from "../../shared/mail-timestamps";

const iso = "2026-10-27T03:00:00.000Z";
const milliseconds = Date.parse(iso);
describe("mail timestamp contract", () => {
  it.each([milliseconds / 1000, milliseconds, String(milliseconds / 1000), String(milliseconds),
    iso, "2026-10-27T06:00:00+03:00", new Date(iso)])("normalizes supported value %s to UTC ISO", value => {
    expect(mailTimestamp(value)).toBe(iso);
  });
  it.each([null, undefined, "", "  ", false, [], {}, 0, -1, NaN, Infinity, 1e17,
    "not a time", "2026-02-30T03:00:00Z", "2026-10-27T25:00:00Z", "2026-10-27", new Date(NaN)])("does not invent an event time for %s", value => {
    expect(mailTimestamp(value)).toBeNull();
    expect(formatMailTime(value)).toBe("Time unavailable");
  });
  it("uses the viewer timezone without altering the instant", () => {
    expect(formatMailTime(milliseconds / 1000, "Africa/Kampala"))
      .toBe(new Date(iso).toLocaleString(undefined, { timeZone: "Africa/Kampala" }));
    expect(formatMailTime(iso, "America/New_York")).not.toBe(formatMailTime(iso, "Africa/Kampala"));
    expect(formatMailTime(iso)).toBe(new Date(iso).toLocaleString());
  });
  it("preserves records/status and normalizes both timestamp fields without mutation", () => {
    const original = { id: "old-record", outcome: "accepted", created_at: milliseconds / 1000, updated_at: null };
    expect(mailEventTimes(original)).toEqual({ ...original, created_at: iso, updated_at: null });
    expect(original.created_at).toBe(milliseconds / 1000);
  });
});
