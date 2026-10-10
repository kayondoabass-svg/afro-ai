# KEYO Studio: development scope and evidence

The user requested a downloadable open-source KEYO Studio LLM/SLM Runner with
our own inference engine. The supplied research is not permission to wrap an
existing engine, publish private weights, enable paid GPU jobs or claim a
market rank.

## First implementation

The isolated package is `packages/keyo-studio`. It has no npm dependencies.
Our own code implements typed-array matrix/vector arithmetic, GPT-Neo and
basic Qwen2/Llama transformer execution, grouped-query attention, rotary
positions, layer/RMS normalization, GELU/SiLU, per-generation KV cache, BPE,
sampling, safetensors decoding and worker-thread local inference.

Node's standard library supplies I/O, HTTP, worker threads and cryptography.
This is not an Ollama/llama.cpp/vLLM/ONNX/Transformers wrapper. An existing
open-weight model is not the same thing as a third-party inference engine.
No claims are made that the model architecture or weights were invented here.

Public Afro AI routes:
- `/keyo-studio`: source download and alpha requirements.
- `/api/keyo-studio/release`: real release manifest, file list and SHA-256.
- `/downloads/keyo-studio/afro-ai-keyo-studio-0.1.0-alpha.1.tgz`: code-only package.

Production builds package the runner into `dist/keyo-studio`. No model or
private credential is copied into the archive. Do not treat a public source
download as a native desktop installer or npm registry publication.

## Real-model smoke check

For development verification only, a public checkpoint was downloaded from
`ivnle/tinystories-lay4-hs128-hd2-1M`, pinned to repository revision
`08cbbe20f545fac1b3efb69bf8c1515d0f2946ea`. Its model card does not establish
a redistribution licence. The files therefore remain excluded test artifacts
and are **not** bundled, republished or recommended as a licensed release model.

Local prompt: `Once upon a time`.
Greedy 16-token output:
`, there was a little girl named Lily. She loved to play outside in the`

The reference is a small Llama-architecture story model, **not** the private
Afro AI fine-tune or Keyo SLM v2. This proves local execution of that checkpoint,
not chat quality, language coverage, other families' pretrained compatibility,
parity with a reference engine, or production performance.

All computation for this check ran through our engine, without a provider
API, cloud inference credits or another inference runtime.

## Checks

`npm --prefix packages/keyo-studio test` checks analytical tensor math,
tokenization, data-only checkpoint validation, transformer/cache behavior,
request handling, actual worker execution, auth, origin/Host rejection and SSE.
Unit fixtures are explicitly synthetic. Root tests remain independently scoped.

## Remaining product work

1. Independently compare full-layer/logit results against trusted reference
   calculations before certifying additional pretrained families/checkpoints.
2. Inspect/licence the existing Afro AI model; extend memory limits, sharding
   and variants only after correctness, cancellation and memory benchmarks.
3. Implement our own quantization/GGUF support and optimized CPU/GPU kernels.
4. Extend the implemented desktop workspace with verified, resumable model
   downloads and a licensed model registry. Current source has real IPC-backed
   generation, cancellation and private local conversation CRUD.
5. Test and sign platform-specific Linux/Windows/macOS installers and updates.
6. Add optional account/cloud services without breaking offline use.
7. Add the private “KEYO Studio runner studio” dashboard under Command Center:
   founder-controlled email invitations, viewer-only access by default, server
   authorization, and separate authorized/actively-viewing counts.
8. Add explicitly opt-in, off-by-default product analytics with a payload
   preview, retention/deletion controls and aggregate founder reporting. Do not
   collect prompts, history, user files, emails, secrets or raw crash dumps.
   Counts represent consenting installations, not every global/offline user.

These are genuine unfinished parts of the product, not claims about this alpha.
Do not start paid inference/training resources or publish private model weights
as a side effect of the developer release.

## Desktop and publication

The source now includes an Electron desktop workspace using the same own-engine
worker. It keeps Unix history files private, validates IDs, atomically saves
output and repairs interrupted generation status on restart. Renderer sandbox,
context isolation and allowlisted main-frame IPC remain enabled.
The web route `/keyo-studio/workspace/` is a deliberately non-executing interface
preview; production builds copy its assets into `dist/keyo-studio/workspace`.

`node scripts/keyo-export.mjs` prepares isolated GitHub and Hugging Face folders,
not an upload. See `keyo-studio-publishing.md` for safe publication commands.
