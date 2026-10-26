// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function checkHealth(readyAfter: number, status = "200") {
  const dir = mkdtempSync(join(tmpdir(), "deploy-health-"));
  try {
    return spawnSync("bash", ["-c", `
source "$DEPLOY_SCRIPT"
HEALTH_URL="http://test.invalid/api/health"
log() { printf '%s\\n' "$*"; }
# Simulate elapsed time without real waits or network requests.
SECONDS=0
sleep() { SECONDS=$((SECONDS + $1)); }
curl() {
  local count=0
  [ ! -f "$TEST_DIR/count" ] || read -r count < "$TEST_DIR/count"
  count=$((count + 1))
  echo "$count" > "$TEST_DIR/count"
  printf '%s\\n' "$*" >> "$TEST_DIR/requests"
  if [ "$count" -ge "$READY_AFTER" ]; then printf '%s' "$STATUS"; else printf '000'; return 7; fi
}
health_check
result=$?
printf 'ELAPSED=%s\\n' "$SECONDS"
cat "$TEST_DIR/requests"
exit "$result"
`], {
      encoding: "utf8",
      timeout: 5_000,
      env: {
        PATH: process.env.PATH,
        DEPLOY_SCRIPT: resolve("scripts/deploy.sh"),
        TEST_DIR: dir,
        READY_AFTER: String(readyAfter),
        STATUS: status,
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("deployment startup deadline", () => {
  it("waits past the old five probes for a slow but healthy startup", () => {
    const result = checkHealth(8);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Health check OK on attempt 8 (200)");
    expect(result.stdout).toContain("ELAPSED=14");
    expect(result.stdout).toContain("--connect-timeout 5 --max-time 5");
    expect(result.stdout).not.toContain("000000");
  });

  it("accepts a healthy 204 response", () => {
    const result = checkHealth(1, "204");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ELAPSED=0");
  });

  it.each(["503", "301"])("fails after 60 seconds if the endpoint keeps returning %s", status => {
    const result = checkHealth(1, status);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Health check timed out after 60s");
    expect(result.stdout).toContain("ELAPSED=60");
    expect(result.stdout).not.toContain("Health check OK");
    expect(result.stdout).toContain("--connect-timeout 2 --max-time 2");
  });

  it("fails after 60 seconds on persistent connection failures", () => {
    const result = checkHealth(100);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("ELAPSED=60");
    expect(result.stdout).not.toContain("000000");
  });
});
