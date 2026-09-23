# Afro AI: weekly execution guide

## Goal and scope

Deliver a limited integrated pilot covering text, document retrieval, controlled tools, images, audio, and video. Evaluate independent hosting on DigitalOcean without Ollama. Do not promise full replacement of Gemini/OpenAI or self-hosting of every media capability within one week.

This document combines the agreed 15-item checklist with the supplied research. It is a saved execution guide, not authorization to purchase hardware, change production providers, expose services, or delete data.

### Reference research

Original supplied blueprint, preserved unchanged:
[Uploaded execution blueprint](../attached_assets/Pasted-Here-is-your-actionable-execution-blueprint-for-this-we_1790198004248.txt)

### Starting position

- A Qwen2.5-1.5B LoRA smoke test completed using three examples.
- The merged model was uploaded and an authenticated vLLM chat request succeeded.
- The endpoint has not been integrated as the app's provider in the work covered by this guide.
- Serving success is not evidence of production answer quality.
- Verify current infrastructure, app capabilities, and endpoint status before execution; these can change.

## Important corrections to the supplied research

1. **Prices are unverified estimates, not quotes.** Do not budget an always-on A100/H100 at $280–$350/month without a current provider quote and availability check. Calculate hourly rate × active hours × replicas, plus storage, network, taxes, and other services. Verify every media API price and its unit.
2. **No automatic 14B selection.** Test 7–8B and 14B candidates. African-language accuracy, tool reliability, and token speeds in the research are hypotheses, not benchmark results. Check exact model licenses and any inherited conditions.
3. **Memory figures require headroom.** Weight size is not total serving memory. Context length, concurrency, quantization overhead, and runtime all matter. A command loading ordinary weights does not automatically enable AWQ.
4. **Do not copy deployment commands blindly.** Pin a tested serving-engine version and model revision. Verify its actual CLI and benchmark commands. Do not use an unreviewed `latest` image, place keys in committed commands, or expose an unauthenticated model port.
5. **Preserve existing infrastructure.** Do not replace current storage, retrieval, database, or queues with Qdrant, pgvector, Redis, or Celery without first auditing what exists and establishing a need.
6. **Prompts are not security boundaries.** XML tags and classifiers can assist but cannot guarantee injection resistance. Enforce authorization, tool restrictions, and data isolation in server code.
7. **Hashes do not prove data is safe.** Hashes identify changes; signatures establish provenance from a key. Neither detects malicious or inaccurate examples without review.
8. **Approval must be enforced server-side.** A client confirmation field alone is insufficient. Bind approval to the authenticated user, exact action and arguments, expiry, and single execution.
9. **Alerts are not hard spending caps.** Add application-side budget checks and concurrency limits; account for already-running jobs. Do not assume provider notifications stop billing.
10. **Test safely.** Use harmless security probes in an isolated test environment. Never execute destructive examples on the live server. Treat 25 concurrent sessions, 1.5-second TTFT, and 80% language scores as proposed targets requiring agreed measurement methods.

## Execution order

Days are planning targets, not automatic deadlines. If a gate fails, resolve it or defer that feature rather than bypassing the gate.

### Day 1 — scope, inventory, and budget

#### 1. Confirm infrastructure and budget — DONE (initial review)

Marked complete at the user's request after the initial infrastructure/budget discussion. Current server: DigitalOcean, 1 GB RAM, 25 GB disk, FRA1, Ubuntu 24.04; its name indicates 1 vCPU. Current cost reported as $6/month, with a proposed $18/month website upgrade. This is not an approved GPU or media budget. The desired target is 10,000 simultaneous users, not a measured capacity.

**Carry-forward checks:** free disk, backups, live workloads, exact upgrade specifications, capacity/load tests, and separate inference/training/media quotes remain unverified. The detailed checks below are retained honestly; completing this initial review does not certify production readiness.
- [ ] Record DigitalOcean instance type, CPU, RAM, free disk, GPU/VRAM if present, region, and current workloads.
- [ ] Check current backups, resource usage, and remaining capacity.
- [ ] Obtain current training, hosting, storage, and media quotes.
- [ ] Agree experiment and recurring budgets; keep test replicas limited.
- [ ] Confirm how to pause unused GPU services without losing model artifacts.

