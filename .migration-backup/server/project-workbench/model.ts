import { createHash } from "node:crypto";
import { ProjectFileError, validateProjectFiles, type ProjectFile } from "../project-file-policy";
import { redactPrivateCredentials, containsPrivateCredential } from "../chat-credential-safety";

export type Operation = { kind: "patch" | "rename" | "delete"; path: string; to?: string; find?: string; replace?: string };
export type Check = { name: string; status: "passed" | "failed" | "blocked" | "skipped"; detail: string };
export const fingerprint = (files: ProjectFile[]) => createHash("sha256").update(JSON.stringify(
  [...files].sort((a, b) => a.path.localeCompare(b.path)).map(f => [f.path, f.language, f.encoding || "utf8", f.content]),
)).digest("hex");
export function safeText(value: unknown, max = 16000) {
  if (typeof value !== "string" || Buffer.byteLength(value) > max || containsPrivateCredential(value)) {
    throw new ProjectFileError(400, "invalid text or private credentials");
  }
  return redactPrivateCredentials(value);
}
export function applyOperations(input: ProjectFile[], raw: unknown): { files: ProjectFile[]; operations: Operation[] } {
  if (!Array.isArray(raw) || !raw.length || raw.length > 8) throw new ProjectFileError(400, "provide 1–8 operations");
  let files = validateProjectFiles(input);
  const operations: Operation[] = [];
  const touched = new Set<string>();
  for (const op of raw) {
    if (!op || typeof op !== "object" || !["patch", "rename", "delete"].includes(op.kind) ||
        Object.keys(op).some(k => !["kind", "path", "to", "find", "replace"].includes(k))) throw new ProjectFileError(400, "invalid operation");
    const file = files.find(f => f.path === op.path);
    if (!file || touched.has(file.path.toLowerCase())) throw new ProjectFileError(400, "file missing or touched twice");
    touched.add(file.path.toLowerCase());
    if (op.kind === "patch") {
      const find = safeText(op.find, 8000), replace = safeText(op.replace, 8000);
      if (file.encoding || !find || find === replace || containsPrivateCredential(file.content)) throw new ProjectFileError(400, "invalid text patch");
      const first = file.content.indexOf(find);
      if (first < 0 || file.content.indexOf(find, first + 1) >= 0) throw new ProjectFileError(409, "patch must match exactly once");
      files = files.map(f => f === file ? { ...f, content: f.content.slice(0, first) + replace + f.content.slice(first + find.length) } : f);
      operations.push({ kind: "patch", path: file.path, find, replace });
    } else if (op.kind === "rename") {
      if (typeof op.to !== "string" || op.to === file.path || files.some(f => f.path.toLowerCase() === op.to.toLowerCase())) throw new ProjectFileError(409, "destination already exists or is invalid");
      const moved = validateProjectFiles([{ ...file, path: op.to, name: op.to.split("/").at(-1)! }])[0];
      files = files.map(f => f === file ? moved : f);
      touched.add(moved.path.toLowerCase());
      operations.push({ kind: "rename", path: file.path, to: moved.path });
    } else {
      files = files.filter(f => f !== file);
      operations.push({ kind: "delete", path: file.path });
    }
  }
  return { files: validateProjectFiles(files), operations };
}
export function structuralChecks(files: ProjectFile[], requirements: string, checks: string[]): Check[] {
  const results: Check[] = [];
  results.push({ name: "Source files", status: files.length ? "passed" : "failed", detail: `${files.length} validated files; no code executed.` });
  results.push({ name: "Requirements", status: requirements.trim() ? "passed" : "blocked", detail: requirements.trim() ? "Requirements recorded; their behaviour still needs testing." : "Save requirements before claiming completion." });
  const pkg = files.find(f => f.path === "package.json");
  if (pkg) {
    try { JSON.parse(pkg.content); results.push({ name: "package.json syntax", status: "passed", detail: "Valid JSON; dependencies and build have not run." }); }
    catch { results.push({ name: "package.json syntax", status: "failed", detail: "Invalid JSON." }); }
  }
  if (!pkg) {
    const html = files.find(f => f.path === "index.html");
    results.push({ name: "Static entry", status: html?.content.trim() ? "passed" : "failed", detail: html?.content.trim() ? "index.html exists; appearance and interactions are unchecked." : "Missing or empty index.html." });
  }
  results.push({ name: "Runtime and browser checks", status: "blocked", detail: "Download the local validation bundle, inspect it, run it on your computer, then import its report." });
  for (const check of checks) results.push({ name: check, status: "blocked", detail: "Acceptance requirement recorded; supply an executable check locally." });
  return results;
}
export function normalizeReport(raw: any, expected: string) {
  if (!raw || raw.fingerprint !== expected || !Array.isArray(raw.checks) || !raw.checks.length || raw.checks.length > 60) {
    throw new ProjectFileError(409, "report does not match current workspace or has no checks");
  }
  const checks: Check[] = raw.checks.map((c: any) => {
    if (!c || !["passed", "failed", "blocked", "skipped"].includes(c.status)) throw new ProjectFileError(400, "invalid check status");
    return { name: safeText(c.name, 160), status: c.status, detail: safeText(c.detail, 4000) };
  });
  const status = checks.some(c => c.status === "failed") ? "failed" :
    checks.some(c => c.status === "blocked" || c.status === "skipped") ? "blocked" : "passed";
  return { fingerprint: expected, checks, status, source: "customer-reported" };
}
