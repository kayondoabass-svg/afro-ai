import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, cp, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { KEYO_GIT_EXTRAS, KEYO_UPLOAD_FILENAME, KEYO_SPACE_UPLOAD_FILENAME, sourceZip } from "./keyo-upload-zip";
import { KEYO_PUBLIC_LINKS, prepareReleaseAssets } from "./keyo-release-assets";

const exec = promisify(execFile);
import { KEYO_VERSION } from "../packages/keyo-studio/src/version.mjs";
export { KEYO_VERSION };
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
    /^src\/[a-z-]+\.mjs$/.test(file) || file === "src/version.d.mts" ||
    /^test\/[a-z-]+(?:\.test)?\.mjs$/.test(file) ||
    /^desktop\/[a-z-]+\.(?:mjs|cjs|md)$/.test(file) ||
    /^desktop\/renderer\/[a-z-]+\.(?:html|css|mjs|svg)$/.test(file);
  if (!files.every(permitted) || !files.includes("src/engine.mjs")) throw new Error("Unexpected files in KEYO distribution; refusing publication.");
  const bytes = await readFile(path.join(directory, KEYO_FILENAME));
  const uploadFiles = await Promise.all(files.map(async name => {
    const file = path.join(root, "packages", "keyo-studio", name);
    if (!(await lstat(file)).isFile()) throw new Error("Non-regular source file refused.");
    return { name, data: await readFile(file) };
  }));
  for (const [name, content] of Object.entries(KEYO_GIT_EXTRAS)) uploadFiles.push({ name, data: Buffer.from(content) });
  const zip = sourceZip(uploadFiles);
  await writeFile(path.join(directory, KEYO_UPLOAD_FILENAME), zip);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const spaceFiles = await Promise.all(["index.html", "style.css", "app.mjs", "bridge.mjs"].map(async name => {
    const file = path.join(root, "packages", "keyo-studio", "desktop", "renderer", name);
    if (!(await lstat(file)).isFile()) throw new Error("Non-regular Space asset refused.");
    let data = await readFile(file);
    if (name === "index.html") data = Buffer.from(data.toString().replace("</body>",
      `<footer class="notice"><a href="./${KEYO_FILENAME}" download>Download KEYO Studio source — developer alpha</a></footer>\n</body>`));
    return { name, data };
  }));
  spaceFiles.push({ name: KEYO_FILENAME, data: bytes });
  spaceFiles.push({ name: "LICENSE", data: await readFile(path.join(root, "packages", "keyo-studio", "LICENSE")) });
  spaceFiles.push({ name: "README.md", data: Buffer.from(`---
title: KEYO Studio
sdk: static
app_file: index.html
license: mit
colorFrom: green
colorTo: yellow
short_description: Ugandan-built local AI runner — preview and source
---

# KEYO Studio — KEYO Technologies, Uganda

Open-source local LLM/SLM runner with our own CPU engine.
This Space is an **interface preview and source download**, not cloud/browser inference.
Conversation creation, editing and deletion are browser-local. Model selection and
generation are disabled here; install the desktop source on your device to run models.

[Download the developer-alpha source](./${KEYO_FILENAME})

SHA-256: \`${sha256}\`

CLI: Node >=20. Desktop development: Node >=22.12 and Electron.
Current limits: one checkpoint up to 4 GiB, bounded-memory disk-backed CPU loading
above 256 MiB, 512 context tokens and 128 output tokens. No GPU, GGUF or 7B/14B support.
Larger models, GPU inference and signed Windows/macOS installers are unfinished.
No model weights, credentials, paid API or telemetry are included.

GitHub: ${KEYO_PUBLIC_LINKS.github}
Developer prerelease: ${KEYO_PUBLIC_LINKS.githubRelease}
The archive above contains the complete developer-alpha package.
MIT covers our code only, not third-party
model weights. Listing on Hugging Face does not automatically generate payments.
`) });
  const spaceZip = sourceZip(spaceFiles);
  await writeFile(path.join(directory, KEYO_SPACE_UPLOAD_FILENAME), spaceZip);
  const releaseAssets = await prepareReleaseAssets(directory, KEYO_FILENAME, bytes, zip);
  const manifest = {
    name: "KEYO Studio LLM/SLM Runner",
    version: KEYO_VERSION,
    stage: "developer-alpha",
    publicLinks: KEYO_PUBLIC_LINKS,
    releaseAssets,
    license: "MIT (this package's code only)",
    runtime: "Node.js >=20",
    desktopDevelopmentRuntime: "Node.js >=22.12 + Electron; dependencies are not bundled in this source archive",
    desktopInterfacePreview: "/keyo-studio/workspace/",
    engine: "Independent JavaScript CPU transformer implementation",
    dependencyCount: 0,
    downloadUrl: `/downloads/keyo-studio/${KEYO_FILENAME}`,
    sha256,
    bytes: bytes.length,
    files,
    manualUpload: {
      filename: KEYO_UPLOAD_FILENAME,
      downloadUrl: `/downloads/keyo-studio/${KEYO_UPLOAD_FILENAME}`,
      bytes: zip.length,
      sha256: createHash("sha256").update(zip).digest("hex"),
      files: uploadFiles.map(file => file.name),
    },
    huggingFaceUpload: {
      filename: KEYO_SPACE_UPLOAD_FILENAME,
      downloadUrl: `/downloads/keyo-studio/${KEYO_SPACE_UPLOAD_FILENAME}`,
      bytes: spaceZip.length,
      sha256: createHash("sha256").update(spaceZip).digest("hex"),
      files: spaceFiles.map(file => file.name),
    },
    implementedArchitectures: ["gpt_neo", "qwen2", "llama"],
    pretrainedSmokeCheckedArchitectures: ["llama"],
    existingAfroModelCertified: false,
    limits: { checkpointMiB: 4096, residentCheckpointMiB: 256,
      diskScratchKiB: 256, residentVectorsMiB: 8, contextTokens: 512, outputTokens: 128,
      diskGenerationTimeoutSeconds: 300 },
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
