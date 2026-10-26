---
name: KEYO portable runtime contract
description: Why browser/mobile worker cancellation, source exports and capability labels remain conservative.
---
Keep the portable engine independent of Node-only adapters. Inference cancellation
terminates and unloads its worker instead of depending on SharedArrayBuffer.
Partial output stays marked stopped; model files remain installed.

**Why:** KEYO must work on ordinary secure hosting paths and Android WebViews,
where cross-origin isolation and shared-memory availability cannot be assumed.
Worker termination is also reliable while synchronous matrix operations run.

**How to apply:** Preserve epoch/request checks and model-file locking when
changing lifecycle behavior. Verify offline restart against production bundles,
not a Vite development server: dev workers are fetched dynamically. Include the
real host's cache headers, or reproduce them in the fixture.

Hosted offline checks must include resource-loading failures, not just page
exceptions.

**Why:** Hugging Face adds `Vary: Origin`. Browser module requests and precache
fetches have different Origin headers: generation worked online, but offline
restart showed only static footer content despite a successfully installed
worker. A plain local server did not expose the failure.

**How to apply:** Test with hosting headers and inspect console/resource errors.
Normalize variation only for the app's explicitly precached public files;
never extend that rule to private API responses or another app's caches.

Preserve immutable desktop release identities independently of portable releases.
Do not rename old desktop payloads to match a newer source/mobile version.

**Why:** A new portable source release does not rebuild or certify Windows/macOS
desktop binaries. Relabeling creates misleading download links and provenance.

**How to apply:** Check all website, tracking redirects and HF links when bumping
versions. APK compilation/debug signature checks are not on-device execution,
release signing or phone performance evidence. F16/BF16 are not integer
quantization; numerical parity is not broad model-quality certification.
