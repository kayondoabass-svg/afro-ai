# KEYO Studio LLM/SLM Runner

**Ugandan-built by KEYO Technologies**, adding an open-source local AI workspace
to the Afro AI product family. Global rank and African-first status are not yet
independently verified.

## Desktop workspace (developer alpha)

The source includes an Electron desktop interface using the same **KEYO CPU
engine**, not Electron for model inference and not another model runner.
Select a compatible model folder, create/rename/delete local conversations,
stream text completion or supported instruction chat, and cancel generation.
Conversations are saved in the current OS user's app-data folder, with restrictive
Unix directory/file permissions. Administrator access and Windows ACLs remain
subject to OS policies; history is not encrypted.

To develop the desktop app, use **Node.js >=22.12**, install this package's
development dependencies with `npm install`, then `npm run desktop`.
CLI/library use remains Node.js >=20 and has no runtime npm dependencies.
Electron is the desktop window framework; it is not a paid API or our inference engine.
An unsigned Linux portable package can be built with `npm run pack:linux`.
Windows/macOS installers and code signing have not yet been verified.

The hosted workspace is an **interface preview**, not browser inference:
browser-local conversation CRUD is real, but model selection/generation are
disabled. It does not read your device's model files or send prompts to our server.

**0.1.0-alpha.4 — developer CPU alpha, not a finished desktop application.**

Public source: https://github.com/kayondoabass-svg/keyo-studio

Latest published release: https://github.com/kayondoabass-svg/keyo-studio/releases

Interface preview (not hosted inference): https://huggingface.co/spaces/kayondoabass/KEYO-Studio

An independent, open-source local inference engine associated with Afro AI.
Transformer computation, attention, KV cache, RoPE, normalization, sampling,
tokenization and model loading are implemented in this package.
No Ollama, llama.cpp, vLLM, ONNX or Transformers runtime is embedded or called.
There are no production dependencies beyond Node.js 20+.

## Windows: download and first run

