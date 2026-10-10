// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { keyoStudioPage } from "../keyo-studio-page";
import { KEYO_FILENAME, KEYO_VERSION } from "../../scripts/keyo-release";

const exec = promisify(execFile);
describe("KEYO Studio independent runner", () => {
  it("runs the isolated Node numerical and real-worker HTTP suite from root CI", async () => {
    const { stdout } = await exec(process.execPath, [
      "--test",
      "packages/keyo-studio/test/engine.test.mjs",
      "packages/keyo-studio/test/server.test.mjs",
      "packages/keyo-studio/test/desktop.test.mjs",
    ], { timeout: 30000, maxBuffer: 256 * 1024 });
    expect(stdout).toMatch(/fail 0/);
  });
  it("offers the actual package and release API without claiming native or model certification", () => {
    const html = keyoStudioPage();
    expect(html).toContain(`/downloads/keyo-studio/${KEYO_FILENAME}`);
    expect(html).toContain("/api/keyo-studio/release");
    expect(html).toContain(KEYO_VERSION);
    expect(html).toContain("Node.js 20");
    expect(html).toContain("Ugandan-built by KEYO Technologies");
    expect(html).toContain("not yet certified");
    expect(html).not.toMatch(/first (?:one )?(?:from|in) Africa|eighth globally/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });
});
