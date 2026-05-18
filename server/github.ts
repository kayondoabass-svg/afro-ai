import crypto from "crypto";
import { db } from "./db";
import { userGithubTokens, type UserGithubToken } from "@shared/schema";
import { eq } from "drizzle-orm";

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
  const tokenRow = await getUserToken(opts.userId);
  if (!tokenRow) throw new Error("GitHub account not connected");
  const token = decryptToken(tokenRow.accessTokenEnc);
  const octokit = await getOctokit(token);

  const owner = tokenRow.githubLogin;
  const repo = sanitizeRepoName(opts.repoName);
  if (!repo) throw new Error("Repository name is empty after cleaning");

  // 1. Ensure the repo exists. If not, create it.
  let created = false;
  try {
    await octokit.repos.get({ owner, repo });
  } catch (e: any) {
    if (e.status !== 404) throw e;
    await octokit.repos.createForAuthenticatedUser({
      name: repo,
      description: `${opts.title} — built with Afro AI`,
      private: opts.visibility === "private",
      auto_init: false,
    });
    created = true;
  }

  // 2. PUT each file via the Contents API. We have to fetch the existing sha
  //    for updates (otherwise GitHub rejects with 422).
  const commitMessage = opts.commitMessage || (created ? "Initial commit — built with Afro AI" : "Update from Afro AI");
  const files: Array<{ path: string; content: string }> = [
    { path: "index.html", content: opts.htmlContent },
    { path: "README.md", content: README_TEMPLATE(opts.title, opts.publishedUrl) },
    { path: ".gitignore", content: GITIGNORE },
  ];

  let firstHtmlUrl = "";
  for (const f of files) {
    let sha: string | undefined;
    try {
      const existing = await octokit.repos.getContent({ owner, repo, path: f.path });
      if (!Array.isArray(existing.data) && "sha" in existing.data) {
        sha = existing.data.sha;
      }
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }
    const put = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: f.path,
      message: commitMessage,
      content: Buffer.from(f.content, "utf8").toString("base64"),
      sha,
    });
    if (f.path === "index.html") {
      firstHtmlUrl = put.data.content?.html_url || "";
    }
  }

  return {
    repoUrl: `https://github.com/${owner}/${repo}`,
    htmlUrl: firstHtmlUrl || `https://github.com/${owner}/${repo}`,
    owner,
    repo,
    created,
  };
}
