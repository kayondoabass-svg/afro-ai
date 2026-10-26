// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

describe("deployment working-tree guard", () => {
  const run = (status: string, gitExit = "0") => {
    const dir = mkdtempSync(join(tmpdir(), "deploy-tree-"));
    try {
      return spawnSync("bash", ["-c", `
source "$DEPLOY_SCRIPT"
APP_DIR="$TEST_DIR"
LOG_FILE="$TEST_DIR/deploy.log"
git() { printf '%s\\n' "$MOCK_STATUS"; return "$MOCK_EXIT"; }
require_clean_tree
echo CLEAN
`], {
        encoding: "utf8",
        env: { PATH: process.env.PATH, DEPLOY_SCRIPT: resolve("scripts/deploy.sh"), TEST_DIR: dir, MOCK_STATUS: status, MOCK_EXIT: gitExit },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("allows only generated untracked rollback snapshots", () => {
    const result = run("?? dist.prev/index.cjs\n?? dist.prev.kept/public/app.js\n?? dist.broken/index.cjs");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("CLEAN");
  });

  it.each([
    "?? dist.prev/index.cjs\n M server/routes.ts",
    "?? dist.prev/index.cjs\n?? customer-hotfix.ts",
    " M dist.prev/tracked-file",
    "?? dist.previous/important.ts",
    "?? dist.prev",
  ])("still rejects source changes: %s", (status) => {
    const result = run(status);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("DIRTY");
    expect(result.stdout).not.toContain("CLEAN");
  });

  it("fails closed when git status fails", () => {
    expect(run("", "128").status).toBe(1);
  });

  it("ignores backup directories without ignoring similarly named source files", () => {
    const patterns = readFileSync(".gitignore", "utf8").split("\n");
    expect(patterns).toEqual(expect.arrayContaining(["/dist.prev/", "/dist.prev.kept/", "/dist.broken/"]));
  });
});
