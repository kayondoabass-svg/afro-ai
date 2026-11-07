import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, rename, writeFile } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MAX_WORK_BYTES, MAX_ARCHIVE_BYTES } from "./policy.mjs";

export function command(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { input, inputFile, ...spawnOptions } = options;
    const child = spawn(program, args, { stdio: ["pipe", "pipe", "pipe"], ...spawnOptions });
    let stdout = "", failed = false;
    // Provider/SQL diagnostics can contain source, credentials or signed URLs.
    // Never forward them to journals or callers.
    child.stderr.resume();
    child.stdout.on("data", b => {
      stdout += b.toString();
      if (stdout.length > 2_000_000) { failed = true; child.kill("SIGKILL"); }
    });
    child.on("error", () => reject(new Error("Required backup command unavailable")));
    child.on("close", code => code === 0 && !failed
      ? resolve(stdout) : reject(new Error("Backup command failed")));
    if (inputFile) {
      const source = createReadStream(inputFile);
      source.on("error", () => child.kill("SIGKILL"));
      child.stdin.on("error", () => {});
      source.pipe(child.stdin);
    } else child.stdin.end(input ?? "");
  });
}
export async function saveProcess(program, args, file, budget, options) {
  const child = spawn(program, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  child.stderr.resume();
  const closed = new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error("Backup process could not start")));
    child.once("close", code => code === 0 ? resolve() : reject(new Error("Backup process failed")));
  });
  closed.catch(() => {});
  try {
    const result = await saveStream(child.stdout, file, budget, MAX_ARCHIVE_BYTES);
    await closed;
    return result;
  } catch (e) {
    child.kill("SIGKILL"); await closed.catch(() => {});
    throw e;
  }
}
export async function saveStream(stream, file, budget, limit = MAX_WORK_BYTES) {
  const hash = createHash("sha256"); let bytes = 0;
  const meter = new Transform({ transform(chunk, _enc, cb) {
    bytes += chunk.length; budget.bytes += chunk.length;
    if (bytes > limit || budget.bytes > MAX_WORK_BYTES)
      return cb(new Error("Backup staging limit reached"));
    hash.update(chunk); cb(null, chunk);
  } });
  await pipeline(stream, meter, createWriteStream(file, { mode: 0o600, flags: "wx" }));
  return { bytes, sha256: hash.digest("hex") };
}
export async function fileDigest(file) {
  let bytes = 0; const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) { bytes += chunk.length; hash.update(chunk); }
  return { bytes, sha256: hash.digest("hex") };
}
export async function atomicJson(path, value, mode = 0o640) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode, flag: "wx" });
  await chmod(temporary, mode);
  await rename(temporary, path);
}
