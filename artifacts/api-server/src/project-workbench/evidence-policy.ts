import { ProjectFileError } from "../project-file-policy";
import { safeText } from "./model";

export const EVIDENCE_LIMITS = { fileBytes: 524288, maxItems: 8, maxOwnerItems: 64 };
export function validateEvidence(body: any, current: string) {
  if (!body || body.fingerprint !== current) throw new ProjectFileError(409, "Source changed. Capture and upload evidence for the current source version.");
  if (!["image/png", "image/jpeg"].includes(body.mimeType) || typeof body.base64 !== "string" ||
      body.base64.length > Math.ceil(EVIDENCE_LIMITS.fileBytes / 3) * 4)
    throw new ProjectFileError(400, "Upload a PNG or JPEG screenshot no larger than 512 KiB.");
  const image = Buffer.from(body.base64, "base64");
  if (!image.length || image.length > EVIDENCE_LIMITS.fileBytes || image.toString("base64") !== body.base64)
    throw new ProjectFileError(400, "Invalid screenshot encoding.");
  let width = 0, height = 0;
  if (body.mimeType === "image/png") {
    if (image.length < 33 || image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || image.subarray(12, 16).toString() !== "IHDR")
      throw new ProjectFileError(400, "Invalid PNG screenshot.");
    width = image.readUInt32BE(16); height = image.readUInt32BE(20);
    let offset = 8, data = false, ended = false;
    while (offset + 12 <= image.length) {
      const length = image.readUInt32BE(offset), type = image.subarray(offset + 4, offset + 8).toString();
      if (length > image.length - offset - 12 || !/^[A-Za-z]{4}$/.test(type)) break;
      if (offset === 8 && (type !== "IHDR" || length !== 13)) break;
      if (type === "IDAT" && length) data = true;
      offset += length + 12;
      if (type === "IEND") { ended = length === 0 && offset === image.length; break; }
    }
    if (!data || !ended) throw new ProjectFileError(400, "Incomplete PNG screenshot.");
  } else {
    if (image[0] !== 255 || image[1] !== 216 || image[image.length - 2] !== 255 || image[image.length - 1] !== 217)
      throw new ProjectFileError(400, "Invalid JPEG screenshot.");
    let p = 2;
    while (p + 4 < image.length) {
      if (image[p++] !== 255) break;
      while (image[p] === 255) p++;
      const marker = image[p++];
      if (marker === 218 || marker === 217) break;
      const size = image.readUInt16BE(p);
      if (size < 2 || p + size > image.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && size >= 8) {
        height = image.readUInt16BE(p + 3); width = image.readUInt16BE(p + 5); break;
      }
      p += size;
    }
  }
  if (!width || !height || width > 8000 || height > 8000 || width * height > 16000000)
    throw new ProjectFileError(400, "Invalid or oversized screenshot dimensions.");
  if (!["before", "after"].includes(body.phase)) throw new ProjectFileError(400, "Choose Before or After.");
  const captured = new Date(body.capturedAt);
  if (!Number.isFinite(captured.getTime()) || captured.getTime() > Date.now() + 300000)
    throw new ProjectFileError(400, "Provide a valid screenshot capture time.");
  const name = safeText(body.name, 120).trim();
  if (!name) throw new ProjectFileError(400, "Name the screenshot.");
  return { name, mimeType: body.mimeType as string, base64: body.base64 as string,
    fingerprint: current, phase: body.phase as "before" | "after", pageLabel: safeText(body.pageLabel || "", 200),
    capturedAt: captured.toISOString(), width, height };
}
