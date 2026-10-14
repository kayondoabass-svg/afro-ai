// Fail before tests/builds if the lock is not portable or the install is incomplete.
const fs = require("node:fs");
const assert = require("node:assert/strict");

async function main() {
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!entry.resolved) continue;
    const url = new URL(entry.resolved);
    assert.equal(url.hostname, "registry.npmjs.org", `${name} uses a non-public registry`);
    assert.equal(url.protocol, "https:", `${name} uses an insecure registry URL`);
  }
  console.log("Lockfile registry check passed.");
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
