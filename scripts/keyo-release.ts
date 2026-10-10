import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const exec = promisify(execFile);
export const KEYO_VERSION = "0.1.0-alpha.1";
export const KEYO_FILENAME = `afro-ai-keyo-studio-${KEYO_VERSION}.tgz`;

export async function buildKeyoRelease(root = process.cwd()) {
  const directory = path.join(root, "dist", "keyo-studio");
  await mkdir(directory, { recursive: true });
  const { stdout } = await exec("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", directory], {
    cwd: path.join(root, "packages", "keyo-studio"), timeout: 30000, maxBuffer: 1024 * 1024
  });
  const [result] = JSON.parse(stdout);
  if (result.filename !== KEYO_FILENAME || result.version !== KEYO_VERSION) throw new Error("KEYO package version does not match the release contract.");
  const files: string[] = result.files.map((file: {path: string}) => file.path);
  const permitted = (file: string) =>
    ["package.json", "README.md", "CONTRIBUTING.md", "LICENSE", "SECURITY.md", "bin/keyo.mjs"].includes(file) ||
    /^src\/[a-z-]+\.mjs$/.test(file) ||
    /^test\/[a-z-]+(?:\.test)?\.mjs$/.test(file) ||
    /^desktop\/[a-z-]+\.(?:mjs|cjs|md)$/.test(file) ||
    /^desktop\/renderer\/[a-z-]+\.(?:html|css|mjs|svg)$/.test(file);
  if (!files.every(permitted) || !files.includes("src/engine.mjs")) throw new Error("Unexpected files in KEYO distribution; refusing publication.");
  const bytes = await readFile(path.join(directory, KEYO_FILENAME));
  const manifest = {
    name: "KEYO Studio LLM/SLM Runner",
    version: KEYO_VERSION,
    stage: "developer-alpha",
    license: "MIT (this package's code only)",
    runtime: "Node.js >=20",
    desktopDevelopmentRuntime: "Node.js >=22.12 + Electron; dependencies are not bundled in this source archive",
    desktopInterfacePreview: "/keyo-studio/workspace/",
    engine: "Independent JavaScript CPU transformer implementation",
    dependencyCount: 0,
    downloadUrl: `/downloads/keyo-studio/${KEYO_FILENAME}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    files,
    implementedArchitectures: ["gpt_neo", "qwen2", "llama"],
    pretrainedSmokeCheckedArchitectures: ["llama"],
    existingAfroModelCertified: false,
    limits: { checkpointMiB: 256, decodedWeightsMiB: 256, contextTokens: 512, outputTokens: 128 },
    modelWeightsIncluded: false,
    requiresPaidApi: false,
    telemetry: false,
    validatedReleaseTarget: "Linux Node CLI and desktop source; not a signed cross-platform installer",
    notIncluded: ["GPU inference", "GGUF", "integer quantization", "sharded weights", "signed Windows/macOS installers", "training", "automatic model downloads", "cloud billing"],
    documentation: "/keyo-studio",
  };
  await writeFile(path.join(directory, "release.json"), JSON.stringify(manifest, null, 2));
  await cp(path.join(root,"packages/keyo-studio/desktop/renderer"),path.join(directory,"workspace"),{recursive:true});
  return manifest;
}