**Done when:** a costed hardware shortlist and approved spending ceiling exist. No upgrade is purchased merely to troubleshoot a disabled UI option.

#### 2. Audit existing Afro AI features — IN PROGRESS
- [x] Inventory chat providers, streaming, document retrieval, tools, image/audio/video routes, storage, authentication, and background jobs.
- [x] Mark each capability: implemented, partial, not found, or runtime unverified.
- [ ] Select three priority text jobs and the languages to evaluate.
- [x] Document which existing modules can be reused and which require work.

Source audit saved in [Afro AI feature audit](afro-ai-feature-audit.md). No application code changed or paid API tests performed. Runtime verification and user confirmation of task/language scope remain open.

**Done when:** there is a short gap list based on code and behavior, not assumptions.

### Day 2 — tool/security research and evaluation data

#### 3. Research tool use from the screenshot
- [ ] Compare browser/search, calculators, isolated code execution, and media tools.
- [ ] Specify each tool's schema, permissions, timeout, cost, and output format.
- [ ] Define the loop: model proposes → server validates/authorizes → executes → returns bounded output → model answers.
- [ ] Bound tool-call count, retries, result size, and recursion.

**Done when:** a reviewed tool contract exists. Begin with document search and a calculator; defer general code execution until isolation is verified.

#### 4. Research LLM security from the screenshot
- [ ] Cover direct jailbreaks, indirect prompt injection, and training-data poisoning.
- [ ] Add cross-user data leakage, SSRF, tool abuse, and cost exhaustion.
- [ ] Map each threat to a server-enforced control and a safe test.
- [ ] Treat retrieved text, web pages, uploaded files, and tool results as untrusted data.

**Done when:** each sensitive operation has authorization rules independent of model output.

#### 5. Prepare datasets and evaluations
- [ ] Build at least 100 representative held-out questions with scoring criteria.
- [ ] Include realistic multilingual, document, refusal, and tool cases.
- [ ] Gather several hundred reviewed training examples as an initial target.
- [ ] Remove duplicates, private data, and unlicensed material; record provenance.
- [ ] Have qualified speakers evaluate language quality.
- [ ] Version the dataset and prevent overlap with held-out tests.

**Done when:** the training set and evaluation set are separate and reviewed.

### Day 3 — model selection and app integration

#### 6. Choose the text model through comparison
- [ ] Compare the 1.5B baseline, one 7–8B candidate, one 14B candidate, and the current API provider.
- [ ] Candidate families from the research include Qwen2.5, Llama, and DeepSeek distilled models; verify current suitability rather than assuming equivalence.
- [ ] Measure task accuracy, language quality, valid tool calls, time to first token, total latency, and resource use.
- [ ] Check commercial licenses and define acceptable performance thresholds.
- [ ] Estimate cost per successful request at realistic utilization.

**Done when:** a recorded decision selects the smallest model meeting requirements, or identifies why none yet qualifies.

#### 7. Fine-tune only for measured weaknesses
- [ ] Select a suitable LoRA/QLoRA training configuration for the chosen model and GPU.
- [ ] Run a short smoke test, then a budget-limited training experiment.
- [ ] Preserve the original weights, tokenizer, adapter, dataset version, and training configuration.
- [ ] Evaluate against the same held-out tests and check regressions.

**Done when:** measured improvement justifies keeping the fine-tune. A completed training job alone does not pass this gate.

#### 8. Connect text chat and document retrieval
- [ ] Add the new model as an internal test provider, not the global default.
- [ ] Store credentials securely on the server.
- [ ] Support required chat behavior, streaming, timeouts, cancellation, and explicit errors.
- [ ] Connect existing retrieval with per-user access checks and source citations.
- [ ] Keep a documented switch back to the current provider.

**Done when:** authorized test users can chat and answer document-based questions without cross-user leakage.

### Day 4 — independent hosting and controlled tools

#### 9. Establish independent hosting without Ollama
- [ ] Select CPU/GPU serving hardware based on the chosen model's measured needs.
- [ ] Use a tested vLLM setup where compatible; validate alternatives if CPU-only hardware is required.
- [ ] Pin engine/model versions; verify dtype, quantization, context length, and concurrency.
- [ ] Protect the service with authentication, firewall rules, and TLS where appropriate.
- [ ] Keep model workloads from exhausting the live app server.
- [ ] Benchmark one request first, then gradually increase concurrency.

