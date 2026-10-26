// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve("scripts/check-install.cjs");
const safe = {
  "socket.io": "4.8.4", "socket.io-client": "4.8.4",
  "engine.io": "6.6.11", "engine.io-client": "6.6.7",
  "socket.io-adapter": "2.5.8", "socket.io-parser": "4.2.7", ws: "8.21.0",
};

function check(entries: Record<string, { version: string; resolved?: string }>) {
  const cwd = mkdtempSync(join(tmpdir(), "socket-lock-test-"));
  try {
    writeFileSync(join(cwd, "package-lock.json"), JSON.stringify({ packages: entries }));
    return spawnSync(process.execPath, [script, "--lock-only"], { cwd, encoding: "utf8" });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe("Socket.IO lockfile security gate", () => {
  it("accepts the patched release floors and newer stable releases", () => {
    const entries = Object.fromEntries(Object.entries(safe).map(([name, version]) =>
      [`node_modules/${name}`, { version }]));
    entries["node_modules/some-parent/node_modules/ws"] = { version: "8.22.0" };
    expect(check(entries).status).toBe(0);
  });

  it.each([
    ["socket.io", "4.8.3"], ["socket.io-client", "4.8.3"],
    ["engine.io", "6.6.8"], ["engine.io-client", "6.6.5"],
    ["socket.io-adapter", "2.5.7"], ["socket.io-parser", "4.2.6"], ["ws", "8.20.1"],
  ])("rejects a vulnerable nested %s@%s", (name, version) => {
    const result = check({ [`node_modules/parent/node_modules/${name}`]: { version } });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("below the security minimum");
  });

  it("does not mistake a prerelease for a reviewed patched release", () => {
    expect(check({ "node_modules/ws": { version: "8.21.0-rc.1" } }).status).not.toBe(0);
  });

  it("continues to reject non-portable registry URLs", () => {
    expect(check({ "node_modules/ws": {
      version: "8.22.0", resolved: "https://private-registry.invalid/ws.tgz",
    } }).status).not.toBe(0);
  });
});
