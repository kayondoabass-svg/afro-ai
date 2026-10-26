# Chat visual inspection integration

The chat now has passive saved activity and private paired visual evidence for
every saved conversation, including when Project Agent is off. Source generation,
capture and model review remain separate: remote capture is explicitly gated by
Browser Rendering permission and consent. The permission probe still returns
HTTP 401 in this workspace; real capture/vision roundtrip is **not certified**.

The runtime's administrator-controlled inspector profile is versioned separately
from customer files. New capture receipts bind canonical workspace, saved source,
profile and checklist versions. Structured AI reviews must include all six checks
independently for desktop and mobile. Nonconforming model output is retained as
an **unstructured review**, not silently converted into a passing checklist.

Private JSON reports: `GET visual-audit/:runId/report`. Reports reference evidence
IDs instead of duplicating image bytes and always distinguish visual observations
from functional verification and deployment. Capture may include `parentRunId`
after an approved repair has been saved with a different source fingerprint.
Each parent accepts one capture attempt (uncertain attempts are not replayed),
with three repair depths and the existing per-plan budget/repair constraints.
Repair preparation is idempotent in both the capture receipt and workbench state.

Reconnect and history reads never trigger captures or paid reviews. The UI
refreshes saved run/evidence metadata on activity; capture, image sharing and
review require explicit confirmation. Prepared repairs enter the composer for
inspection and deliberate submission, then use the existing source approval
flow. No model-authored “PASSED” field triggers publication.

# Visual audit backend contract

## Release readiness

Backend routes and agent wiring do not establish working frontend controls,
provider permission, production deployment or security certification.
No frontend changes are part of this backend release.

Remote capture is **disabled by default**. It uses the existing Cloudflare
account, not a browser or customer-code process on the Afro AI host. An
administrator must explicitly enable it with `AFRO_BROWSER_CAPTURE_ENABLED=true`
and authorize the API token for Browser Rendering on that account. Account
resolution uses `CLOUDFLARE_ACCOUNT_ID` or the existing `R2_ACCOUNT_ID`.
Credentials alone are not permission evidence. Do not enable a new paid
service/plan, rotate unrelated keys or change customer tariffs implicitly.

The implementation follows the Cloudflare screenshot REST API:
https://developers.cloudflare.com/api/resources/browser_rendering/subresources/screenshot/methods/create/

It submits self-contained HTML to the remote browser. No account session cookies,
customer backend credentials or Afro AI filesystem paths are supplied to the
page. CSP and request interception block external network access. Only saved
static HTML, local CSS, classic JS, validated images and fonts are supported.
React/other source requiring bundling, module imports, CDN assets, full-stack
servers, checkout integration and real Safari testing are not supported by
this capture mode. Use the customer-local runner for those scenarios.

## API

All paths are relative to:
`/api/conversations/:id/workbench`

Authentication and ownership apply to the canonical workspace. POST mutations
require JSON and reject foreign browser origins. Supply explicit consent before
sharing customer source/images with a provider.

### GET /visual-audit

Returns `capability`, bounded `runs` metadata and `visualVerified: false`.
No image bytes, internal provider model names or credentials are returned.
`capability.enabled` means locally enabled/configured, not permission verified.

### POST /visual-audit/capture

```json
{
  "requestId": "a-client-generated-UUID",
  "fingerprint": "current-workbench-fingerprint",
  "phase": "before",
  "entry": "index.html",
  "confirm": true
}
```

`confirm` covers source disclosure to the remote browser. The fingerprint is
obtained from the existing workbench GET. A successful request returns one
capture run with two evidence IDs:

- Desktop: 1280x800.
- Mobile: 375x812, explicitly labelled Chromium/iPhone-sized, **not Safari**.

These are initial viewport images, not full-page or interactive-workflow
verification. Both images are stored atomically as private evidence. Existing
authenticated `/evidence/:evidenceId/image` returns the actual image.
The existing evidence listing includes `profile`, `captureId`, `provenance`,
fingerprint and before/after metadata for remote captures.

Limits: two image slots must be available; eight images/workspace, 64/owner,
512 KiB/image, ten capture attempts/owner in a rolling day, one active capture
per owner, four browser slots shared across database-connected app processes.
Each browser request has a 25-second upper timeout. No automatic retry.
Provider usage is bounded by attempts/time, not reported as an exact invoice.
Provider charges can occur even when capture fails or is cancelled.

Reusing a successful request ID returns its recorded result without dispatch.
Reusing an attempted/failed/uncertain ID does not rerun it. A timeout is not proof
that the provider stopped billing. An explicit new request is a new attempt,
not reconciliation of the prior attempt.

### POST /visual-audit/:runId/review

```json
{ "confirm": true, "language": "en" }
```

Consent covers sending **both actual image blocks** to the vision provider.
Both images must exist and refer to the current saved source. Review returns
visible findings, not a functional pass, source change or deployment.
Saved findings are idempotent. An interrupted/uncertain review blocks additional
paid attempts on that run until reconciled.

The existing job reservation and usage accounting apply. Token estimates,
actual provider usage and customer fees remain distinct. Output is fitted
before dispatch. The existing customer tariff and founder policy are retained.
Secondary analytics failure does not turn saved review success into a false
failure; the response includes `usageLogPending` when reconciliation is needed.

### POST /visual-audit/:runId/repair

```json
{ "confirm": true }
```

Prepares a repair request from fresh reviewed evidence. Does not edit source,
run tests or publish. Existing explicit proposal approval and checkpoint/CAS
rules govern source changes. Existing maximum three repair requests per plan
revision applies. After saving a repair, capture/review the new fingerprint;
do not reuse earlier evidence as verification of the changed source.

### GET /events

Authenticated Server-Sent Events derived from bounded saved activity:

- `activity`: ID, job, tool, status, safe paths/message, title.
- `reset`: cursor expired; bounded saved history follows.
- `heartbeat`: connected.
- `end`: reconnect required or access unavailable.

Use `Last-Event-ID` or `?after=<event-id>` to reconnect. Reconnecting reads history,
never restarts an AI call or capture. The stream checks ownership on each poll,
rejects foreign workspace access, disables caching/proxy buffering, bounds
connections/queued bytes and cleans up on disconnect. No raw screenshot bytes,
provider details, source file contents or terminal output are streamed.

## Agent

The project-agent tool catalogue now includes `take_ui_screenshot`. The chat
request must explicitly set `visualAuditConsent: true` to permit source sharing
with the remote browser **and** passing the paired images into AI context.
Only one screenshot pair can be attempted in a project review loop.

The tool captures saved source, not pending edits. Both images enter subsequent
model context as image blocks; base64 is excluded from text-size accounting.
Token/image allowances still apply. Blocked capture produces an explicit failed
tool event with `visualVerified: false`, never fabricated images or a pass.

There is no unrestricted `write_file`, automatic repair-save or deployment.
The owner must approve changes before recapture of saved source.

## Frontend acceptance still required

Build a discoverable in-chat timeline and paired gallery from these real APIs.
Display empty, blocked, stale, capturing, reviewed, failed and uncertain states.
Keep before/after capture IDs/fingerprints distinct. Do not manufacture completed
steps or screenshots. Obtain consent before provider dispatch. Do not label
a successful capture/review as tests passed or offer automatic paid retry.

Production sign-in, real provider captures, both-image inspection and subsequent
repair/recapture must be checked before claiming the full workflow is live.
