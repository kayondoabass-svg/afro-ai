# Publish KEYO Studio, not the private Afro AI platform

Use a **new public GitHub repository** named `keyo-studio` under your personal
account or KEYO Technologies organization. Do not make the existing Afro AI
platform repository public or push its entire working tree.

## Prepare safe publication folders

From the Afro AI project root:

```sh
node scripts/keyo-export.mjs
```

This creates two isolated folders under
`generated-artifacts/keyo-publication/0.1.0-alpha.1/`:

- `github/`: runner/desktop source, synthetic tests, MIT licence, security and
  contribution guides, ignore rules and least-privilege test workflow.
- `huggingface/`: a Static Space preview, source archive, licence and README
  with checksum. No model inference or credentials are exposed by the Space.

The exporter refuses to overwrite existing folders. Supply a fresh destination
as its first argument when exporting another draft. Outputs are ignored by the
private platform repository.

## GitHub

1. Create an **empty** public `keyo-studio` repository on GitHub. Do not
   initialize another README/licence there; our exported files provide them.
2. Authenticate with your normal GitHub Git/SSH or CLI credentials. Do not put
   tokens in source, Git remote URLs or chat. Workflow files require an
   authorization that can push workflows.
3. Change into the **exported `github/` folder**, not `/opt/afro-ai`.
4. Run, replacing `YOUR_OWNER` with your actual account/organization:

```sh
git init -b main
git add .
git commit -m "KEYO Studio independent local runner developer alpha"
git remote add origin https://github.com/YOUR_OWNER/keyo-studio.git
git push -u origin main
```

5. Check the test workflow. The matrix checks Node 22/24 on Linux/Windows/macOS;
   it does **not** certify native installers or GPU inference.
6. Only after approving this developer alpha, tag its version and create a
   GitHub Release. Build Linux binaries with `npm run pack:linux`, test them
   on a graphical Linux machine, and attach the archive and its checksum.
   Never label unsigned/unverified binaries as signed production releases.

Do not reuse a published tag/version for later changes.

## Hugging Face

1. Create a new **Space** called `KEYO-Studio`, selecting the **Static** SDK.
   This preview does not start a GPU or paid inference endpoint.
2. Authenticate Git using your normal Hugging Face account/SSH or secure token
   credential helper. Do not hard-code a token in a command or remote URL.
3. Change into the exported **`huggingface/` folder** and run:

```sh
git init -b main
git add .
git commit -m "KEYO Studio interface preview and developer source download"
git remote add origin https://huggingface.co/spaces/YOUR_OWNER/KEYO-Studio
git push -u origin main
```

If the Space was initialized with an existing README, clone its repository
into a new folder and copy only our exported Space files into that clone
before committing and pushing. Do not force-push over existing work.

Add the actual GitHub repository/release link to the Space README after the
repository exists. No placeholders should be promoted as working links.

**Model weights are separate:** publish them to a Model repository only when
you explicitly approve publication and the source-model/adapter licences allow
redistribution. The existing private Afro AI checkpoint is not included or
certified by this alpha.

Hugging Face hosting/discoverability does not automatically pay the author.
Sponsorship, a partnership or paid support would require a separate agreement.

Official Static Space instructions:
https://huggingface.co/docs/hub/spaces-sdks-static
