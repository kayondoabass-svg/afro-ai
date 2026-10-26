// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateEvidence, EVIDENCE_LIMITS } from "./evidence-policy";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGyoAAAAASUVORK5CYII=";
const sample = () => ({ fingerprint: "source", name: "Mobile preview", mimeType: "image/png",
  base64: png, phase: "after", pageLabel: "Home", capturedAt: new Date().toISOString() });
describe("private screenshot evidence policy", () => {
  it("accepts bounded PNG bytes with source metadata", () => {
    expect(validateEvidence(sample(), "source")).toMatchObject({ width: 1, height: 1, phase: "after", fingerprint: "source" });
  });
  it("rejects stale source and unsupported active image formats", () => {
    expect(() => validateEvidence(sample(), "changed")).toThrow("Source changed");
    expect(() => validateEvidence({ ...sample(), mimeType: "image/svg+xml" }, "source")).toThrow("PNG or JPEG");
  });
  it("rejects malformed and noncanonical base64", () => {
    for (const base64 of ["bad", png + "\n", Buffer.from("<script>alert(1)</script>").toString("base64")])
      expect(() => validateEvidence({ ...sample(), base64 }, "source")).toThrow();
  });
  it("rejects oversized images and decompression dimensions", () => {
    expect(() => validateEvidence({ ...sample(), base64: Buffer.alloc(EVIDENCE_LIMITS.fileBytes + 1).toString("base64") }, "source")).toThrow();
    const large = Buffer.from(png, "base64"); large.writeUInt32BE(8000, 16); large.writeUInt32BE(8000, 20);
    expect(() => validateEvidence({ ...sample(), base64: large.toString("base64") }, "source")).toThrow("dimensions");
  });
  it("requires a named Before/After capture and valid capture time", () => {
    for (const extra of [{ name: "" }, { phase: "passed" }, { capturedAt: "never" }, { capturedAt: new Date(Date.now() + 3600000).toISOString() }])
      expect(() => validateEvidence({ ...sample(), ...extra }, "source")).toThrow();
  });
});
