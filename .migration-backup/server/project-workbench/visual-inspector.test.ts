// @vitest-environment node
import { describe, expect, it } from "vitest";
import { INSPECTOR_PROFILE, parseInspection, inspectionText, assertRepairDepth, inspectorInstructions } from "./visual-inspector";
describe("trusted visual inspector profile", () => {
  const view = () => INSPECTOR_PROFILE.checks.map(check => ({ check, status: "not-observed", detail: "No issue visible in this viewport" }));
  it("requires every check independently in both views", () => {
    const inspection = parseInspection(JSON.stringify({ desktop: view(), mobile: view(), summary: "Capture is not a functional test" }))!;
    expect(inspection.mobile).toHaveLength(6);
    expect(inspection.functionalVerified).toBe(false);
    expect(inspectionText(inspection)).toContain("Functional behavior is not verified");
    expect(parseInspection(JSON.stringify({ desktop: view(), mobile: [], summary: "Passed" }))).toBeUndefined();
  });
  it("rejects invented pass statuses and duplicated checks", () => {
    const items = view(); items[1] = items[0];
    expect(parseInspection(JSON.stringify({ desktop: items, mobile: view(), summary: "OK" }))).toBeUndefined();
    expect(parseInspection('{"desktop":[{"status":"passed"}]}')).toBeUndefined();
  });
  it("enforces three rounds independently of reload and documents forbidden claims", () => {
    expect(() => assertRepairDepth(2)).not.toThrow();
    expect(() => assertRepairDepth(3)).toThrow("Three");
    expect(() => assertRepairDepth(-1)).toThrow();
    expect(inspectorInstructions()).toContain("Never read credentials");
  });
});
