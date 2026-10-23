// Fail before tests/builds if the lock is not portable or the install is incomplete.
const fs = require("node:fs");
const assert = require("node:assert/strict");

async function main() {
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  const socketMinimums = {
    "socket.io": [4, 8, 4],
    "socket.io-client": [4, 8, 4],
    "engine.io": [6, 6, 11],
    "engine.io-client": [6, 6, 7],
    "socket.io-adapter": [2, 5, 8],
    "socket.io-parser": [4, 2, 7],
    "ws": [8, 21, 0],
  };
  for (const [name, entry] of Object.entries(lock.packages)) {
    const packageName = name.split("node_modules/").at(-1);
    const minimum = socketMinimums[packageName];
    if (minimum) {
      const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(entry.version || "");
      assert.ok(version, `${name} must use a stable security-reviewed version`);
      const actual = version.slice(1).map(Number);
      const difference = actual.map((part, index) => part - minimum[index]).find(part => part !== 0) || 0;
      assert.ok(difference >= 0, `${name}@${entry.version} is below the security minimum ${minimum.join(".")}`);
    }
    if (!entry.resolved) continue;
    const url = new URL(entry.resolved);
    assert.equal(url.hostname, "registry.npmjs.org", `${name} uses a non-public registry`);
    assert.equal(url.protocol, "https:", `${name} uses an insecure registry URL`);
  }
  console.log("Lockfile registry check passed.");
  console.log("Socket.IO/WebSocket security minimums passed for every locked copy.");
  if (process.argv.includes("--lock-only")) return;
  const parse5 = await import("parse5");
  assert.equal(parse5.parse("<p>install check</p>").nodeName, "#document");
  const includesDev = (process.env.npm_config_include || "").split(/[\s,]+/).includes("dev");
  const omitsDev = (process.env.npm_config_omit || "").split(/[\s,]+/).includes("dev");
  if (!includesDev && (omitsDev || process.env.NODE_ENV === "production")) {
    console.log("parse5 runtime install smoke check passed (development dependencies omitted).");
    return;
  }
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<p>install check</p>");
  try {
    assert.equal(dom.window.document.querySelector("p").textContent, "install check");
  } finally {
    dom.window.close();
  }
  console.log("parse5 and jsdom install smoke check passed.");
}

main().catch((error) => {
  console.error("Dependency preflight failed:", error.message);
  process.exitCode = 1;
});
