# Security

The desktop renderer is sandboxed with context isolation and no Node integration.
Its preload exposes only named model/conversation operations, authorized against
the owning main frame. Navigation, new windows, permissions and network requests
are blocked. It uses IPC rather than opening the CLI API to browser origins.
Only data-only model assets are loaded; imported checkpoints never supply code.
Conversation files are local to the OS user. Unix directories/files use 0700/0600;
history is not encrypted and does not protect against OS administrators.

This is an experimental local runner, not a hardened multi-tenant cloud service.

- Bind is restricted to loopback; Host headers are checked.
- All routes require a Bearer credential. Browser Origins are denied.
- Requests and model metadata are bounded; one generation runs at a time.
- Safetensors is data-only. Python pickle, external model code and dynamic
  tokenizer regular-expression execution are not supported.
- Weight and decoded-tensor limits reduce but do not eliminate memory pressure.
- Model files can still be malicious, corrupt, wrongly labelled or unlicensed.
  Use trusted sources and check digests. Do not run this as root.
- Keep API credentials and chats private. The engine does not store chats,
  collect telemetry, call providers, or enable public network access.
- A generation worker is not an operating-system sandbox. Do not expose this
  alpha as a public inference service or equate local authentication with
  container/process isolation.
- Windows filesystem ACLs must be configured separately. Node's Unix mode bits
  are not an adequate Windows permissions guarantee.

For a security report, contact the Afro AI maintainers privately before
publishing exploit details. No third-party model licence is granted here.
