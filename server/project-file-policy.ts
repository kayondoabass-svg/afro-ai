export interface ProjectFile {
  path: string;
  name: string;
  language: string;
  content: string;
  encoding?: "base64";
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

const binaryExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico", "woff", "woff2", "ttf", "otf"]);
const lfsPointer = /^version https:\/\/git-lfs\.github\.com\/spec\/v1(?:\r?\n|$)/;
const lfsAttributes = /(?:^|\s)filter\s*=\s*lfs(?:\s|$)/im;
const forbiddenSignature = /^(?:MZ|PK\x03\x04|\x7fELF|\x1f\x8b|\x00asm|%PDF-|SQLite format 3|Rar!\x1a\x07|7z\xbc\xaf\x27\x1c)/;

export function isBinaryProjectPath(path: string): boolean {
  return binaryExtensions.has(path.split(".").pop()?.toLowerCase() ?? "");
}

export function projectFileBytes(file: ProjectFile): Buffer {
  return file.encoding === "base64" ? Buffer.from(file.content, "base64") : Buffer.from(file.content, "utf8");
}

function validBinary(path: string, data: Buffer): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") {
    if (data.length < 45 || !data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
        data.readUInt32BE(8) !== 13 || data.toString("ascii", 12, 16) !== "IHDR" ||
        !data.readUInt32BE(16) || !data.readUInt32BE(20)) return false;
    let offset = 8;
    let imageData = false;
    while (offset + 12 <= data.length) {
      const length = data.readUInt32BE(offset);
      if (length > data.length - offset - 12) return false;
      const type = data.toString("ascii", offset + 4, offset + 8);
      if (!/^[A-Za-z]{4}$/.test(type)) return false;
      offset += length + 12;
      if (type === "IDAT") imageData = true;
      if (type === "IEND") return length === 0 && imageData && offset === data.length;
    }
    return false;
  }
  if (ext === "jpg" || ext === "jpeg") return data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 &&
    data[2] === 0xff && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9;
  if (ext === "gif") return data.length >= 14 && ["GIF87a", "GIF89a"].includes(data.toString("ascii", 0, 6)) &&
    data.readUInt16LE(6) > 0 && data.readUInt16LE(8) > 0 && data[data.length - 1] === 0x3b;
  if (ext === "webp") return data.length >= 20 && data.toString("ascii", 0, 4) === "RIFF" &&
    data.readUInt32LE(4) + 8 === data.length && data.toString("ascii", 8, 12) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(data.toString("ascii", 12, 16));
  if (ext === "ico") {
    if (data.length < 22 || data.readUInt32LE(0) !== 0x00010000) return false;
    const count = data.readUInt16LE(4);
    const directoryEnd = 6 + 16 * count;
    if (!count || directoryEnd > data.length) return false;
    for (let i = 0; i < count; i++) {
      const entry = 6 + 16 * i;
      // ICONDIRENTRY: bytesInRes is at +8; imageOffset is at +12.
      const size = data.readUInt32LE(entry + 8);
      const offset = data.readUInt32LE(entry + 12);
      if (!size || offset < directoryEnd || offset > data.length || size > data.length - offset) return false;
    }
    return true;
  }
  if (ext === "woff" || ext === "woff2") {
    const woff2 = ext === "woff2";
    if (data.length < (woff2 ? 48 : 44) ||
        data.toString("ascii", 0, 4) !== (woff2 ? "wOF2" : "wOFF") ||
        data.readUInt32BE(8) !== data.length) return false;
    const count = data.readUInt16BE(12);
    if (!count || !data.readUInt32BE(16)) return false;
    if (woff2) {
      // WOFF2's variable-length table directory prevents fixed-offset table
      // checks; bound its declared compressed stream against the payload.
      const compressed = data.readUInt32BE(20);
      return compressed > 0 && compressed <= data.length - 48;
    }
    const directoryEnd = 44 + 20 * count;
    if (directoryEnd > data.length) return false;
    for (let i = 0; i < count; i++) {
      const entry = 44 + 20 * i;
      const offset = data.readUInt32BE(entry + 4);
      const compressed = data.readUInt32BE(entry + 8);
      const original = data.readUInt32BE(entry + 12);
      if (!compressed || !original || compressed > original ||
          offset < directoryEnd || offset > data.length || compressed > data.length - offset) return false;
    }
    return true;
  }
  if (ext === "ttf" || ext === "otf") {
    if (data.length < 12 || (ext === "ttf" ? data.readUInt32BE(0) !== 0x00010000 :
        data.toString("ascii", 0, 4) !== "OTTO")) return false;
    const count = data.readUInt16BE(4);
    const directoryEnd = 12 + 16 * count;
    if (!count || directoryEnd > data.length) return false;
    for (let i = 0; i < count; i++) {
      const entry = 12 + 16 * i;
      const offset = data.readUInt32BE(entry + 8);
      const length = data.readUInt32BE(entry + 12);
      if (!length || offset < directoryEnd || offset > data.length || length > data.length - offset) return false;
    }
    return true;
  }
  return false;
}

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
    if (file.encoding !== undefined && file.encoding !== "base64") {
      throw new ProjectFileError(400, "invalid file encoding", path);
    }
    const binary = file.encoding === "base64";
    if (binary && (file.language !== "binary" || !isBinaryProjectPath(path) ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content) ||
        !file.content || file.content.length > Math.ceil(PROJECT_FILE_LIMITS.fileBytes / 3) * 4)) {
      throw new ProjectFileError(400, "invalid binary content", path);
    }
    if (!binary && (file.language === "binary" || isBinaryProjectPath(path) ||
        file.content.includes("\0") || forbiddenSignature.test(file.content))) {
      throw new ProjectFileError(400, "binary content requires supported base64 encoding", path);
    }
    const data = binary ? Buffer.from(file.content, "base64") : Buffer.from(file.content, "utf8");
    if (binary && (data.toString("base64") !== file.content || !validBinary(path, data))) {
      throw new ProjectFileError(400, "invalid binary format", path);
    }
    const size = data.length;
    total += size;
    if (size > PROJECT_FILE_LIMITS.fileBytes || total > PROJECT_FILE_LIMITS.totalBytes) {
      throw new ProjectFileError(400, "file byte limit exceeded", path);
    }
    const scanned = binary ? data.toString("latin1") + "\n" + data.toString("utf8") : file.content;
    if (lfsPointer.test(scanned.replace(/^\uFEFF/, "")) || (name.toLowerCase() === ".gitattributes" && lfsAttributes.test(scanned))) {
      throw new ProjectFileError(400, "Git LFS pointers and tracking are unsupported", path);
    }
    if (tokens.test(scanned) ||
        /(?:password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret|authorization)\s*["']?\s*[:=]\s*["'](?:[^"'\r\n]{8,})["']/i.test(
          scanned.replace(/["'](?:YOUR_[A-Z0-9_]+|REPLACE_ME|CHANGEME|<[^<>]+>|\$\{[A-Z_][A-Z0-9_]*\})["']/g, '""')) ||
        /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i.test(scanned)) {
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
    return { path, name, language: file.language, content: file.content,
      ...(binary ? { encoding: "base64" as const } : {}) };
  });
}