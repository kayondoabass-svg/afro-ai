import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  row: undefined as any,
  api: {
    users: { getAuthenticated: vi.fn() },
    repos: { get: vi.fn(), createForAuthenticatedUser: vi.fn(), getContent: vi.fn(), createOrUpdateFileContents: vi.fn() },
    git: {
      getRef: vi.fn(), getCommit: vi.fn(), getTree: vi.fn(), getBlob: vi.fn(),
      createBlob: vi.fn(), createTree: vi.fn(), createCommit: vi.fn(), updateRef: vi.fn(), createRef: vi.fn(),
    },
  },
  auth: vi.fn(),
}));
vi.mock("../db", () => ({ db: { select: () => ({ from: () => ({ where: async () => mock.row ? [mock.row] : [] }) }) } }));
vi.mock("@octokit/rest", () => ({ Octokit: class { constructor(opts: unknown) { mock.auth(opts); return mock.api; } } }));

import {
  encryptToken, exportGithubProject, githubErrorResponse, importGithubProject,
  parseGithubRepository, previewGithubExport, pushHtmlToRepo,
} from "../github";

const base = "a".repeat(40);
const file = { path: "src/app.ts", name: "app.ts", language: "typescript", content: "export const app = 1;" };
const png = { path: "assets/icon.png", name: "icon.png", language: "binary", encoding: "base64" as const,
  content: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YkWEL8AAAAASUVORK5CYII=" };
const opts = { userId: "u1", repoName: "app", branch: "main", visibility: "private" as const, files: [file] };

beforeEach(() => {
  vi.resetAllMocks();
  mock.row = { accessTokenEnc: encryptToken("test-oauth-token"), githubLogin: "stale-login" };
  mock.api.users.getAuthenticated.mockResolvedValue({ data: { login: "real-owner" } });
  mock.api.repos.get.mockResolvedValue({ data: { owner: { login: "real-owner" }, default_branch: "main" } });
  mock.api.git.getRef.mockResolvedValue({ data: { object: { sha: base } } });
  mock.api.git.getCommit.mockResolvedValue({ data: { tree: { sha: "base-tree" } } });
  mock.api.git.getTree.mockResolvedValue({ data: { truncated: false, tree: [{ path: "unrelated.txt", type: "blob", mode: "100644", sha: "other" }] } });
  mock.api.git.createBlob.mockResolvedValue({ data: { sha: "blob" } });
  mock.api.git.createTree.mockResolvedValue({ data: { sha: "new-tree" } });
  mock.api.git.createCommit.mockResolvedValue({ data: { sha: "new-commit" } });
  mock.api.git.updateRef.mockResolvedValue({});
});

describe("GitHub project transfers (mock APIs only)", () => {
  it("uses decrypted server OAuth, authenticated owner, and read-only preview", async () => {
    const result = await previewGithubExport(opts);
    expect(result).toMatchObject({ owner: "real-owner", baseSha: base, files: [{ path: file.path, change: "add" }] });
    expect(mock.auth).toHaveBeenCalledWith({ auth: "test-oauth-token" });
    expect(mock.api.git.createBlob).not.toHaveBeenCalled();
    expect(mock.api.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });
  it("requires connection", async () => {
    mock.row = undefined;
    await expect(previewGithubExport(opts)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects unsafe URLs rather than fetching arbitrary hosts", () => {
    for (const url of ["http://github.com/a/b", "https://evil.test/a/b", "https://user:pass@github.com/a/b", "https://github.com/a/b/tree/main"]) {
      expect(() => parseGithubRepository(url)).toThrow();
    }
    expect(parseGithubRepository("https://github.com/a/b.git")).toEqual({ owner: "a", repo: "b" });
  });
  it("imports a pinned nested tree and explicitly excludes binary, LFS, symlink, submodule and secrets", async () => {
    const entries = [
      { path: file.path, sha: "text", type: "blob", mode: "100644" },
      { path: "image.png", sha: "img", type: "blob", mode: "100644" },
      { path: "asset.txt", sha: "lfs", type: "blob", mode: "100644" },
      { path: "link", sha: "link", type: "blob", mode: "120000" },
      { path: "sub", sha: "sub", type: "commit", mode: "160000" },
      { path: ".env", sha: "secret", type: "blob", mode: "100644" },
    ];
    mock.api.git.getTree.mockResolvedValue({ data: { tree: entries } });
    mock.api.git.getBlob.mockImplementation(async ({ file_sha }) => ({ data: { encoding: "base64", content: Buffer.from(
      file_sha === "text" ? file.content : file_sha === "lfs" ? "version https://git-lfs.github.com/spec/v1\noid sha256:abc" : "PASSWORD=topsecret"
    ).toString("base64") } }));
    const result = await importGithubProject({ userId: "u1", url: "https://github.com/real-owner/app" });
    expect(result.files).toEqual([file]);
    expect(result.repo).toEqual({ owner: "real-owner", name: "app", branch: "main", sha: base });
    expect(result.excluded).toHaveLength(5);
    expect(mock.api.git.getCommit).toHaveBeenCalledWith(expect.objectContaining({ commit_sha: base }));
  });
  it("imports validated binary assets and exports raw bytes with matching git blob SHA", async () => {
    const raw = Buffer.from(png.content, "base64");
    mock.api.git.getTree.mockResolvedValue({ data: { tree: [{ path: png.path, sha: "img", type: "blob", mode: "100644", size: raw.length }] } });
    mock.api.git.getBlob.mockResolvedValue({ data: { encoding: "base64", content: png.content.replace(/.{60}/g, "$&\n") } });
    const imported = await importGithubProject({ userId: "u1", url: "https://github.com/a/b" });
    expect(imported.files).toEqual([png]);
    const { createHash } = await import("node:crypto");
    const sha = createHash("sha1").update(`blob ${raw.length}\0`).update(raw).digest("hex");
    mock.api.git.getTree.mockResolvedValue({ data: { truncated: false, tree: [{ path: png.path, type: "blob", mode: "100644", sha }] } });
    expect((await previewGithubExport({ ...opts, files: [png] })).files).toEqual([
      { path: png.path, bytes: raw.length, encoding: "base64", change: "unchanged" },
    ]);
    await exportGithubProject({ ...opts, files: [png], expectedSha: base, message: "Add image" });
    expect(mock.api.git.createBlob).toHaveBeenCalledWith(expect.objectContaining({ content: png.content, encoding: "base64" }));
  });
  it("rejects remote LFS attributes before creating blobs or repositories", async () => {
    mock.api.git.getTree.mockResolvedValue({ data: { truncated: false, tree: [
      { path: ".gitattributes", type: "blob", mode: "100644", sha: "attrs", size: 42 },
    ] } });
    mock.api.git.getBlob.mockResolvedValue({ data: { encoding: "base64", content: Buffer.from("*.png filter=lfs diff=lfs merge=lfs -text").toString("base64") } });
    await expect(previewGithubExport({ ...opts, files: [png] })).rejects.toThrow("LFS");
    await expect(exportGithubProject({ ...opts, files: [png], expectedSha: base, message: "Add" })).rejects.toThrow("LFS");
    expect(mock.api.git.createBlob).not.toHaveBeenCalled();
  });
  it("excludes binary-named LFS pointers and unsafe remote attributes on import", async () => {
    mock.api.git.getTree.mockResolvedValue({ data: { tree: [
      { path: png.path, sha: "pointer", type: "blob", mode: "100644" },
      { path: ".gitattributes", sha: "attrs", type: "blob", mode: "100644" },
      { path: file.path, sha: "text", type: "blob", mode: "100644" },
    ] } });
    mock.api.git.getBlob.mockImplementation(async ({ file_sha }) => ({ data: { encoding: "base64", content: Buffer.from(
      file_sha === "pointer" ? "version https://git-lfs.github.com/spec/v1\noid sha256:abc" :
        file_sha === "attrs" ? "*.png filter=lfs diff=lfs merge=lfs -text" : file.content,
    ).toString("base64") } }));
    const result = await importGithubProject({ userId: "u1", url: "https://github.com/a/b" });
    expect(result.files).toEqual([file]);
    expect(result.excluded.map(item => item.reason)).toEqual(expect.arrayContaining([
      expect.stringContaining("LFS pointer"), expect.stringContaining("LFS tracking"),
    ]));
  });
  it("fails truncated trees instead of claiming a complete import", async () => {
    mock.api.git.getTree.mockResolvedValue({ data: { truncated: true, tree: [] } });
    await expect(importGithubProject({ userId: "u1", url: "https://github.com/a/b" })).rejects.toMatchObject({ status: 413 });
    expect(mock.api.git.getBlob).not.toHaveBeenCalled();
  });
  it("preserves unrelated remote files using base_tree and one non-force ref update", async () => {
    await exportGithubProject({ ...opts, expectedSha: base, message: "Update app" });
    expect(mock.api.git.createTree).toHaveBeenCalledWith(expect.objectContaining({
      base_tree: "base-tree", tree: [{ path: file.path, mode: "100644", type: "blob", sha: "blob" }],
    }));
    expect(mock.api.git.createCommit).toHaveBeenCalledWith(expect.objectContaining({ parents: [base] }));
    expect(mock.api.git.updateRef).toHaveBeenCalledExactlyOnceWith({
      owner: "real-owner", repo: "app", ref: "heads/main", sha: "new-commit", force: false,
    });
  });
  it("rejects stale expectedSha before writes", async () => {
    await expect(exportGithubProject({ ...opts, expectedSha: "b".repeat(40), message: "Update" })).rejects.toMatchObject({ status: 409 });
    expect(mock.api.git.createBlob).not.toHaveBeenCalled();
  });
  it("previews a new repo without creating it and initializes only after null-base confirmation", async () => {
    mock.api.repos.get.mockRejectedValue({ status: 404 });
    expect(await previewGithubExport(opts)).toMatchObject({ baseSha: null, branch: "main" });
    expect(mock.api.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
    mock.api.repos.createForAuthenticatedUser.mockResolvedValue({ data: { default_branch: "main" } });
    expect(await exportGithubProject({ ...opts, expectedSha: null, message: "Initial project" })).toMatchObject({ created: true });
    expect(mock.api.repos.createForAuthenticatedUser).toHaveBeenCalledExactlyOnceWith({ name: "app", private: true, auto_init: true });
  });
  it("does not treat denied authentication as permission to create a repository", async () => {
    mock.api.repos.get.mockRejectedValue({ status: 403, message: "private details" });
    await expect(previewGithubExport(opts)).rejects.toMatchObject({ status: 403 });
    expect(mock.api.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });
  it("rejects repository redirects to another owner", async () => {
    mock.api.repos.get.mockResolvedValue({ data: { owner: { login: "someone-else" }, default_branch: "main" } });
    await expect(previewGithubExport(opts)).rejects.toMatchObject({ status: 403 });
    expect(mock.api.git.getRef).not.toHaveBeenCalled();
  });
  it("detects a race before updateRef", async () => {
    mock.api.git.getRef.mockResolvedValueOnce({ data: { object: { sha: base } } }).mockResolvedValueOnce({ data: { object: { sha: "race" } } });
    await expect(exportGithubProject({ ...opts, expectedSha: base, message: "Update" })).rejects.toMatchObject({ status: 409 });
    expect(mock.api.git.updateRef).not.toHaveBeenCalled();
  });
  it("surfaces GitHub's non-fast-forward race as a redacted conflict", async () => {
    mock.api.git.updateRef.mockRejectedValue({ status: 422, message: "secret request data" });
    try { await exportGithubProject({ ...opts, expectedSha: base, message: "Update" }); }
    catch (error) { expect(githubErrorResponse(error)).toEqual({ status: 409, error: "Remote repository changed. Preview again before exporting." }); }
  });
  it("blocks secrets in project export and old HTML push before any API writes", async () => {
    const content = `const token = "ghp_${"x".repeat(36)}"`;
    await expect(previewGithubExport({ ...opts, files: [{ ...file, content }] })).rejects.toThrow();
    await expect(pushHtmlToRepo({ userId: "u1", repoName: "app", htmlContent: content, title: "App", visibility: "public" })).rejects.toThrow();
    expect(mock.api.users.getAuthenticated).not.toHaveBeenCalled();
    expect(mock.api.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });
  it("keeps legacy HTML push create-only; existing repos cannot receive unreviewed writes", async () => {
    await expect(pushHtmlToRepo({ userId: "u1", repoName: "app", htmlContent: "<h1>App</h1>", title: "App", visibility: "public" }))
      .rejects.toMatchObject({ status: 409 });
    expect(mock.api.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
    expect(mock.api.repos.getContent).not.toHaveBeenCalled();
    expect(mock.api.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
  });
  it("validates bounded legacy metadata before authentication or GitHub calls", async () => {
    const valid = { userId: "u1", repoName: "app", htmlContent: "<h1>App</h1>", title: "App", visibility: "public" as const };
    for (const invalid of [
      { title: "A".repeat(201) }, { title: "App\ninjected" }, { title: 1 },
      { commitMessage: "a".repeat(501) }, { commitMessage: "" }, { commitMessage: 42 },
      { publishedUrl: "javascript:alert(1)" }, { publishedUrl: "https://host.test/\nInjected" },
      { publishedUrl: "https://host.test/" + "a".repeat(2048) }, { publishedUrl: 12 },
    ]) {
      await expect(pushHtmlToRepo({ ...valid, ...invalid } as any)).rejects.toMatchObject({ status: 400 });
    }
    expect(mock.api.users.getAuthenticated).not.toHaveBeenCalled();
    expect(mock.api.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });
  it("allows legacy push to create a fresh repository without querying or overwriting file SHAs", async () => {
    mock.api.repos.get.mockRejectedValue({ status: 404 });
    mock.api.repos.createOrUpdateFileContents.mockResolvedValue({ data: { content: { html_url: "https://github.com/real-owner/app/blob/main/index.html" } } });
    await expect(pushHtmlToRepo({ userId: "u1", repoName: "app", htmlContent: "<h1>App</h1>", title: "App", visibility: "private" }))
      .resolves.toMatchObject({ created: true, owner: "real-owner" });
    expect(mock.api.repos.getContent).not.toHaveBeenCalled();
    expect(mock.api.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(3);
    expect(mock.api.repos.createOrUpdateFileContents.mock.calls.every(([params]) => !("sha" in params))).toBe(true);
  });
  it("does not expose upstream error data", () => {
    expect(githubErrorResponse({ status: 500, message: "token=secret", request: { headers: { authorization: "secret" } } }))
      .toEqual({ status: 502, error: "GitHub operation failed. Please retry." });
  });
});