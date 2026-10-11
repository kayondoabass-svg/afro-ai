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

**0.1.0-alpha.2 — developer CPU alpha, not a finished desktop application.**

Public source: https://github.com/kayondoabass-svg/keyo-studio

Release: https://github.com/kayondoabass-svg/keyo-studio/releases/tag/v0.1.0-alpha.2

Interface preview (not hosted inference): https://huggingface.co/spaces/kayondoabass/KEYO-Studio

An independent, open-source local inference engine associated with Afro AI.
Transformer computation, attention, KV cache, RoPE, normalization, sampling,
tokenization and model loading are implemented in this package.
No Ollama, llama.cpp, vLLM, ONNX or Transformers runtime is embedded or called.
There are no production dependencies beyond Node.js 20+.

## Install and run

Download the source package from the Afro AI `/keyo-studio` page:

```sh
npm install -g ./afro-ai-keyo-studio-0.1.0-alpha.2.tgz
keyo --help
keyo inspect /path/to/model
keyo chat /path/to/model --prompt "Once upon a time" --max-tokens 32
keyo serve /path/to/model --port 4317
```

Alternatively, run `node bin/keyo.mjs` from this source directory.
The package does **not** install Node or include model weights. First download
Node and compatible model files; model inference then works offline without
an Afro AI account, provider API key, inference credits or network access.

## Model compatibility: deliberately limited

The model directory needs `config.json`, `tokenizer.json`, and a single
`model.safetensors`. A single checkpoint can be **up to 4 GiB**. Above 256 MiB,
matrix weights remain on disk and are read through a shared 256 KiB scratch
buffer; normalization/bias vectors are capped at 8 MiB. This avoids allocating
the complete multi-gigabyte checkpoint or its float32 equivalent in process RAM.
Smaller files retain the 256 MiB decoded-memory limit. OS file cache, tokenizer,
activations and KV cache are additional memory, not included in the scratch cap.
Loading validates every tensor value and can take tens of seconds. Disk-backed
CPU generation can be slow: prefer short prompts and a small `max_tokens`.
Disk-backed library, CLI and API generation defaults to four output tokens
instead of 32; explicit requests remain capped at 128 and five minutes.
The desktop starts its output-token control at four as well.

## Next steps for SLM and LLM support

These are planned work, not capabilities of this release:

1. **Certify the current SLM first.** Evaluate the existing ~1.5B model with
   independent numerical checks, factual/structured-answer tests and recorded
   response timings. A successful greeting alone is insufficient.
2. **Make our engine faster.** Write KEYO native CPU/SIMD kernels and improve
   prefill/KV reuse; then add our own tested GPU backends. Do not replace the
   engine with another inference runtime.
3. **Load larger checkpoints safely.** Add validated sharded safetensors,
   indexing and hardware-aware budgets; test 3B, then 7B, then 14B independently.
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
computation is float32 with JavaScript-number accumulators.

Unsupported variants fail explicitly. No GGUF, integer quantization, sharded
checkpoints, scaled RoPE, sliding-window Qwen/Llama, unusual head dimensions,
arbitrary Jinja templates, tools, multimodal input, training or GPU kernels.
The existing Afro AI merged Qwen2 checkpoint can now be loaded through the
disk-backed engine. A real-checkpoint smoke check is not quality, performance
or numerical-parity certification. 7B/14B models remain unsupported.
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
