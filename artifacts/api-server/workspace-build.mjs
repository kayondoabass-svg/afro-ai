// Preserve the external VPS's established complete release output, while
// exposing the API through the workspace's managed artifact entry point.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
execFileSync("pnpm", ["exec", "tsx", "script/build.ts"], {
  cwd: root, stdio: "inherit", env: process.env,
});
await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await writeFile(new URL("./dist/index.mjs", import.meta.url), `
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../../../", import.meta.url)));
process.env.AFRO_WORKSPACE_API_ONLY = "1";
await import("../../../dist/index.cjs");
`);