**Done when:** a reproducible deployment meets agreed speed/cost targets and can be restarted or rolled back safely.

Deployment instructions for DigitalOcean must be prepared for that external server. Do not assume container commands are executable in the Replit workspace.

#### 10. Implement controlled tool execution
- [ ] Add document search and calculator tools first.
- [ ] Add web search with guarded URL retrieval, redirects, size limits, and SSRF protection.
- [ ] Validate arguments and permissions server-side.
- [ ] Require action-bound approval for writes, messages, purchases, or other consequential operations.
- [ ] Add code execution only with verified isolation, resource limits, restricted networking, and no host credentials.

**Done when:** legitimate calls work and harmless adversarial probes cannot escape permissions or isolation.

### Days 5–6 — media pilot

#### 11. Research and integrate image generation
- [ ] Compare self-hosted and API options for licensing, quality, latency, hardware, and current cost.
- [ ] Treat FLUX and fal.ai suggestions in the research as candidates, not preselected dependencies.
- [ ] Reuse the app's existing provider/storage path if suitable.
- [ ] Add bounded generation jobs, progress/error UI, private asset access, and retention rules.

**Done when:** an authorized user can generate and retrieve an image, with usage recorded and failures handled.

#### 12. Research and integrate audio
- [ ] Evaluate speech-to-text and text-to-speech separately in priority languages.
- [ ] Consider Whisper-family STT and suitable TTS providers/models; verify licenses and actual hardware needs.
- [ ] Scope music/sound generation separately if required.
- [ ] Support uploads or recording, transcripts, playback/downloads, cancellation, and usage limits.
- [ ] Require appropriate consent for voice use; do not assume permission for voice cloning.

**Done when:** a representative recording can be transcribed and a text response spoken with acceptable language quality.

#### 13. Research and integrate video generation
- [ ] Compare current API and self-hosted offerings, supported durations, licenses, and prices.
- [ ] Start with short clips and strict per-user limits.
- [ ] Return a job ID immediately; implement status, completion, failure, and timeout handling.
- [ ] Verify webhook signatures where supported and make callbacks idempotent.
- [ ] Store output securely and avoid duplicate paid jobs on retries.

**Done when:** one short clip completes end-to-end without blocking chat, with its cost and failure path observable.

### Day 7 — security verification and pilot decision

#### 14. Apply cross-feature safeguards
- [ ] Test credentials never appear in client bundles, prompts, or logs.
- [ ] Verify ownership for documents, jobs, generated assets, and downloads.
- [ ] Enforce request size, upload type, token, concurrency, and spending limits.
- [ ] Test jailbreaks, indirect injection, poisoned examples, and tool argument manipulation safely.
- [ ] Provide appropriate moderation, data retention, deletion, and audit controls.
- [ ] Test fallback, queue recovery, provider failures, and duplicate requests.

**Done when:** no unresolved critical data-access or execution flaw remains in pilot scope.

#### 15. Run the integrated pilot and decide what to launch
- [ ] Test text, retrieved knowledge, tools, images, audio, and video with a small authorized group.
- [ ] Record success rate, language quality, p50/p95 latency, actual cost, and failures.
- [ ] Compare against agreed thresholds rather than adopting unsupported research benchmarks.
- [ ] Enable only passing features; keep failures disabled with clear status.
- [ ] Document rollback, incident handling, and how to pause costly services.

**Done when:** a short pilot report identifies what can launch, what remains external, and what requires more work.

## Final deliverables

- Infrastructure inventory and approved cost model.
- Existing-feature audit and selected pilot scope.
- Tool-use design and screenshot-derived security test matrix.
- Reviewed training data and independent evaluation set.
- Model comparison and fine-tuning report.
- Tested hosting instructions and app integration.
- Working or explicitly deferred image, audio, and video paths.
- Pilot results, remaining risks, and rollback instructions.

## First action

Complete items 1 and 2 before provisioning or retraining. Supply DigitalOcean specifications, priority languages/tasks, and budget limits. Continue through each gate in order; independent research and dataset review can proceed in parallel.