# Project website images

## Ownership and retention

- Every private image belongs to one authenticated owner and one project workspace.
- Identical bytes selected in another project create another asset ID and object. There is no global deduplication or cross-project asset reference.
- The server checks ownership before lists, uploads, media selection, byte reads and deletion. Client-supplied owner IDs, object keys and download URLs are rejected.
- Private image responses use `Cache-Control: private, no-store` and vary on cookies and authorization. The client keys lists by signed-in user and project, and clears pending selections when either changes.
- Explicitly selected images are independent permanent project copies. Original generated-media jobs still expire after 72 hours; their expiry and accounting are not modified.
- Static website output embeds selected images. Full-stack projects receive images in `client/public/assets/images`. Published websites necessarily expose their selected image copies, but never gain access to the private project, bucket, original media jobs or other images.
- Deleting a private image does not retroactively remove a previously published or downloaded copy.

## Where things are saved

1. Private App Storage holds optimized image bytes below its private directory, then `website-assets/<owner-hash>/<project-workspace>/<asset-id>.webp`.
2. PostgreSQL `website_assets` holds private ownership, integrity, attribution and pending/ready metadata.
3. Existing Cloudflare D1 project Files hold `assets/images/<id>.webp` (or `client/public/assets/images/<id>.webp` for full-stack clients) and `assets/manifest.json`.
4. Existing saved website versions and public output contain their own embedded image copies. Existing bounded binary project-file storage remains in D1; it has not been migrated.

## Selection and generation

Open a project's Files panel → **Project images**. Upload a raster, find a licensed stock photograph using a short public subject, or retain an unexpired image already created in Media. This control never starts a new paid generation.

HTML builds can call the bounded `search_project_images` tool. Tool selection is optional and uses the existing generation budget. Apps without a need for photography use typography, icons or original inline SVG. Unsupported stock lookups fall back honestly rather than inventing images. Existing owner-provided images survive unrelated edits.

The existing Jina/Tavily web-search service is preserved for public reference research. Photo discovery uses Wikimedia Commons metadata and only downloads raster images from `upload.wikimedia.org` or the newer `thumb.wikimedia.org` thumbnail host. Metadata matching is **not** visual certification or evidence of the customer's actual premises, staff or work. Stock attribution is retained in the manifest and rendered in static HTML.

Input: PNG/JPEG/WebP, up to 8 MB, 16.7 million pixels, no animation. Output: optimized WebP targeted to 150 KB. Eight images per project; current project-file size limits still apply. Static builds have a bounded embedded-image budget and explain omitted photos.

## Setup

Run `node scripts/website-assets-migrate.cjs` against the intended development database. Production deployment runs the additive migration before replacing the service. It preserves existing email, payment, media and project-file records.

On Replit, private App Storage's `PRIVATE_OBJECT_DIR` selects the managed backend automatically. App Storage readiness is a real write/read/delete probe, not an empty success response.

An external VPS **cannot use Replit's local credential sidecar**. With no new storage configuration, it deliberately retains these bounded images in its existing private D1 project Files (`project-files` backend), inside the existing file/project limits. A save is only ready after the actual project-file transaction succeeds. This is permanent storage, not temporary media, and does not depend on invalid R2 credentials. No existing database or binary-file storage has been migrated.

To add a separate private cloud copy on the VPS instead, configure either:

- Google Application Default Credentials with narrowly scoped access to this private bucket, set `WEBSITE_ASSET_GCS_ADC=true`, and set `WEBSITE_ASSET_BUCKET` to `gcs:<bucket>/<private-prefix>` using secrets/environment configuration.
- A separately verified private R2 bucket using valid R2 credentials, `WEBSITE_ASSET_BUCKET=<bucket>` and `WEBSITE_ASSET_R2_PRIVATE=true`. Verify there is no public domain or expiration lifecycle before setting that flag. Do not reuse an expiring or publicly exposed media bucket.

Do not copy credentials into source, CLI arguments, customer code, logs or this document. A configured cloud backend that fails returns a safe error; it does not silently change backend, fall back to temporary media, or claim a permanent save.

Existing R2 metadata remains readable through its recorded backend descriptor. No public bucket domain, ACL change or signed public URL is created.
