// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { keyoStudioPage } from "../keyo-studio-page";
import { KEYO_FILENAME, KEYO_VERSION } from "../../scripts/keyo-release";
import { KEYO_PUBLIC_LINKS, KEYO_RELEASE_BUNDLE, keyoReleaseNotes, prepareReleaseAssets, KEYO_CHECKSUMS } from "../../scripts/keyo-release-assets";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const exec = promisify(execFile);
describe("KEYO Studio independent runner", () => {
  it("runs the isolated Node numerical and real-worker HTTP suite from root CI", async () => {
    const { stdout } = await exec(process.execPath, [
      "--test",
      "packages/keyo-studio/test/engine.test.mjs",
      "packages/keyo-studio/test/server.test.mjs",
      "packages/keyo-studio/test/desktop.test.mjs",
      "packages/keyo-studio/test/disk-tensors.test.mjs",
    ], { timeout: 30000, maxBuffer: 256 * 1024 });
    expect(stdout).toMatch(/fail 0/);
  });
  it("offers the actual package and release API without claiming native or model certification", () => {
    const html = keyoStudioPage();
    expect(html).toContain(`/downloads/keyo-studio/${KEYO_FILENAME}`);
    expect(html).toContain("/api/keyo-studio/release");
    expect(html).toContain(KEYO_PUBLIC_LINKS.github);
    expect(html).toContain(KEYO_PUBLIC_LINKS.huggingFace);
    expect(html).toContain(KEYO_RELEASE_BUNDLE);
    expect(html).toContain(`${KEYO_PUBLIC_LINKS.huggingFace}/resolve/main/KEYO-Studio-${KEYO_VERSION}-win32-x64.zip?download=true`);
    expect(html).toContain("about 158 MB");
    expect(html).toContain("separate download of about 1 GB");
    expect(html).toContain("not the Windows app");
    expect(html).toContain("start a fresh file");
    expect(html).toContain('id="install-windows"');
    expect(html).toContain("Right-click → Extract All.");
    expect(html).toContain("Load downloaded model");
    expect(html).toContain("No account is required");
    expect(html).toContain("Do not disable antivirus");
    expect(html).toContain('rel="canonical" href="https://afroaigroup.com/keyo-studio"');
    expect(html).toContain(KEYO_VERSION);
    expect(html).toContain("Node.js 20");
    expect(html).toContain("Ugandan-built by KEYO Technologies");
    expect(html).toContain("not yet certified");
    expect(html).not.toMatch(/first (?:one )?(?:from|in) Africa|eighth globally/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });
  it("prepares checksum-verified prerelease files and honest release notes", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keyo-release-"));
    try {
      const assets = await prepareReleaseAssets(directory, KEYO_FILENAME, Buffer.from("tgz fixture"), Buffer.from("zip fixture"));
      expect(assets).toHaveLength(5);
      const checksums = await readFile(path.join(directory, KEYO_CHECKSUMS), "utf8");
      for (const asset of assets) {
        const data = await readFile(path.join(directory, asset.filename));
        expect(createHash("sha256").update(data).digest("hex")).toBe(asset.sha256);
        if (asset.filename !== KEYO_CHECKSUMS && asset.filename !== KEYO_RELEASE_BUNDLE) expect(checksums).toContain(`${asset.sha256}  ${asset.filename}`);
      }
      expect(keyoReleaseNotes).toContain("Unsigned desktop packages and source");
      expect(keyoReleaseNotes).toContain("verified downloads");
      expect(keyoReleaseNotes).toMatch(/does not establish[\s\S]*7B\/14B support/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
