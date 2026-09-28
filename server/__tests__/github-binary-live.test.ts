/**
 * Destructive, opt-in GitHub E2E: creates and deletes a disposable PRIVATE repository.
 *
 * Run only with RUN_LIVE_GITHUB_BINARY_E2E=1 and GITHUB_E2E_USER_ID set to the
 * application's user ID of an already-connected GitHub account:
 * RUN_LIVE_GITHUB_BINARY_E2E=1 GITHUB_E2E_USER_ID=... npx vitest run server/__tests__/github-binary-live.test.ts
 *
 * Uses the application's encrypted OAuth token, never a personal access token
 * supplied to the test. The connected OAuth grant must include BOTH repo
 * (private repository creation/write) and delete_repo (cleanup). The normal
 * application OAuth flow requests only repo; do not broaden that flow for this
 * test. A failed cleanup fails the test.
 */
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const enabled = process.env.RUN_LIVE_GITHUB_BINARY_E2E === "1" && !!process.env.GITHUB_E2E_USER_ID;

function blobSha(bytes: Buffer): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

describe.skipIf(!enabled)("GitHub binary transfer (LIVE private repository)", () => {
  it("round-trips binary bytes and Git blob SHAs; never imports or overwrites LFS pointers", async () => {
    // Dynamic imports keep normal/mock-only test runs independent of the live DB.
    const { pool } = await import("../db");
    const { getUserToken, decryptToken, previewGithubExport, exportGithubProject, importGithubProject } = await import("../github");
    const { Octokit } = await import("@octokit/rest");

    const repoName = `afro-ai-binary-e2e-${randomUUID()}`;
    const userId = process.env.GITHUB_E2E_USER_ID!;
    let step = "checking connected account";
    let owner = "";
    let creationAttempted = false;
    let failure: Error | undefined;
    let api: InstanceType<typeof Octokit> | undefined;
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLrWQAAAABJRU5ErkJggg==", "base64");
    const gif = Buffer.from("R0lGODlhAQABAAD/ACwAAAAAAQABAAACAUwAOw==", "base64");
    const binaries = [
      { path: "assets/pixel.png", name: "pixel.png", language: "binary", encoding: "base64" as const, content: png.toString("base64"), bytes: png },
      { path: "assets/pixel.gif", name: "pixel.gif", language: "binary", encoding: "base64" as const, content: gif.toString("base64"), bytes: gif },
    ];
    const files = [
      { path: "src/hello.txt", name: "hello.txt", language: "plaintext", content: "Live GitHub binary round-trip\n" },
      ...binaries.map(({ bytes: _bytes, ...file }) => file),
    ];
    const lfsPath = "assets/pointer.png";
    const lfsPointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${"a".repeat(64)}\nsize 123\n`;

    try {
      const connected = await getUserToken(userId);
      if (!connected) throw new Error("No connected GitHub account exists for GITHUB_E2E_USER_ID");
      api = new Octokit({ auth: decryptToken(connected.accessTokenEnc) });
      step = "checking repo and delete_repo OAuth scopes (both required before repository creation; normal app OAuth lacks delete_repo)";
      const authenticated = await api.users.getAuthenticated();
      // Inspect GitHub's token-scopes response header, not the requested scopes
      // saved at connection time. Missing/ambiguous headers fail closed.
      const grantedScopes = authenticated.headers["x-oauth-scopes"];
      const scopeList = typeof grantedScopes === "string" ? grantedScopes.split(",").map(scope => scope.trim()) : [];
      if (!scopeList.includes("repo") || !scopeList.includes("delete_repo")) {
        throw new Error("Connected GitHub token lacks repo and delete_repo grants");
      }
      const identity = authenticated.data;
      owner = identity.login;
      expect(owner.toLowerCase()).toBe(connected.githubLogin.toLowerCase());

      const options = { userId, repoName, visibility: "private" as const, files };
      step = "previewing new private repository";
      const preview = await previewGithubExport(options);
      expect(preview.baseSha).toBeNull();
      expect(preview.owner).toBe(owner);
      for (const { path, bytes } of binaries) {
        expect(preview.files.find(file => file.path === path)).toMatchObject({ bytes: bytes.length, change: "add" });
      }

      step = "creating private repository via export";
      creationAttempted = true;
      const created = await exportGithubProject({ ...options, expectedSha: null, message: "Live binary E2E initial commit" });
      expect(created.created).toBe(true);
      const repository = (await api.repos.get({ owner, repo: repoName })).data;
      expect(repository.private).toBe(true);

      async function checkRemoteBinary(branch: string) {
        const ref = (await api!.git.getRef({ owner, repo: repoName, ref: `heads/${branch}` })).data;
        const commit = (await api!.git.getCommit({ owner, repo: repoName, commit_sha: ref.object.sha })).data;
        const tree = (await api!.git.getTree({ owner, repo: repoName, tree_sha: commit.tree.sha, recursive: "1" })).data;
        expect(tree.truncated).toBe(false);
        for (const { path, bytes } of binaries) {
          const entry = tree.tree.find(item => item.path === path);
          expect(entry?.sha).toBe(blobSha(bytes));
          const blob = (await api!.git.getBlob({ owner, repo: repoName, file_sha: entry!.sha! })).data;
          expect(Buffer.from(blob.content, "base64").equals(bytes)).toBe(true);
        }
        return tree.tree;
      }

      step = "checking initial raw GitHub blobs";
      await checkRemoteBinary(created.branch);

      step = "adding a Git LFS pointer";
      await api.repos.createOrUpdateFileContents({
        owner, repo: repoName, path: lfsPath, branch: created.branch,
        message: "Add LFS pointer for exclusion test",
        content: Buffer.from(lfsPointer).toString("base64"),
      });
      const pointerSha = blobSha(Buffer.from(lfsPointer));

      step = "importing binary and excluding LFS pointer";
      const imported = await importGithubProject({ userId, url: `https://github.com/${owner}/${repoName}`, branch: created.branch });
      expect(imported.files.some(file => file.path === lfsPath)).toBe(false);
      expect(imported.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ path: lfsPath, reason: expect.stringMatching(/LFS/i) })]));
      for (const { path, bytes } of binaries) {
        const file = imported.files.find(item => item.path === path);
        expect(file).toMatchObject({ language: "binary", encoding: "base64" });
        expect(Buffer.from(file!.content, "base64").equals(bytes)).toBe(true);
        expect(blobSha(Buffer.from(file!.content, "base64"))).toBe(blobSha(bytes));
      }

      step = "re-exporting imported files";
      const reviewed = await previewGithubExport({ ...options, files: imported.files });
      expect(reviewed.baseSha).toBe(imported.repo.sha);
      for (const { path } of binaries) expect(reviewed.files.find(file => file.path === path)?.change).toBe("unchanged");
      await exportGithubProject({
        ...options, files: imported.files, expectedSha: reviewed.baseSha,
        message: "Live binary E2E round-trip",
      });
      const finalTree = await checkRemoteBinary(created.branch);
      expect(finalTree.find(entry => entry.path === lfsPath)?.sha).toBe(pointerSha);
      step = "verifying LFS remains excluded on re-import";
      const again = await importGithubProject({ userId, url: `https://github.com/${owner}/${repoName}`, branch: created.branch });
      expect(again.files.some(file => file.path === lfsPath)).toBe(false);
      expect(again.excluded.some(item => item.path === lfsPath && /LFS/i.test(item.reason))).toBe(true);

      step = "adding remote LFS tracking rule";
      await api.repos.createOrUpdateFileContents({
        owner, repo: repoName, path: ".gitattributes", branch: created.branch,
        message: "Add LFS tracking rule for exclusion test",
        content: Buffer.from("*.png filter=lfs diff=lfs merge=lfs -text\n").toString("base64"),
      });
      const tracked = await importGithubProject({ userId, url: `https://github.com/${owner}/${repoName}`, branch: created.branch });
      expect(tracked.files.some(file => file.path === ".gitattributes")).toBe(false);
      expect(tracked.excluded.some(item => item.path === ".gitattributes")).toBe(true);
      step = "rejecting export to LFS-tracked repository";
      await expect(previewGithubExport({ ...options, files: tracked.files })).rejects.toMatchObject({ status: 409 });
    } catch (error) {
      // Octokit errors can include request headers and credentials. Never
      // print/serialize the original exception (including its cause).
      const status = typeof (error as { status?: unknown })?.status === "number"
        ? ` (HTTP ${(error as { status: number }).status})` : "";
      failure = new Error(`Live GitHub binary E2E failed at ${step}${status}. See assertion stage; no credentials logged.`);
    } finally {
      if (creationAttempted && owner && api) {
        try {
          const remote = (await api.repos.get({ owner, repo: repoName })).data;
          if (remote.name !== repoName || remote.owner.login.toLowerCase() !== owner.toLowerCase() || !remote.private) {
            throw new Error("Repository identity or visibility changed; refusing unsafe cleanup");
          }
          await api.repos.delete({ owner, repo: repoName });
        } catch (error) {
          if ((error as { status?: number }).status !== 404) {
            failure = new Error(`Live GitHub binary E2E cleanup failed for ${repoName}; delete this disposable private repository manually.`);
          }
        }
      }
      await pool.end();
    }
    if (failure) throw failure;
  }, 180_000);
});