import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

describe("deployment cache-purge retry", () => {
  it("never reports success after a failed purge until a same-commit retry purges successfully", () => {
    const dir = mkdtempSync(join(tmpdir(), "deploy-purge-test-"));
    try {
      mkdirSync(join(dir, "node_modules/.bin"), { recursive: true });
      writeFileSync(join(dir, "node_modules/.bin/tsx"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      writeFileSync(join(dir, "shared.env"), "PORT=3000\n");
      const harness = `
source "$DEPLOY_SCRIPT"
APP_DIR="$TEST_DIR"
SHARED_ENV="$TEST_DIR/shared.env"
LOG_FILE="$TEST_DIR/deploy.log"
LOCK_FILE="$TEST_DIR/deploy.lock"
check_prereqs() { :; }
require_clean_tree() { :; }
git() { if [[ "$*" == *"rev-parse HEAD"* ]]; then echo same-sha; fi; }
snapshot_dist() { :; }
install_deps_if_changed() { :; }
run_build() { echo build >> "$TEST_DIR/events"; mkdir -p "$APP_DIR/dist"; }
restart_service() { echo restart >> "$TEST_DIR/events"; }
health_check() { echo health >> "$TEST_DIR/events"; [[ "$MOCK_HEALTH_OK" == 1 ]]; }
post_start_stability_check() { echo stability >> "$TEST_DIR/events"; }
chown() { :; }
purge_cdn() { echo purge >> "$TEST_DIR/events"; [[ "$MOCK_PURGE_OK" == 1 ]]; }
main
`;
      const run = (purgeOk: string, healthOk = "1") => spawnSync("bash", ["-c", harness], {
        encoding: "utf8",
        env: { PATH: process.env.PATH, TEST_DIR: dir, DEPLOY_SCRIPT: resolve("scripts/deploy.sh"), MOCK_PURGE_OK: purgeOk, MOCK_HEALTH_OK: healthOk },
      });
      const first = run("0");
      expect(first.status).toBe(1);
      expect(first.stdout).toContain("DEPLOY INCOMPLETE");
      expect(first.stdout).not.toContain("DEPLOY SUCCESS");
      expect(readFileSync(join(dir, "dist/.deployed_sha"), "utf8").trim()).toBe("same-sha");
      const retryFailure = run("0");
      expect(retryFailure.status).toBe(1);
      expect(retryFailure.stdout).not.toContain("DEPLOY SUCCESS");
      const retrySuccess = run("1");
      expect(retrySuccess.status).toBe(0);
      expect(retrySuccess.stdout).toContain("DEPLOY SUCCESS");
      expect(readFileSync(join(dir, "events"), "utf8").trim().split("\n")).toEqual([
        "build", "restart", "health", "stability", "purge",
        "health", "stability", "purge",
        "health", "stability", "purge",
      ]);
      const unhealthyRetry = run("1", "0");
      expect(unhealthyRetry.status).toBe(1);
      expect(unhealthyRetry.stdout).not.toContain("DEPLOY SUCCESS");
      expect(readFileSync(join(dir, "events"), "utf8").trim().endsWith("health")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});