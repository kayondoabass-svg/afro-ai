import crypto from "crypto";
import { db } from "./db";
import { userGithubTokens, type UserGithubToken } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { ProjectFile } from "./project-files";
import { validateProjectFiles, ProjectFileError, PROJECT_FILE_LIMITS, projectFileBytes, isBinaryProjectPath } from "./project-file-policy";

// @octokit/rest v22 is ESM-only. Our prod build outputs CommonJS, so a static
// `import { Octokit } from "@octokit/rest"` becomes a `require()` at runtime
// and crashes with ERR_REQUIRE_ESM. Load it lazily via dynamic import, which
// Node treats as a real ESM import even from a CJS bundle.
type OctokitCtor = new (opts: { auth: string }) => any;
let _OctokitCached: OctokitCtor | null = null;
async function getOctokit(auth: string): Promise<any> {
  if (!_OctokitCached) {
    const mod = await import("@octokit/rest");
    _OctokitCached = mod.Octokit as unknown as OctokitCtor;
  }
  return new _OctokitCached({ auth });
}

const CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET || "";
const REQUESTED_SCOPES = "repo";

export function isGithubOAuthConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

// ---- token encryption -------------------------------------------------------
// We never store raw GitHub tokens on disk. AES-256-GCM with a key derived from
// the existing SESSION_SECRET (set in prod via /srv/afro-ai/shared/.env). If
// SESSION_SECRET is missing we fall back to a deterministic dev-only key so
// the feature still works locally — but in that case the cipher is not really
// protecting against a leaked DB dump.
function getKey(): Buffer {
  // Prefer a dedicated key; fall back to SESSION_SECRET (already required in
  // prod). In production, REFUSE to start with the public-constant fallback
  // so a misconfigured deploy can never silently use a recoverable key.
  const seed = process.env.GITHUB_TOKEN_ENC_KEY || process.env.SESSION_SECRET;
  if (!seed) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Refusing to encrypt GitHub tokens: SESSION_SECRET (or GITHUB_TOKEN_ENC_KEY) is not set");
    }
    // Dev-only fallback. NEVER reached in prod because of the throw above.
    return crypto.createHash("sha256").update("gh-token:afro-ai-dev-only").digest();
  }
  return crypto.createHash("sha256").update(`gh-token:${seed}`).digest();
}

// Open-redirect guard for the OAuth returnTo parameter. We only allow paths
// on this same site — no protocol-relative URLs, no absolute URLs, no
// javascript: tricks. Anything sketchy falls back to /ai-chat.
export function safeReturnTo(input: unknown): string {
  if (typeof input !== "string" || input.length === 0 || input.length > 512) return "/ai-chat";
  // Must start with a single slash and NOT a second slash (which would be
  // protocol-relative, e.g. "//evil.com").
  if (!input.startsWith("/") || input.startsWith("//")) return "/ai-chat";
  // Block any URL scheme that snuck in.
  if (/^\/[a-z]+:/i.test(input) || /[\r\n]/.test(input)) return "/ai-chat";
  return input;
}
export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}
export function decryptToken(packed: string): string {
  const [ivB64, tagB64, encB64] = packed.split(".");
  if (!ivB64 || !tagB64 || !encB64) throw new Error("Malformed token blob");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const enc = Buffer.from(encB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// ---- OAuth helpers ----------------------------------------------------------
function callbackUrl(req: any): string {
  // In prod we ALWAYS use the public domain because that's the URL registered
  // on the GitHub OAuth App. In dev we use whatever host the request came in
  // on so Replit preview / localhost both work.
  if (process.env.NODE_ENV === "production") {
    return "https://afroaigroup.com/api/github/callback";
  }
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.get("host");
  return `${proto}://${host}/api/github/callback`;
}

export function buildAuthorizeUrl(req: any, state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: callbackUrl(req),
    scope: REQUESTED_SCOPES,
    state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string, req: any): Promise<{ accessToken: string; scopes: string }> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(req),
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || "GitHub token exchange failed");
  }
  return { accessToken: data.access_token, scopes: data.scope || "" };
}

