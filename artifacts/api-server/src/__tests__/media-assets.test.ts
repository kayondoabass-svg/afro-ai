import { describe, it, expect, vi } from "vitest";
import { mediaExtension, readMedia, storeMedia } from "../media-assets";
import { generateVideoWithVeo } from "../veo";

describe("media asset safety", () => {
  it("allowlists MIME types by media kind, including stored rows", async () => {
    expect(mediaExtension("image", "image/png")).toBe("png");
    for (const mime of ["text/html", "image/svg+xml", "video/mp4", "__proto__", "constructor"]) {
      await expect(readMedia({ kind: "image", mime_type: mime, asset_bytes: Buffer.from("x") }))
        .rejects.toMatchObject({ code: "MEDIA_ASSET_TYPE" });
    }
    expect(() => mediaExtension("__proto__", "image/png")).toThrow("MEDIA_ASSET_TYPE");
    await expect(storeMedia("id", Buffer.from("x"), "text/html")).rejects.toMatchObject({ code: "MEDIA_ASSET_TYPE" });
  });
  it("rejects empty database bytes with a stable error", async () => {
    await expect(readMedia({ kind: "image", mime_type: "image/png", asset_bytes: Buffer.alloc(0) }))
      .rejects.toMatchObject({ code: "MEDIA_ASSET_SIZE_LIMIT" });
  });
  it("Veo rejects invalid duration before a network call, rather than clamping", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network allowed"));
    try {
      for (const durationSeconds of [0, 1, 6, 2.5, NaN, Infinity, "5", null]) {
        await expect(generateVideoWithVeo("test", { durationSeconds: durationSeconds as number }))
          .rejects.toThrow("VEO_INVALID_DURATION");
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { fetchMock.mockRestore(); }
  });
});