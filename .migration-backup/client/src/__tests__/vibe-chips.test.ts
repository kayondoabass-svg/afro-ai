import { describe, it, expect } from "vitest";
import { parseVibeMarkers } from "@/components/vibe-chips";

describe("parseVibeMarkers", () => {
  it("extracts file refs with line ranges", () => {
    const r = parseVibeMarkers("Edited [[file:server/routes.ts:10-25]] and [[file:client/App.tsx]].");
    expect(r.files).toHaveLength(2);
    expect(r.files[0]).toEqual({ path: "server/routes.ts", start: 10, end: 25 });
    expect(r.files[1].path).toBe("client/App.tsx");
    expect(r.cleanText).not.toContain("[[file:");
  });

  it("extracts build steps", () => {
    const r = parseVibeMarkers("[[step:read:Reading routes]] [[step:edit:Adding endpoint]] [[step:test:Running tests]]");
    expect(r.steps).toHaveLength(3);
    expect(r.steps[0]).toEqual({ kind: "read", label: "Reading routes" });
    expect(r.steps[2].kind).toBe("test");
  });

  it("extracts secret hints", () => {
    const r = parseVibeMarkers("Need [[needs-secret:OPENAI_API_KEY:for chat]] and [[needs-secret:PESAPAL_CONSUMER_KEY]].");
    expect(r.secrets).toHaveLength(2);
    expect(r.secrets[0]).toEqual({ name: "OPENAI_API_KEY", reason: "for chat" });
    expect(r.secrets[1].reason).toBeUndefined();
  });

  it("strips all markers and collapses blank lines", () => {
    const r = parseVibeMarkers("Hello\n\n\n[[file:x.ts]]\n\n\nWorld");
    expect(r.cleanText).toBe("Hello\n\n\n\nWorld".replace(/\n{3,}/g, "\n\n").trim());
  });

  it("returns empty arrays when no markers present", () => {
    const r = parseVibeMarkers("Plain text response.");
    expect(r.files).toHaveLength(0);
    expect(r.steps).toHaveLength(0);
    expect(r.secrets).toHaveLength(0);
    expect(r.cleanText).toBe("Plain text response.");
  });
});
