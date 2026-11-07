// @vitest-environment node
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
it("enforces isolated restores, bounded staging, safe errors and backup-only retention", () => {
  const output = execFileSync(process.execPath, ["--test", "--test-reporter=tap", "scripts/backup/backup.test.mjs"],
    { encoding: "utf8", timeout: 20000 });
  expect(output).toContain("# fail 0");
});
