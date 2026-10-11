import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { sourceZip } from "./keyo-upload-zip";
import { KEYO_VERSION } from "../packages/keyo-studio/src/version.mjs";

export const KEYO_PUBLIC_LINKS = {
  github: "https://github.com/kayondoabass-svg/keyo-studio",
  githubRelease: `https://github.com/kayondoabass-svg/keyo-studio/releases/tag/v${KEYO_VERSION}`,
  huggingFace: "https://huggingface.co/spaces/kayondoabass/KEYO-Studio",
} as const;
export const KEYO_RELEASE_BUNDLE = `KEYO-Studio-${KEYO_VERSION}-release-files.zip`;
export const KEYO_SOURCE_RELEASE = `KEYO-Studio-${KEYO_VERSION}-source.zip`;
export const KEYO_RELEASE_NOTES = `KEYO-Studio-${KEYO_VERSION}-release-notes.md`;
export const KEYO_CHECKSUMS = `KEYO-Studio-${KEYO_VERSION}-SHA256SUMS.txt`;
export const KEYO_RELEASE_ASSETS = [KEYO_SOURCE_RELEASE, KEYO_RELEASE_NOTES, KEYO_CHECKSUMS, KEYO_RELEASE_BUNDLE];

export const keyoReleaseNotes = `# KEYO Studio v${KEYO_VERSION}

**Developer alpha · Unsigned desktop packages and source · MIT code licence**

Ugandan-built by KEYO Technologies. A local LLM/SLM runner with our own
JavaScript CPU transformer engine, not an Ollama, llama.cpp or vLLM wrapper.

## Included
- CLI for model inspection, local generation and an authenticated localhost API.
- Electron desktop workspace source with local conversation history.
- Pinned public model catalogue with licence consent, verified downloads,
  progress, cancellation/resume, private local storage and confirmed deletion.
- Desktop download → load → local chat flow. Models are not bundled.
- Windows x64 portable ZIP and Linux x64 archive attached separately when built.
  Unsigned developer builds: see package metadata for execution-verification status.
- Basic GPT-Neo, Qwen2 and Llama execution for explicitly supported variants.
- Safetensors F32/F16/BF16 loading and byte-level BPE tokenization.
- Experimental indexed shards with strict path, tensor and size checks.
- Optional KEYO-owned C++ CPU block kernel, explicitly selected; source only.
- Local instruction-smoke/benchmark tool with optional JavaScript/native parity.
- CI checks the source suite on Linux, Windows and macOS with Node.js 22 and 24.
  Check the run for this release; CI is not signed-installer certification.

## Requirements and limits
- CLI: Node.js >=20. Desktop development: Node.js >=22.12 and Electron.
- Supply a compatible model folder containing config.json, tokenizer.json and
  model.safetensors or model.safetensors.index.json and its shards, or explicitly
  download a pinned model through the library. No model weights are included.
- Single-file checkpoints up to 4 GiB; above 256 MiB, matrices stay on disk and
  are read through a bounded 256 KiB buffer. Resident vectors are capped at 8 MiB.
- Indexed checkpoints: 8 GiB per shard, 32 GiB total, at most 128 shards.
  Each shard has a 256 KiB scratch buffer; the 8 MiB vector cap is shared.
- Native source builds: Linux/macOS with C++ and Node development headers.
- First desktop test: extract the entire archive, open KEYO Studio, expand
  Model library, select Qwen2.5 0.5B, accept the licence/download, then Load downloaded model.
  Create a conversation and ask a short question. Prompts stay local.
  Windows uses JavaScript. Native operation is opt-in, without silent fallback.
- NFC byte-level BPE, exact literal added tokens and modern default RoPE settings.
- Existing Afro AI checkpoint support is a CPU smoke check, not certification
  of quality, speed, all Qwen variants or 7B/14B support.
- Context: 512 tokens. Maximum generated output: 128 tokens.
- A small public Llama checkpoint and the existing merged Afro AI Qwen2
  checkpoint have been smoke-tested. This does not establish numerical parity,
  useful chat quality, production performance or 7B/14B support.

## Not included
GPU inference, GGUF/integer quantization, certified 7B/14B execution, training,
automatic model downloads, cloud inference or signed desktop installers.
There is no prompt telemetry or paid inference API.

## Download files
- afro-ai-keyo-studio-${KEYO_VERSION}.tgz: npm-installable source package.
- ${KEYO_SOURCE_RELEASE}: developer source, licence, tests and CI workflow.
- ${KEYO_CHECKSUMS}: SHA-256 checksums for these source files and these notes.

Install the CLI with:

    npm install -g ./afro-ai-keyo-studio-${KEYO_VERSION}.tgz
    keyo inspect /path/to/model
    keyo chat /path/to/model --prompt "Hello"

The code licence does not grant rights to third-party model weights.

## Public links
- GitHub: ${KEYO_PUBLIC_LINKS.github}
- Hugging Face: ${KEYO_PUBLIC_LINKS.huggingFace}

The Hugging Face Space is a browser-local interface preview and source
download. Model loading and generation are deliberately disabled there.
`;

export async function prepareReleaseAssets(directory: string, packageName: string, tgz: Buffer, zip: Buffer) {
  const files = [
    { name: packageName, data: tgz },
    { name: KEYO_SOURCE_RELEASE, data: zip },
    { name: KEYO_RELEASE_NOTES, data: Buffer.from(keyoReleaseNotes) },
  ];
  const checksum = files.map(file => `${createHash("sha256").update(file.data).digest("hex")}  ${file.name}`).join("\n") + "\n";
  files.push({ name: KEYO_CHECKSUMS, data: Buffer.from(checksum) });
  const bundle = sourceZip(files);
  for (const file of files) await writeFile(path.join(directory, file.name), file.data);
  await writeFile(path.join(directory, KEYO_RELEASE_BUNDLE), bundle);
  return [...files, { name: KEYO_RELEASE_BUNDLE, data: bundle }].map(file => ({
    filename: file.name, bytes: file.data.length,
    sha256: createHash("sha256").update(file.data).digest("hex"),
    downloadUrl: `/downloads/keyo-studio/${file.name}`,
  }));
}
