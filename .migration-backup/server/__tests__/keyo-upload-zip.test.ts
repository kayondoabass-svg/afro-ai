import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { sourceZip, KEYO_GIT_EXTRAS } from "../../scripts/keyo-upload-zip";

describe("manual source ZIP", () => {
  it("stores root-level UTF-8 filenames and readable compressed data", () => {
    const data = Buffer.from("KEYO Studio — developer source");
    const zip = sourceZip([{ name: "README.md", data }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const length = zip.readUInt16LE(26);
    expect(zip.subarray(30, 30 + length).toString()).toBe("README.md");
    expect(inflateRawSync(zip.subarray(30 + length, 30 + length + zip.readUInt32LE(18)))).toEqual(data);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 14)).toBe(1);
    expect(KEYO_GIT_EXTRAS[".github/workflows/tests.yml"]).not.toContain("Deploy to VPS");
  });
  it("refuses traversal, Git metadata, duplicates and oversized payloads", () => {
    for (const name of ["../.env", "/etc/passwd", ".git/config", "x\\y", "a//b"])
      expect(() => sourceZip([{ name, data: Buffer.alloc(0) }])).toThrow();
    expect(() => sourceZip([{ name: "a", data: Buffer.alloc(0) }, { name: "a", data: Buffer.alloc(0) }])).toThrow();
    expect(() => sourceZip([{ name: "a", data: Buffer.alloc(4 * 1024 * 1024 + 1) }])).toThrow();
  });
});
