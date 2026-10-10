import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { sourceZip } from "./keyo-upload-zip";

export const KEYO_PUBLIC_LINKS = {
  github: "https://github.com/kayondoabass-svg/keyo-studio",
  huggingFace: "https://huggingface.co/spaces/kayondoabass/KEYO-Studio",
} as const;
export const KEYO_RELEASE_BUNDLE = "KEYO-Studio-0.1.0-alpha.1-release-files.zip";
export const KEYO_SOURCE_RELEASE = "KEYO-Studio-0.1.0-alpha.1-source.zip";
export const KEYO_RELEASE_NOTES = "KEYO-Studio-0.1.0-alpha.1-release-notes.md";
export const KEYO_CHECKSUMS = "KEYO-Studio-0.1.0-alpha.1-SHA256SUMS.txt";
export const KEYO_RELEASE_ASSETS = [KEYO_SOURCE_RELEASE, KEYO_RELEASE_NOTES, KEYO_CHECKSUMS, KEYO_RELEASE_BUNDLE];

export const keyoReleaseNotes = `# KEYO Studio v0.1.0-alpha.1

**Developer alpha · Source-only prerelease · MIT code licence**

Ugandan-built by KEYO Technologies. A local LLM/SLM runner with our own
JavaScript CPU transformer engine, not an Ollama, llama.cpp or vLLM wrapper.

## Included
- CLI for model inspection, local generation and an authenticated localhost API.
- Electron desktop workspace source with local conversation history.
- Basic GPT-Neo, Qwen2 and Llama execution for explicitly supported variants.
- Safetensors F32/F16/BF16 loading and byte-level BPE tokenization.
- Source tests passed on Linux, Windows and macOS with Node.js 22 and 24.
  This is test-suite coverage, not signed-installer certification.

## Requirements and limits
- CLI: Node.js >=20. Desktop development: Node.js >=22.12 and Electron.
- Supply a compatible model folder containing config.json, tokenizer.json and
  a single model.safetensors checkpoint. No model weights are included.
- Checkpoint and decoded weights each limited to 256 MiB.
- Context: 512 tokens. Maximum generated output: 128 tokens.
- A small public Llama checkpoint was smoke-tested. Existing Afro AI 2B,
  7B and 14B models are not certified for this alpha.

## Not included
GPU inference, GGUF/integer quantization, sharded checkpoints, training,
automatic model downloads, cloud inference or signed desktop installers.
There is no prompt telemetry or paid inference API.

## Download files
- afro-ai-keyo-studio-0.1.0-alpha.1.tgz: npm-installable source package.
- ${KEYO_SOURCE_RELEASE}: developer source, licence, tests and CI workflow.
- ${KEYO_CHECKSUMS}: SHA-256 checksums for these source files and these notes.

Install the CLI with:

    npm install -g ./afro-ai-keyo-studio-0.1.0-alpha.1.tgz
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