// ---- token CRUD -------------------------------------------------------------
export async function saveUserToken(userId: string, accessToken: string, scopes: string): Promise<UserGithubToken> {
  const octokit = await getOctokit(accessToken);
  const { data: gh } = await octokit.users.getAuthenticated();
  const row = {
    userId,
    githubLogin: gh.login,
    githubUserId: String(gh.id),
    accessTokenEnc: encryptToken(accessToken),
    scopes,
  };
  const [saved] = await db
    .insert(userGithubTokens)
    .values(row)
    .onConflictDoUpdate({
      target: userGithubTokens.userId,
      set: {
        githubLogin: row.githubLogin,
        githubUserId: row.githubUserId,
        accessTokenEnc: row.accessTokenEnc,
        scopes: row.scopes,
        connectedAt: new Date(),
      },
    })
    .returning();
  return saved;
}

export async function getUserToken(userId: string): Promise<UserGithubToken | undefined> {
  const [row] = await db.select().from(userGithubTokens).where(eq(userGithubTokens.userId, userId));
  return row;
}

export async function deleteUserToken(userId: string): Promise<void> {
  await db.delete(userGithubTokens).where(eq(userGithubTokens.userId, userId));
}

// ---- push helper ------------------------------------------------------------
function sanitizeRepoName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

const README_TEMPLATE = (title: string, publishedUrl?: string) => `# ${title}

Built with [Afro AI](https://afroaigroup.com) — the AI-powered platform that
helps creators build websites, apps, tools, and dashboards.

${publishedUrl ? `**Live demo:** ${publishedUrl}\n` : ""}
## Run it locally

Open \`index.html\` in your browser. That's it — it's a single-page app.

## Deploy it

You can host this for free on:

- **GitHub Pages** — Settings → Pages → Deploy from branch → main → root
- **Vercel** — drag-and-drop \`index.html\` to vercel.com
- **Netlify** — drag-and-drop to app.netlify.com/drop
`;

const GITIGNORE = `.DS_Store
node_modules/
.env
.env.local
*.log
.vercel
.netlify
`;

export interface PushResult {
  repoUrl: string;
  htmlUrl: string;
  owner: string;
  repo: string;
  created: boolean;
}

export async function pushHtmlToRepo(opts: {
  userId: string;
  repoName: string;
  htmlContent: string;
  title: string;
  visibility: "public" | "private";
  commitMessage?: string;
  publishedUrl?: string;
}): Promise<PushResult> {
  // The legacy single-HTML endpoint is create-only. Existing repositories must
  // use the preview + expectedSha + atomic export flow instead.
  if (typeof opts.title !== "string" || !opts.title.trim() || opts.title.length > 200 ||
      /[\x00-\x1f\x7f]/.test(opts.title)) {
    throw new GithubProjectError(400, "Title must contain 1–200 characters on one line.");
  }
  if (opts.commitMessage !== undefined &&
      (typeof opts.commitMessage !== "string" || !opts.commitMessage.trim() ||
       opts.commitMessage.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(opts.commitMessage))) {
    throw new GithubProjectError(400, "Commit message must contain 1–500 characters.");
  }
  if (opts.publishedUrl !== undefined) {
    if (typeof opts.publishedUrl !== "string" || opts.publishedUrl.length > 2048 ||
        /[\x00-\x20\x7f]/.test(opts.publishedUrl)) {
      throw new GithubProjectError(400, "Published URL must be a valid HTTP(S) URL of at most 2048 characters.");
    }
    let url: URL;
    try { url = new URL(opts.publishedUrl); }
    catch { throw new GithubProjectError(400, "Published URL must be a valid HTTP(S) URL of at most 2048 characters."); }
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw new GithubProjectError(400, "Published URL must be a valid HTTP(S) URL of at most 2048 characters.");
    }
  }
  if (opts.commitMessage) assertSafeGithubFiles([{ path: "message.txt", content: opts.commitMessage }]);
  // Scan every generated file before any remote mutation (including repo creation).
  assertSafeGithubFiles([
    { path: "index.html", content: opts.htmlContent },
    { path: "README.md", content: README_TEMPLATE(opts.title, opts.publishedUrl) },
    { path: ".gitignore", content: GITIGNORE },
  ]);
  const tokenRow = await getUserToken(opts.userId);
  if (!tokenRow) throw new GithubProjectError(401, "GitHub account not connected.");
  const token = decryptToken(tokenRow.accessTokenEnc);
  const octokit = await getOctokit(token);

  const { data: identity } = await octokit.users.getAuthenticated();
  const owner = identity.login;
  const repo = sanitizeRepoName(opts.repoName);
  if (!repo) throw new Error("Repository name is empty after cleaning");

  // 1. Refuse all existing repositories: Contents API updates are not atomic
  // and cannot be tied to a reviewed branch SHA.
  try {
    await octokit.repos.get({ owner, repo });
  } catch (e: any) {
    if (e.status !== 404) throw e;
    // A concurrent creation fails rather than turning into an overwrite.
    await octokit.repos.createForAuthenticatedUser({
      name: repo, description: `${opts.title} — built with Afro AI`,
      private: opts.visibility === "private", auto_init: false,
    });
    // Only this successful create may proceed to write contents.
    const commitMessage = opts.commitMessage || "Initial commit — built with Afro AI";
    const files: Array<{ path: string; content: string }> = [
      { path: "index.html", content: opts.htmlContent },
      { path: "README.md", content: README_TEMPLATE(opts.title, opts.publishedUrl) },
      { path: ".gitignore", content: GITIGNORE },
    ];
    let firstHtmlUrl = "";
    for (const f of files) {
      const put = await octokit.repos.createOrUpdateFileContents({
        owner, repo, path: f.path, message: commitMessage,
        content: Buffer.from(f.content, "utf8").toString("base64"),
      });
      if (f.path === "index.html") firstHtmlUrl = put.data.content?.html_url || "";
    }
    return {
      repoUrl: `https://github.com/${owner}/${repo}`,
      htmlUrl: firstHtmlUrl || `https://github.com/${owner}/${repo}`,
      owner, repo, created: true,
    };
  }
  throw new GithubProjectError(409, "Repository already exists. Review changed files in the project export flow before pushing.");
}

