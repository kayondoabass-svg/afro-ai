# KEYO download statistics

The private founder/invited-viewer dashboard reads
`/api/keyo-studio/admin/downloads`. Unauthorized requests do not trigger
external statistics requests.

## Evidence labels

- **Afro AI:** successful full-file archive responses served by this app after
  tracking starts. HEAD, range/partial responses, aborts, failed transfers,
  release notes, manifests and checksums are excluded. Server transfer completion
  is not evidence of a verified installation, a unique person or retained file.
  Earlier downloads are unknown, not retrospectively zero.
- **GitHub:** the public repository's release-asset `download_count`, across
  release history. Desktop, source and developer bundles are separate.
  Automatically generated GitHub source-code archives and metadata are not
  included. Repeats, bots and verification requests can be counted upstream.
- **Hugging Face:** use the public Space API's reported count only if actually
  supplied. A missing count is **not published**, not zero. A failed request is
  **unavailable**. Tracked outbound archive-link clicks are shown separately and
  are not completed downloads. Direct Space traffic is not captured.

Do not sum these measures into a grand total, unique-user count or installs.
Authorized/active studio viewers are unrelated to downloads.
Desktop download buttons on Afro AI currently link to GitHub or Hugging Face:
the destination hosts the file. Afro AI records that referral separately; it
must not also claim it as an Afro AI-served full-file transfer.

## Storage, access and behavior

The existing PostgreSQL database stores additive, aggregate UTC-day counts by
source/filename. No IP addresses, user email addresses, device IDs, prompts,
model weights or desktop telemetry are collected by this counter. The existing
web server's normal logs and protections remain separate.

Recording failure must not prevent download delivery or redirects. The console
exposes an accounting-health warning when failures are observed. These are
best-effort operational counters, not fraud-resistant billing records.

Source links redirect only to known KEYO destinations and current-release
filenames. Arbitrary URLs and paths are rejected. Redirect endpoints are
rate-limited; HEAD requests are not counted.

External requests are bounded, fixed-destination, timeout-limited and cached
for five minutes (30 seconds after failure), with concurrent refresh coalescing.
API failures must never be silently substituted with zero. The bounded GitHub
pagination fails explicitly rather than presenting a truncated history as a
complete total.
