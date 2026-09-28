export interface ProjectFile {
  path: string;
  name: string;
  language: string;
  content: string;
}

export const PROJECT_FILE_LIMITS = { count: 200, fileBytes: 1_000_000, totalBytes: 5_000_000, pathBytes: 240 };

export class ProjectFileError extends Error {
  constructor(public status: number, reason: string, path = "[project]") {
    super(`REDACTED: ${path}: ${reason}`);
    this.name = "ProjectFileError";
  }
}

// Deliberately do not put a rejected input path (which itself may contain a token)
// into diagnostics. Only validated paths are ever eligible for display.
const tokens = /-----BEGIN (?:[A-Z0-9 ]*PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|(?:sk|rk)_live_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{15,}|AIza[A-Za-z0-9_-]{35}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/;
const placeholder = /^(?:|YOUR_[A-Z0-9_]+|REPLACE_ME|CHANGEME|<[^<>\r\n]+>|\$\{[A-Z_][A-Z0-9_]*\})$/;
const bytes = (text: string) => new TextEncoder().encode(text).length;

export function validateProjectFiles(input: unknown): ProjectFile[] {
  if (!Array.isArray(input) || input.length > PROJECT_FILE_LIMITS.count) {
    throw new ProjectFileError(400, "invalid file list or file count exceeded");
  }
  let total = 0;
  const seen = new Set<string>();
  return input.map((file) => {
    if (!file || typeof file !== "object" || typeof file.path !== "string") {
      throw new ProjectFileError(400, "invalid file");
    }
    const path = file.path;
    if (!path || bytes(path) > PROJECT_FILE_LIMITS.pathBytes ||
        !/^[A-Za-z0-9_./@()+ -]+$/.test(path) || path.startsWith("/") ||
        path.split("/").some((part: string) => !part || part === "." || part === ".." || part.trim() !== part) ||
        tokens.test(path)) {
      throw new ProjectFileError(400, "unsafe POSIX path");
    }
    const parts = path.toLowerCase().split("/");
    const name = path.split("/").at(-1)!;
    if (parts.some((part: string) =>
      part === ".git" || part === ".ssh" || part === ".aws" || part === ".gnupg" || part === ".docker" || part === ".kube" ||
      (part.startsWith(".env") && part !== ".env.example") ||
      /^(?:credentials(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|\.npmrc|\.pypirc|\.netrc|\.git-credentials|service[-_]?account.*\.json)$/.test(part) ||
      /\.(?:pem|key|p12|pfx|keystore)$/.test(part))) {
      throw new ProjectFileError(400, "credential file forbidden", path);
    }
    if (seen.has(path.toLowerCase())) throw new ProjectFileError(400, "duplicate path", path);
    seen.add(path.toLowerCase());
    if (typeof file.content !== "string" || typeof file.name !== "string" || file.name !== name ||
        typeof file.language !== "string" || !/^[A-Za-z0-9_+#.-]{1,40}$/.test(file.language)) {
      throw new ProjectFileError(400, "invalid file metadata or content", path);
    }
    const size = bytes(file.content);
    total += size;
    if (size > PROJECT_FILE_LIMITS.fileBytes || total > PROJECT_FILE_LIMITS.totalBytes) {
      throw new ProjectFileError(400, "file byte limit exceeded", path);
    }
    if (tokens.test(file.content) ||
        /(?:password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret|authorization)\s*["']?\s*[:=]\s*["'](?:[^"'\r\n]{8,})["']/i.test(
          file.content.replace(/["'](?:YOUR_[A-Z0-9_]+|REPLACE_ME|CHANGEME|<[^<>]+>|\$\{[A-Z_][A-Z0-9_]*\})["']/g, '""')) ||
        /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i.test(file.content)) {
      throw new ProjectFileError(400, "embedded credential forbidden", path);
    }
    if (parts.at(-1) === ".env.example") {
      for (const line of file.content.split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith("#")) continue;
        const match = line.match(/^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*?)\s*$/);
        const value = match?.[1].replace(/^(['"])(.*)\1$/, "$2");
        if (value === undefined || !placeholder.test(value)) {
          throw new ProjectFileError(400, "env example must contain only verified placeholders", path);
        }
      }
    }
    return { path, name, language: file.language, content: file.content };
  });
}