export class GithubProjectError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Never return Octokit request objects/messages: they can contain credentials or file contents. */
export function githubErrorResponse(error: unknown): { status: number; error: string } {
  if (error instanceof ProjectFileError) return { status: error.status, error: error.message };
  if (error instanceof GithubProjectError) return { status: error.status, error: error.message };
  const status = (error as any)?.status;
  if (status === 401) return { status: 401, error: "GitHub authorization expired. Reconnect GitHub." };
  if (status === 403 || status === 429) return { status, error: "GitHub denied this request or its rate limit was reached." };
  if (status === 404) return { status: 404, error: "GitHub repository or branch not found, or access denied." };
  if (status === 409 || status === 422) return { status: 409, error: "Remote repository changed. Preview again before exporting." };
  return { status: 502, error: "GitHub operation failed. Please retry." };
}

const MAX_FILES = PROJECT_FILE_LIMITS.count;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 5_000_000;

/** Defense in depth for legacy HTML push as well as full project export. */
export function assertSafeGithubFiles(files: Array<{ path: string; content: string; encoding?: "base64"; name?: string; language?: string }>): void {
  const checked = validateProjectFiles(files.map(file => ({
    ...file, name: file.name ?? file.path?.split("/").pop(),
    language: file.language ?? (file.encoding === "base64" ? "binary" : "plaintext"),
  })));
  let bytes = 0;
  if (!files.length || files.length > MAX_FILES) throw new GithubProjectError(413, `Project must contain 1–${MAX_FILES} files.`);
  const seen = new Set<string>();
  for (const file of checked) {
    if (typeof file.path !== "string" || typeof file.content !== "string" ||
        !file.path || file.path.length > 512 || /[\\\x00-\x1f]/.test(file.path) ||
        file.path.startsWith("/") || file.path.split("/").some(p => !p || p === "." || p === "..") ||
        seen.has(file.path.toLowerCase())) {
      throw new GithubProjectError(400, "Project contains an invalid or duplicate file path.");
    }
    seen.add(file.path.toLowerCase());
    if (/(^|\/)(?:\.git|node_modules)(\/|$)/i.test(file.path) ||
        /(^|\/)(?:\.env(?!\.example$)(?:\..*)?|id_rsa|id_ed25519|credentials(?:\.json)?|\.npmrc|\.pypirc)$/i.test(file.path) ||
        /\.(?:pem|key|p12|pfx)$/i.test(file.path)) {
      throw new GithubProjectError(400, "Project contains a sensitive or excluded file. Remove it before exporting.");
    }
    const data = projectFileBytes(file);
    const scan = file.encoding === "base64" ? data.toString("latin1") + "\n" + data.toString("utf8") : file.content;
    if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})/.test(scan) ||
        /(?:api[_-]?key|secret|password|access[_-]?token|auth[_-]?token)\s*["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i.test(scan)) {
      throw new GithubProjectError(400, "Potential secret detected. Remove credentials before exporting.");
    }
    const size = data.length;
    bytes += size;
    if (size > MAX_FILE_BYTES || bytes > MAX_TOTAL_BYTES) throw new GithubProjectError(413, "Project exceeds the GitHub transfer size limit.");
    if (!file.encoding && file.content.includes("\0")) throw new GithubProjectError(400, "Unsupported binary file.");
  }
}

