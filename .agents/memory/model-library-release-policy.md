---
name: Model library release policy
description: Separating download verification, actual local execution and desktop platform certification
---

A successful checksum-verified model download is not a claim that its checkpoint
will load or produce useful answers within the desktop's timeout and resource limits.
Cross-packaging an official Electron runtime is not execution certification for
the target operating system.

**Why:** A pinned small Qwen checkpoint passed packaged Linux download/load/local
chat checks, while a much larger unquantized checkpoint encountered substantial
cold-disk I/O on the memory-constrained development host. Windows artifacts can
be built on Linux without actually running Windows.

**How to apply:** Keep download, checkpoint execution, answer quality, latency,
platform execution and installer signing as separate release claims. Label
unsigned/unverified developer packages plainly; never recommend disabling
security protections. Do not mark the entire runner roadmap complete after a
download-library milestone.
