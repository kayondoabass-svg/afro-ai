# Unified chat workspace

The `/chat` builder combines customer and assistant replies with saved project
action groups. It uses the existing owner-scoped activity ledger and read-only
SSE stream; subscribing or loading older events never replays a job.

## What users can open

- An owned saved website preview in the right pane on desktop. Preview frames
  use `allow-scripts allow-forms`, without `allow-same-origin`.
- Current project files as escaped text, explicitly labelled as current files,
  not historical revisions. Binary files retain their normal download path.
- Desktop and mobile screenshot evidence through private conversation-scoped
  image routes. Captured images are evidence, not proof of successful review.
- Saved design proposals created by explicitly attaching an already completed,
  owned image-generation job. This does not start image generation or billing.
  Proposals are illustrations, not implemented or verified application screens.

Desktop has a pointer- and keyboard-resizable chat/preview divider. Mobile has
Chat and Preview views plus direct Files access. Changing views preserves the
composer draft. Website previews refresh after a chat operation completes and
also have a manual refresh control.

Opening a project selects its website preview automatically. A conversation
without a separate project can preview its latest completed HTML reply. Neither
path bypasses project setup checks or enables a source-only full-stack runtime.
Desktop/Mobile viewport controls resize the interactive preview; they do not
create screenshot evidence or certify Safari behavior.

Conversation replies are the primary feed, without a second nested scroll area.
Background action groups start collapsed. Saved image thumbnails remain visible
without expanding logs or consenting to new capture. Visual tools expands the
actual consent, capture, review and repair controls, capability explanations,
retention details and saved reports. Opening it never starts a paid operation.
Private images also offer full-size viewing and download.

## Proposal persistence

`POST /api/conversations/:id/workbench/proposals` accepts a UUID request ID, UUID
media-job ID and bounded title. It verifies ownership, completed image status
and private asset availability before saving metadata. An advisory lock makes
request-ID retries idempotent. The proposal and its action event are committed
in one PostgreSQL transaction. The metadata includes the source fingerprint at
attachment time; the image remains in the existing private media storage.

`GET /api/conversations/:id/workbench/proposals/:proposalId/image` verifies
conversation, proposal and media ownership, rechecks access after reading the
asset, and returns the private image with no-store and nosniff headers. There
is no public bucket URL or global image state. Existing customer data is not
replaced, and no MongoDB migration is introduced.

## Boundaries

- Full-stack projects remain source-export projects until an isolated runtime
  is explicitly provisioned; this workspace does not invent a runtime URL.
- No fabricated tool events, sample screenshot images or automatic paid retry.
- Activity is retained for the existing project lifetime, not an unspecified
  six-year or permanent legal archive.
- Direct paid proposal generation and proposal-to-source automatic approval are
  not part of attaching an existing image.

Deployment of these source changes requires the Afro AI VPS deployment script.
A successful GitHub push or a separate Replit deployment does not by itself
update `afroaigroup.com`.