async function githubClient(userId: string) {
  const token = await getUserToken(userId);
  if (!token) throw new GithubProjectError(401, "GitHub account not connected.");
  return getOctokit(decryptToken(token.accessTokenEnc));
}

function repoName(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(value) || value === "." || value === "..") {
    throw new GithubProjectError(400, "Invalid repository name.");
  }
  return value;
}

function branchName(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 200 ||
      /[\s~^:?*\[\\\x00-\x1f]/.test(value) || value.includes("..") || value.includes("@{") ||
      value.split("/").some(p => !p || p.startsWith(".") || p.endsWith(".") || p.endsWith(".lock"))) {
    throw new GithubProjectError(400, "Invalid branch name.");
  }
  return value;
}

export function parseGithubRepository(input: unknown): { owner: string; repo: string } {
  if (typeof input !== "string") throw new GithubProjectError(400, "A GitHub repository URL is required.");
  let url: URL;
  try { url = new URL(input); } catch { throw new GithubProjectError(400, "Invalid GitHub repository URL."); }
  const match = url.pathname.match(/^\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/?$/);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash || !match) {
    throw new GithubProjectError(400, "Use an https://github.com/owner/repository URL.");
  }
  return { owner: match[1], repo: repoName(match[2].replace(/\.git$/, "")) };
}

function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return ({ ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", html: "html", css: "css", json: "json", md: "markdown", py: "python", yml: "yaml", yaml: "yaml" } as Record<string, string>)[ext] || "plaintext";
}

export async function importGithubProject(opts: { userId: string; url: string; branch?: string }) {
  const { owner, repo } = parseGithubRepository(opts.url);
  const api = await githubClient(opts.userId);
  const { data: repository } = await api.repos.get({ owner, repo });
  const branch = branchName(opts.branch ?? repository.default_branch);
  const { data: ref } = await api.git.getRef({ owner, repo, ref: `heads/${branch}` });
  const sha = ref.object.sha;
  const { data: commit } = await api.git.getCommit({ owner, repo, commit_sha: sha });
  const { data: tree } = await api.git.getTree({ owner, repo, tree_sha: commit.tree.sha, recursive: "1" });
  if (tree.truncated || tree.tree.length > 5000) throw new GithubProjectError(413, "Repository tree is too large; import was not saved.");
  const files: ProjectFile[] = [];
  const excluded: Array<{ path: string; reason: string }> = [];
  let total = 0;
  let blobCount = 0;
  for (const entry of tree.tree) {
    if (entry.type === "tree") continue;
    const path = entry.path;
    let reason = "";
    if (entry.type === "commit" || entry.mode === "160000") reason = "Submodule is not imported";
    else if (entry.mode === "120000") reason = "Symbolic link is not imported";
    else if (entry.type !== "blob") reason = "Unsupported tree entry";
    else if (/(^|\/)(?:\.git|node_modules|vendor|dist|build)(\/|$)/i.test(path)) reason = "Dependency or generated directory";
    else if (/\.(?:pdf|zip|gz|mp[34]|exe|dll|sqlite|wasm)$/i.test(path)) reason = "Unsupported binary file";
    else if (entry.size > MAX_FILE_BYTES) reason = "File exceeds 1 MB limit";
    if (reason) { excluded.push({ path, reason }); continue; }
    if (++blobCount > MAX_FILES) throw new GithubProjectError(413, `Repository exceeds ${MAX_FILES} supported files; import was not saved.`);
    const { data: blob } = await api.git.getBlob({ owner, repo, file_sha: entry.sha });
    if (blob.encoding !== "base64" || typeof blob.content !== "string") throw new GithubProjectError(502, "Unsupported GitHub blob encoding; import was not saved.");
    if (blob.content.length > MAX_FILE_BYTES * 2) throw new GithubProjectError(413, "Repository exceeds transfer size limits; import was not saved.");
    const encoded = blob.content.replace(/\s/g, "");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      throw new GithubProjectError(502, "Invalid GitHub blob encoding; import was not saved.");
    }
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.toString("base64") !== encoded) throw new GithubProjectError(502, "Invalid GitHub blob encoding; import was not saved.");
    total += buffer.length;
    if (total > MAX_TOTAL_BYTES || buffer.length > MAX_FILE_BYTES) throw new GithubProjectError(413, "Repository exceeds transfer size limits; import was not saved.");
    // Pointer detection precedes extension-based binary handling: an image.png
    // containing an LFS pointer must never be treated as the image itself.
    if (buffer.toString("utf8", 0, 64).startsWith("version https://git-lfs.github.com/spec/v1")) {
      excluded.push({ path, reason: "Git LFS pointer (object not imported)" }); continue;
    }
    let content: string;
    let candidate: ProjectFile;
    if (isBinaryProjectPath(path)) {
      candidate = { path, name: path.split("/").pop()!, language: "binary", encoding: "base64", content: buffer.toString("base64") };
    } else {
      try { content = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
      catch { excluded.push({ path, reason: "Non-UTF-8 or unsupported binary file" }); continue; }
      if (content.includes("\0")) { excluded.push({ path, reason: "Unsupported binary file" }); continue; }
      candidate = { path, name: path.split("/").pop()!, language: languageFor(path), content };
    }
    try { assertSafeGithubFiles([candidate]); }
    catch (error) {
      if (!(error instanceof GithubProjectError) && !(error instanceof ProjectFileError)) throw error;
      const reason = path.split("/").at(-1)?.toLowerCase() === ".gitattributes" &&
        /(?:^|\s)filter\s*=\s*lfs(?:\s|$)/im.test(buffer.toString("utf8"))
        ? "Git LFS tracking attributes are unsupported" : "Sensitive content or unsafe project file excluded";
      excluded.push({ path: /^[A-Za-z0-9_./@()+ -]{1,240}$/.test(path) ? path : "[redacted path]", reason }); continue;
    }
    files.push(candidate);
  }
  if (!files.length) throw new GithubProjectError(400, "Repository contains no supported, safe files.");
  validateProjectFiles(files);
  return {
    files, repo: { owner, name: repo, branch, sha },
    excluded: excluded.map(entry => ({
      ...entry,
      path: /^[A-Za-z0-9_./@()+ -]{1,240}$/.test(entry.path) &&
        !/(?:gh[pousr]_|github_pat_|AKIA|ASIA|sk-|AIza|eyJ)/.test(entry.path) ? entry.path : "[redacted path]",
    })),
  };
}

