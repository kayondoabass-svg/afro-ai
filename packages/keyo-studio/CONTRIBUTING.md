# Contributing to KEYO Studio

KEYO Studio is Ugandan-built by KEYO Technologies. The code is MIT licensed;
model weights have separate owners and licences. Contributions are welcome
from developers everywhere. African-first/global-rank claims are not verified.

## Develop

Use Node.js >=22.12 for desktop development; the CLI/engine support Node.js >=20.

```sh
npm install
npm test
npm run desktop
```

Tests use synthetic, explicitly untrained fixtures and actual worker threads.
Do not describe their output as trained-model quality. Desktop tests exercise
real engine loading, output persistence, cancellation, bounds and private files.

`npm run pack:linux` creates an unsigned Linux portable build in your system's
temporary `keyo-desktop-releases` folder. Run `node desktop/pack-linux.mjs PATH`
to choose a different output parent. Existing release folders are never erased.
A graphical Linux desktop and Electron's system libraries are required.

## Boundaries

- Keep our own inference implementation. Do not replace it with Ollama,
  llama.cpp, vLLM, Transformers or another ready-made inference runtime.
- Explicitly reject unsupported checkpoint features; never silently fall back
  to a provider, another engine, simulated output or a different model.
- Keep inference offline and desktop conversation history local.
- Preserve main-frame-only IPC, sandbox/context isolation, no Node in the
  renderer, and the CLI's strict loopback/Host/Origin/bearer rules.
- Keep 256 MiB decoded/disk checkpoint, 512-token context and 128-token output
  limits until larger limits have independent correctness/memory testing.
- Do not add private weights, API tokens, platform source, `.env` files or
  credentials to this repository, source packages or release archives.
- Report security problems privately to repository maintainers rather than
  publishing credentials or working exploits in an issue.

Submit a focused pull request with tests and a clear description. Larger-model,
quantization/GPU, model download, installer signing and training work requires
its own validation; passing small synthetic tests does not certify it.
