# KEYO portable release: 0.2.0-alpha.2

The patch preserves the engine and pinned weights tested in alpha.1. It fixes
offline static-file cache matching on hosts that send `Vary: Origin`; the browser
regression server now sends that header too. Existing release bytes are not
replaced. The APK remains a debug-signed development build.

## What is built

The portable React/Vite application is separate from the Afro AI platform and
from the existing Electron desktop. Capacitor packages the same local web
runtime for Android; it does not replace the inference engine.

The transformer, byte-level tokenizer, F32/F16/BF16 decoding and bounded CPU
matrix operations are KEYO code. No ONNX, Transformers.js, llama.cpp, Ollama or
paid inference is used. The Node loader is a separate adapter, preserving CLI,
HTTP and Electron consumers.

OPFS holds pinned model files; IndexedDB holds conversations. No model bytes
are placed in localStorage. Checksums are streamed before every model load.
Licence consent precedes download/import; interrupted downloads resume only
after rehashing their existing bytes and validating the Range response.
Storage operations and open inference handles use the same cross-tab lock.

Stopping or backgrounding terminates the worker immediately, rejects stale
events and marks unfinished output interrupted. Model files stay installed;
reload the model to continue. This avoids relying on SharedArrayBuffer or
cross-origin isolation, which are not reliably available on every hosting path.

The browser production build precaches its app shell and worker bundles. Native
assets are bundled in the APK. Model downloads need Internet once; installed
models can run offline after an app restart.

## Numerical evidence (Linux host, not phone performance)

Independent NumPy full-sequence causal-attention reference versus KEYO's
bounded portable reader, prompt `Hello world`, all vocabulary logits at both
positions:

| Public immutable checkpoint | Compared logits | Max absolute error | Out of tolerance |
|---|---:|---:|---:|
| Qwen2.5 0.5B Instruct | 303,872 | 0.00027848 | 0 |
| SmolLM2 135M Instruct (Llama architecture) | 98,304 | 0.00006938 | 0 |

Tolerance: `0.001 + 0.0001 * abs(reference)`, element by element.
Generation for `Say hello.`, eight output tokens: Qwen produced
`Hello! How can I assist you today`, SmolLM2 produced
`Hello! I'm here to help you`. These short samples are not broad quality claims.

Observed single-run portable-reader timings on this shared Linux host:
SmolLM2 two-token forward 4.52 s; full 33-token chat prefill plus eight outputs
27.86 s; process RSS about 132 MB.
Qwen two-token forward 22.44 s; 11-token prefill plus eight outputs 52.50 s;
process RSS about 187 MB. RSS is process memory, not peak Android/WebView memory.
Shared-host timings are not reproducible phone speed guarantees.

Reproduce with Python + `test/requirements.txt`, then:

    node packages/keyo-studio/test/public-check.mjs MODEL_DIR OUTPUT_JSON

Full reports belong in ignored generated-artifacts, not release source.
The checkpoint revisions and SHA-256 manifests are in the portable catalogue.
No third-party weights are included in the release.

## Android build and limits

JDK 21, Android SDK 36, Capacitor 8:

    pnpm --filter @workspace/keyo-mobile run build
    cd artifacts/keyo-mobile
    pnpm exec cap sync android
    cd android
    ./gradlew assembleDebug

Generated APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
It is debug-signed for development, not a production signing identity or
Google Play release. Compilation does not certify on-device model execution,
WebView storage persistence, thermal behavior, battery usage or phone latency.
No physical Android device was available in this workspace.

The portable CPU path supports only the two pinned catalogue variants tested
here. Llama architecture support does not mean all Meta Llama models are
supported. Gemma/Phi, GPU/WebGPU, WASM/SIMD and integer/low-bit quantization are
not implemented or advertised as working. F16/BF16 are floating-point formats,
not a substitute for integer quantization. No speed-up claim is made.

Context remains 512 tokens including template/history/output; output max 128.
Scratch reads are bounded to 256 KiB, resident normalization vectors to 8 MiB.
Each generation has a five-minute deadline; Stop remains available immediately.
Local storage is not encrypted and may be removed by the browser or OS.

## Publication integrity

Existing desktop archives remain v0.1.0-alpha.5, unchanged. Portable source and
Android development artifacts have a new version; never rename old desktop
archives into this version. GitHub/Hugging Face/website mirrors must serve the
same verified release bytes. A Git push is not proof the VPS has deployed.
Public source exports use an allowlist and exclude platform code, model
weights, credentials, keystores, local SDK paths, caches and build directories.

The isolated portable UI's install audit reported five moderate development-tool
findings through xcode/uuid and typography/selector-parser. These are not browser
inference dependencies; they remain explicitly deferred rather than described as
fixed. Do not run a broad `audit fix --force` against the Afro AI platform to
address a portable build-tool chain.