type ExportOptions = { userId: string; repoName: string; branch?: string; visibility: "public" | "private"; files: ProjectFile[] };

async function exportContext(opts: ExportOptions) {
  assertSafeGithubFiles(opts.files);
  const repo = repoName(opts.repoName);
  if (!["public", "private"].includes(opts.visibility)) throw new GithubProjectError(400, "Visibility must be public or private.");
  const api = await githubClient(opts.userId);
  const { data: identity } = await api.users.getAuthenticated();
  const owner = identity.login;
  let repository: any;
  try { repository = (await api.repos.get({ owner, repo })).data; }
  catch (error: any) { if (error.status !== 404) throw error; }
  if (repository && repository.owner.login.toLowerCase() !== owner.toLowerCase()) throw new GithubProjectError(403, "Only repositories owned by your connected account can be exported.");
  const branch = branchName(opts.branch ?? repository?.default_branch ?? "main");
  let baseSha: string | null = null;
  let baseTree: string | undefined;
  let entries: any[] = [];
  if (repository) {
    // Missing branches are deliberately not created on existing repositories.
    baseSha = (await api.git.getRef({ owner, repo, ref: `heads/${branch}` })).data.object.sha;
    const commit = (await api.git.getCommit({ owner, repo, commit_sha: baseSha })).data;
    baseTree = commit.tree.sha;
    const tree = (await api.git.getTree({ owner, repo, tree_sha: baseTree, recursive: "1" })).data;
    if (tree.truncated || tree.tree.length > 5000) throw new GithubProjectError(413, "Remote tree is too large to safely preview.");
    entries = tree.tree;
    // A remote LFS attribute rule can silently turn raw blob uploads into LFS
    // pointers on subsequent clones. Refuse the export before any mutation.
    for (const entry of entries) {
      if (entry.type !== "blob" || !/(^|\/)\.gitattributes$/i.test(entry.path)) continue;
      if (entry.mode !== "100644" && entry.mode !== "100755") {
        throw new GithubProjectError(409, "Remote Git attributes are unsafe for project export.");
      }
      if (entry.size > MAX_FILE_BYTES) throw new GithubProjectError(409, "Remote Git attributes are too large to verify.");
      const { data: blob } = await api.git.getBlob({ owner, repo, file_sha: entry.sha });
      if (blob.encoding !== "base64" || typeof blob.content !== "string") throw new GithubProjectError(409, "Remote Git attributes cannot be verified.");
      const encoded = blob.content.replace(/\s/g, "");
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        throw new GithubProjectError(409, "Remote Git attributes cannot be verified.");
      }
      const data = Buffer.from(encoded, "base64");
      if (data.toString("base64") !== encoded) throw new GithubProjectError(409, "Remote Git attributes cannot be verified.");
      if (data.length > MAX_FILE_BYTES || /(?:^|\s)filter\s*=\s*lfs(?:\s|$)/im.test(data.toString("utf8"))) {
        throw new GithubProjectError(409, "Remote Git LFS tracking is unsupported.");
      }
    }
  }
  for (const file of opts.files) {
    if (entries.some(entry => (entry.path === file.path && (entry.type !== "blob" || entry.mode === "120000")) ||
        (file.path.startsWith(`${entry.path}/`) && entry.type !== "tree") || entry.path.startsWith(`${file.path}/`))) {
      throw new GithubProjectError(409, "A project path conflicts with a remote directory, symlink, or submodule.");
    }
  }
  return { api, owner, repo, branch, baseSha, baseTree, entries, repository };
}

