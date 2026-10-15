# Unified My Apps area

The user approved implementation, including repair of post-publish email links.
The source implementation has been tested; a Git push is not verification of the
signed-in VPS release.

## What changes

Use **My Apps** as the single project library for drafts and published websites. Dashboard remains an overview, linking into the same library rather than maintaining a separate competing project list. Deployment settings become part of each app, not a separate collection that appears unrelated to its editable source.

A source project and a live deployment remain different records: one project may have a draft, a published release and custom domains. Combine their presentation and explicit association, not their database tables.

## Ordered implementation

1. **Audit existing associations.** Inventory owned projects, conversations and publications. Use the automatic-saving/recovery work already built as the foundation. Flag ambiguous historical records instead of merging by name.
2. **Define one library response.** Return each owned project once, with its editable conversation, source availability, publication(s), live URL and domain status. Include unpublished drafts. Keep published-site counts distinct from project counts.
3. **Build shared app cards.** Show name, last updated time and Draft/Live status. Make **Open & Build** the primary action, followed by View live site when published. Provide Files, Add authentication, Publish/Update, deployment history and domain management under the same app.
4. **Replace duplicate lists.** My Apps displays the complete library with All, Drafts and Published filters and name search. Dashboard uses a small recent-apps view of this same data and an Open My Apps link. Do not maintain independent data-to-card implementations that drift.
5. **Preserve old links.** Keep `/deployments` working through a compatible redirect or library filter. Existing chat, project, preview and live URLs continue to work. Keep the sidebar label My Apps consistent with the page heading.
6. **Separate destructive actions.** Label Unpublish separately from Delete project. Explain the effect before confirmation, use explicit associations, and never infer which live site to remove from a shared title. Do not add a permanent archive or six-year retention promise without the separately reviewed retention policy.
7. **Verify the complete journey.** Create in chat → automatic project save → publish → find one editable app → reopen source → edit → update the same live site. Also cover drafts, duplicate names, multiple publications, recovered legacy sites, ownership rejection, auth handoff and partial storage failures.
8. **Roll out safely.** Verify desktop and phone layouts, current tests and production build; release through the existing production procedure. Verify the signed-in live release separately from source push or development preview.

## Example card

    Sample Shop                                  Live
    Last edited: today
    sample-shop.afroaigroup.com

    [Open & Build] [View live site] [More]

    More: Files · Add authentication · Publish update
          Domains · History · Unpublish · Delete project

## Acceptance criteria

- A customer does not need to search two collections to find and edit one app.
- A draft is visible before publishing, and publishing does not produce a duplicate project.
- Every published card can reopen its associated editable source, or clearly reports recovery limitations.
- No existing live site, custom domain or source file is deleted as part of consolidation.
- Actions remain visible and usable on phone screens.

The implementation uses one My Apps library for `/deployments`, `/apps` and
`/my-apps`; Dashboard is an overview of that library. Legacy email URLs therefore
remain compatible. New publish emails link to the canonical library with an app
identifier.

Deletion requires typed confirmation. Origin serving is blocked first, followed
by app-scoped authoritative DNS removal, cache-purge acknowledgements and strict
hosted-object cleanup. An incomplete operation preserves its resource identifiers
and pending state for retry. Unpublishing preserves editable source and history.
Customer-managed external DNS and domain registrations are not cancelled.

Verification includes the full unit/component suite, production build and
desktop/phone component fixtures. Real deletion of a customer's production site
is not performed as a test. Verify the signed-in flow and relevant provider
permissions after the separate VPS release.
