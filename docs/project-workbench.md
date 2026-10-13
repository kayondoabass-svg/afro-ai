# Project workbench and customer-controlled validation

Open a project in the Agent, open its Files panel, then expand **Project workbench**.

## Workflow

1. Save requirements and acceptance checks.
2. Attach bounded text specifications. Existing PDF/image chat uploads remain a
   separate flow; this workbench currently accepts text, Markdown, JSON and CSV.
3. Ask the project agent to inspect and propose changes. Large source files can
   be read in sections and patched. File operations never execute commands.
4. Review and approve changes. Workspace patch/rename/delete/restore operations
   use an atomic, whole-workspace comparison; ordinary AI text edits compare
   their touched files. Stale changes fail without writing.
5. Save checkpoints or use the automatic checkpoint before approved AI edits.
   Ten recovery copies are retained at most; explicitly remove unwanted copies
   to free capacity. Removal affects the recovery copy, not current source.
6. Run structural validation. It does not execute the project and cannot certify
   runtime behaviour.
7. Download the validation ZIP, extract it, and read `.afro-checks/README.txt`.
   Use Node.js 22+ on Windows, macOS or Linux. Project commands are off by
   default; enabling them requires explicitly running permission flags.
8. Optionally install the documented browser tool locally, configure preview
   output and interaction selectors, and run browser checks.
9. Review screenshots and acceptance requirements. Import the resulting JSON
   report. Imported reports are labelled **customer-reported**, not server
   attestations. Reports must match the current source fingerprint.
10. Request a repair. This fills the ordinary project-agent input; send it and
    review the proposal. At most three repair requests per saved plan revision.
    After approval, download the changed source and run checks again.
11. Publish separately using the existing static-site publishing or reviewed
    GitHub export/customer hosting path. GitHub source availability is not a
    running backend or evidence of a live deployment.
    In project-agent mode, single-page publishing reads current saved
    `index.html`, not an older chat response. Projects with local asset
    dependencies are blocked from that single-page path to avoid incomplete
    deployments; export their full source for appropriate hosting.

## Existing project compatibility

The oldest customer-owned conversation in a project anchors its shared source.
No older D1 rows are moved or discarded. The workbench shows sibling legacy
workspaces with original ZIP downloads and explicit import review. Conflicting
paths block import rather than overwrite existing files. An anchor conversation
with source/recovery data cannot be individually deleted.

## Limits and trust

- Existing source storage remains D1: 200 files, 1 MB/file, 5 MB/project.
- File tools retain five model rounds, ten calls, eight edits/operations,
  bounded results and 90-second request cancellation.
- The local runner is **not a sandbox**. Run untrusted source only in a
  disposable environment you control. No customer code runs on Afro AI's
  production server.
- The runner binds previews to loopback, uses unique ports, rejects paths and
  symlinks outside the preview, and blocks external browser requests.
- Package build/test scripts are opt-in, timed out after two minutes, and run
  with a limited inherited environment. Backend startup, databases, native
  output exporters and customer-specific environment configuration are not
  provisioned automatically.
- Missing browser tools, missing checks and unverified acceptance requirements
  are blocked/skipped, never silently passed.
- Token usage is aggregated across received provider responses; unavailable
  provider usage is labelled estimated. Customer billing rates are unchanged.
- Interrupted/ambiguous operations do not automatically replay.
- Passing checks do not prove security, accessibility, visual correctness,
  every requirement, or absence of bugs.

## Operational verification

Project source requires the existing project-file D1 migrations 002/003; this
feature does not create/migrate customer databases from HTTP requests.
Plan/progress/recovery metadata uses owner-authorized existing conversation
storage, excluded from normal dialogue history. Validation reports are not
trusted deployment instructions.