export async function previewGithubExport(opts: ExportOptions) {
  const ctx = await exportContext(opts);
  return {
    owner: ctx.owner, repoName: ctx.repo, branch: ctx.branch, baseSha: ctx.baseSha,
    files: opts.files.map(file => {
      const existing = ctx.entries.find(entry => entry.path === file.path);
       const bytes = projectFileBytes(file);
      const sha = crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
       return { path: file.path, bytes: bytes.length, ...(file.encoding ? { encoding: file.encoding } : {}),
         change: !existing ? "add" : existing.sha === sha ? "unchanged" : "update" };
    }),
  };
}

export async function exportGithubProject(opts: ExportOptions & { expectedSha: string | null; message: string }) {
  if (opts.expectedSha !== null && (typeof opts.expectedSha !== "string" || !/^[a-f0-9]{40}$/i.test(opts.expectedSha))) throw new GithubProjectError(400, "expectedSha must be the preview baseSha (or null for a new repository).");
  if (typeof opts.message !== "string" || !opts.message.trim() || opts.message.length > 500) throw new GithubProjectError(400, "Commit message must contain 1–500 characters.");
  // Commit messages can contain secrets too.
  assertSafeGithubFiles([{ path: "message.txt", content: opts.message }]);
  const ctx = await exportContext(opts);
  const { api, owner, repo, branch } = ctx;
  if (ctx.baseSha !== opts.expectedSha) throw new GithubProjectError(409, "Remote branch changed. Preview again before exporting.");
  let parent = ctx.baseSha;
  let baseTree = ctx.baseTree;
  const created = !ctx.repository;
  if (created) {
    // GitHub Git Database APIs require an initialized repository.
    const result = await api.repos.createForAuthenticatedUser({ name: repo, private: opts.visibility === "private", auto_init: true });
    const initialBranch = result.data.default_branch;
    parent = (await api.git.getRef({ owner, repo, ref: `heads/${initialBranch}` })).data.object.sha;
    baseTree = (await api.git.getCommit({ owner, repo, commit_sha: parent })).data.tree.sha;
    if (branch !== initialBranch) await api.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: parent });
  }
  const tree: any[] = [];
  for (const file of opts.files) {
     const blob = await api.git.createBlob({ owner, repo, content: projectFileBytes(file).toString("base64"), encoding: "base64" });
    const existing = ctx.entries.find(entry => entry.path === file.path);
    tree.push({ path: file.path, mode: existing?.mode === "100755" ? "100755" : "100644", type: "blob", sha: blob.data.sha });
  }
  const resultTree = await api.git.createTree({ owner, repo, base_tree: baseTree, tree });
  const commit = await api.git.createCommit({ owner, repo, message: opts.message, tree: resultTree.data.sha, parents: [parent] });
  // Recheck immediately before update, then rely on non-force fast-forward semantics for races.
  const current = await api.git.getRef({ owner, repo, ref: `heads/${branch}` });
  if (current.data.object.sha !== parent) throw new GithubProjectError(409, "Remote branch changed during export. Preview again.");
  await api.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.data.sha, force: false });
  return { owner, repoName: repo, branch, sha: commit.data.sha, created, repoUrl: `https://github.com/${owner}/${repo}` };
}