1. Open [the alpha.4 release](https://github.com/kayondoabass-svg/keyo-studio/releases/tag/v0.1.0-alpha.4).
   Download **KEYO-Studio-0.1.0-alpha.4-win32-x64.zip** (about 158 MB).
   [Alternate Hugging Face download](https://huggingface.co/spaces/kayondoabass/KEYO-Studio/resolve/main/KEYO-Studio-0.1.0-alpha.4-win32-x64.zip?download=true).
   Source-code, source.tgz, github-upload and release-files bundles are **not**
   the runnable Windows app. Both app download hosts provide the same ZIP;
   neither guarantees a particular download speed.
2. Wait until downloading finishes. Right-click the ZIP in Downloads →
   **Extract All** → **Extract**. Open the extracted folder and double-click
   **KEYO Studio.exe**. Keep all files together; do not run inside the ZIP.
   This is a portable app with no installer wizard or separate Node.js requirement.
3. Expand **Model library**, select **Qwen2.5 0.5B Instruct**, and click
   **Download model**. Review the licence and bandwidth confirmation.
   Stay connected until download and verification finish. The model is a
   separate download of about **1 GB**, not included in the Windows ZIP.
4. Click **Load downloaded model**, wait for loaded status, and create a new
   conversation. Send **2+2=? Reply with just the number.** Expect **4**.
   CPU generation may be slow. Start with 0.5B; 7B/14B operation is not certified.
5. Once downloaded and loaded, disconnect Wi-Fi and try another short question.
   No AI API key, inference credits or account is needed for local operation.
   Close and reopen to check saved conversations; reload the downloaded model
   if necessary. Internet is needed for new downloads, not local generation.

**If something goes wrong:** no EXE usually means you downloaded a source bundle.
For a slow download, try your browser's pause/resume when supported. If changing
hosts, start a fresh file rather than combining partial files. For a Windows
warning, missing DLL or launch failure, report the exact message and Windows
version. This is an **unsigned developer build**, not Windows execution
certification. **Do not disable antivirus or other security protections.**
Verify the archive using the release's desktop SHA256SUMS file when needed.

## Developer CLI: install and run

Download the source package from the Afro AI `/keyo-studio` page:

```sh
npm install -g ./afro-ai-keyo-studio-0.1.0-alpha.4.tgz
keyo --help
keyo models
keyo download qwen25-05b-instruct --accept-license apache-2.0
keyo inspect /path/to/model
keyo chat /path/to/model --prompt "2+2=? Reply with just the number." --max-tokens 4
keyo serve /path/to/model --port 4317
```

Alternatively, run `node bin/keyo.mjs` from this source directory.
The package does **not** install Node or include model weights. First download
Node, then explicitly download a catalogue model or provide your own files.
Model inference then works offline without
an Afro AI account, provider API key, inference credits or network access.

### Download and run in the desktop app

Download the **Windows x64 portable ZIP** or **Linux x64 archive** from the
release's assets. Extract the **entire archive**, then open `KEYO Studio.exe`
(Windows) or `keyo-studio` (Linux). No separate Node installation is needed
in the desktop package. These are **unsigned developer packages**, not
certified production installers. Windows execution is not certified by the
Linux build host; do not disable security software to work around warnings.

1. Expand **Model library** and select **Qwen2.5 0.5B Instruct** for your first test.
2. Click **Download model**, review its Apache-2.0 licence and accept the download.
   This downloads approximately 0.93 GiB from Hugging Face. Internet/data charges
   may apply; there is no paid inference API.
3. Wait for checksum verification, then click **Load downloaded model**.
4. Create a conversation and send a short prompt. Instruction models use chat mode.
5. After download, generation is local and does not require Internet access.

The library pins an immutable upstream commit plus SHA-256 and exact size for
every file. Downloads can be cancelled and resumed; complete models are committed
only after validation. A free-space check runs before downloads. Managed deletion
requires confirmation, preserves conversations and refuses unrelated files.
The CLI's managed library lives in `~/.keyo-studio/models`; the desktop uses
its OS-specific private application-data folder. CLI and desktop stores are separate.
`keyo remove-model MODEL_ID --confirm` deletes only the matching managed model.

The Qwen2.5 7B entry is experimental and downloads approximately 14.2 GiB.
Do not interpret a successful download as broad quality, speed or Windows
certification. There is no general GGUF, GPU, quantization or 14B certification.

## Model compatibility: deliberately limited

The model directory needs `config.json`, `tokenizer.json`, and either
`model.safetensors` or an indexed set of shards (not both). A single checkpoint can be **up to 4 GiB**. Above 256 MiB,
matrix weights remain on disk and are read through a shared 256 KiB scratch
buffer; normalization/bias vectors are capped at 8 MiB. This avoids allocating
the complete multi-gigabyte checkpoint or its float32 equivalent in process RAM.
Smaller files retain the 256 MiB decoded-memory limit. OS file cache, tokenizer,
activations and KV cache are additional memory, not included in the scratch cap.
Loading validates every tensor value and can take tens of seconds. Disk-backed
CPU generation can be slow: prefer short prompts and a small `max_tokens`.
Disk-backed library, CLI and API generation defaults to four output tokens
instead of 32; explicit requests remain capped at 128 and five minutes.
The desktop library sets four output tokens for models larger than 1B and
32 for smaller models. You may reduce the limit further for your first test.

### Experimental sharded checkpoints

Supply `model.safetensors.index.json` with a complete `weight_map` and
`metadata.total_size` (payload bytes). Shard filenames must be flat `.safetensors`
names in that same folder. Missing/extra/duplicate tensors, symlinks, unsafe paths
and false size declarations are rejected. Limits: 128 shards, 8 GiB per shard,
32 GiB total files, 64 GiB decoded-equivalent dimensions, 8 MiB resident vectors
across all shards. Each shard uses a 256 KiB scratch buffer. Model load timeout
is five minutes. Context/output limits remain unchanged.

Synthetic sharded execution is tested. **Actual 7B/14B checkpoints are not yet
certified**, and disk streaming alone does not establish usable generation speed.

### Optional KEYO native CPU kernel

Our own C++/Node-API kernel accelerates disk-backed F32/FP16/BF16 matrix blocks.
It is not a wrapper around another inference runtime, and does not provide GPU,
SIMD-specific kernels or integer quantization. Other transformer operations
remain in the inspectable JavaScript engine.

On Linux/macOS, install a C++ compiler and Node development headers, then:

```bash
node native/build.mjs /path/to/include/node
KEYO_CPU_KERNEL=native node bin/keyo.mjs inspect /path/to/model
KEYO_CPU_KERNEL=native node bin/keyo.mjs chat /path/to/model --prompt "Hello"
node bin/validate.mjs /path/to/model ./new-local-report.json native --parity
```

The selected kernel is returned in model metadata. Missing or incompatible native
builds fail explicitly; there is no automatic fallback when native mode is requested.
The default remains JavaScript. Windows native builds and signed installers are
not provided. Compiled native binaries are excluded from source releases.
The validation tool records two short instruction checks, first-token timing,
memory and optional full-vocabulary single-step parity. It is not a broad
quality benchmark. Reports stay local, are created with private permissions,
and existing reports are never overwritten.

In a Linux/Node 20 development check, the existing approximately 1.5B Qwen2
checkpoint passed greeting and basic-arithmetic smoke checks. One full
transformer step took 5.21 seconds in JavaScript and 1.32 seconds in native mode,
with exact agreement across 151,665 logits. This approximately 4x single-step
result is not a general speed guarantee. First-token times were about 10 seconds
for the greeting and 25 seconds for the arithmetic prompt; loading remained slow.
Independent two-layer causal-sequence references also test GPT-Neo, Qwen2 and
Llama fixtures with nonzero projections, grouped-query attention and local masks.

## Next steps for SLM and LLM support

The following work remains; experimental native CPU and indexed-shard foundations
are now implemented, but larger checkpoints still need independent validation:

1. **Certify the current SLM first.** Evaluate the existing ~1.5B model with
   independent numerical checks, factual/structured-answer tests and recorded
   response timings. A successful greeting alone is insufficient.
2. **Make our engine faster.** Write KEYO native CPU/SIMD kernels and improve
   prefill/KV reuse; then add our own tested GPU backends. Do not replace the
   engine with another inference runtime.
3. **Validate larger checkpoints safely.** Test experimental indexed-shard
   loading and hardware budgets with actual 3B, then 7B, then 14B checkpoints.
4. **Reduce memory use with our own quantized execution.** Implement and
   validate 8-bit/4-bit loaders and kernels against floating-point references.
   Do not claim GGUF support until its parser and supported architectures work.
5. **Expand architecture and context support.** Validate each tokenizer,
   chat template, attention/RoPE variant, EOS behaviour and bounded KV cache.
   Increase context only after correctness and memory tests.
6. **Prepare the right weights.** A 1.5B checkpoint cannot be enlarged into
   14B by changing configuration. Select a licensed larger base and, if needed,
   fine-tune it separately. Existing small-model adapters are not transferable
   by assumption. Private weights stay private unless publication is approved.
7. **Finish developer delivery.** Add checksum-verified resumable model
   downloads, test CLI/API streaming and cancellation, and ship tested desktop
   installers for Windows/macOS/Linux with appropriate signing.
8. **Add opt-in diagnostics.** Keep collection off by default and inference
   usable offline; report only privacy-safe aggregates for consenting installs,
   with no prompts, history, secrets or raw crash dumps.

Implemented architectures: basic GPT-Neo (`gelu_new`), Qwen2, and Llama
(`silu`, conventional full-head RoPE), including grouped-query attention.
Only unnormalized or NFC byte-level BPE tokenizers with supported splitting rules
are accepted. Floating-point F32/F16/BF16 checkpoint data is supported;
computation uses float32 values with double-precision accumulators.

Unsupported variants fail explicitly. No GGUF, integer quantization,
scaled RoPE, sliding-window Qwen/Llama, unusual head dimensions,
arbitrary Jinja templates, tools, multimodal input, training or GPU kernels.
The existing Afro AI merged Qwen2 checkpoint can now be loaded through the
disk-backed engine. A real-checkpoint smoke check is not quality, performance
or comprehensive numerical-parity certification. Actual 7B/14B models remain uncertified.
Architecture implementation is not certification of every model in that family.
Maximum context: 512 tokens; maximum output: 128; default generation: greedy.
Pure JavaScript CPU execution is an inspectable correctness baseline, not yet
competitive with optimized native/GPU engines.

The CLI `chat --prompt` command is text continuation. Instruction chat is only
supported by the API when a Qwen ChatML or Llama-3-style control-token template
can be identified. Base models return an explicit error for chat requests.

Obtain models from their owners, check their licences and verify file digests.
No pickle, remote repository code, automatic model download or cloud fallback
is used. Open weights do not necessarily carry a permissive redistribution licence.

## Local API

The server binds **only to 127.0.0.1**. Every endpoint requires a Bearer token.
By default the CLI creates `~/.keyo-studio/api-token`, with private Unix file
permissions. Windows users must also secure this directory through Windows ACLs.
Alternatively supply `KEYO_API_TOKEN` through your machine's secret environment.
The runner never prints the token. Do not put credentials in committed files.

```sh
export KEYO_API_TOKEN="$(cat "$HOME/.keyo-studio/api-token")"
curl http://127.0.0.1:4317/v1/completions \
  -H "Authorization: Bearer $KEYO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Once upon a time","max_tokens":32,"temperature":0}'
```

Endpoints:
- `GET /health`: authenticated model/worker readiness.
- `GET /v1/models`: the one loaded local model.
- `POST /v1/completions`: bounded string prompt.
- `POST /v1/chat/completions`: supported instruction templates only.

Fields: `model`, `prompt` OR `messages`, `max_tokens`, `temperature`, `top_k`,
`seed`, `stream`. Unknown options are rejected rather than silently ignored.
Use `stream:true` for SSE, ending with `[DONE]`. Stream errors are explicit
error events, not successful generated answers. This is a documented subset,
**not complete OpenAI API compatibility**.

One generation runs at a time; concurrent requests return 409. A worker thread
keeps the HTTP event loop responsive. Disconnects cancel computation through
shared memory; each request has a 60-second computation deadline for resident
weights, or a five-minute deadline for disk-backed weights.
No browser CORS access is enabled in the alpha. A future local desktop UI must
establish its own explicit origin and credential policy.

## Development and releases

```sh
npm test
npm pack --ignore-scripts
```

These tests use small, explicitly synthetic checkpoints to check numerical
operations, tokenization, real worker execution and security; they do not
establish useful pretrained model quality. Real-model smoke checks and their
provenance are documented separately by the Afro AI project.

Linux is the first validation target. A source/npm download is **not** a
Windows/macOS executable or a Tauri installer. Those, optimized kernels,
quantization, broader model certification, registry downloads and optional
cloud services remain future work. The desktop workspace exists in source;
that does not certify cross-platform installers.

Local generation makes no outbound requests and collects no telemetry.
No paid subscriptions, inference endpoints or publishing jobs are started by
this package. “First in Africa” and market-rank claims have not been verified.

MIT applies only to this package's code. Model licences and the existing
Afro AI platform are separate. See `LICENSE` and `SECURITY.md`.
