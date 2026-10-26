import { ProjectFileError } from "../project-file-policy";
import { EVIDENCE_LIMITS, validateEvidence } from "./evidence-policy";

export const VISUAL_PROFILES = {
  desktop: { width: 1280, height: 800, label: "Desktop Laptop View" },
  mobile: { width: 375, height: 812, label: "iPhone-sized Mobile View (Chromium, not Safari)" },
} as const;
export type VisualProfile = keyof typeof VISUAL_PROFILES;
export class BrowserCaptureError extends ProjectFileError {
  constructor(status: number, message: string, public uncertain: boolean) { super(status, message); }
}
export function browserCaptureCapability() {
  const configured = !!((process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID) && process.env.CLOUDFLARE_API_TOKEN);
  const enabled = process.env.AFRO_BROWSER_CAPTURE_ENABLED === "true" && configured;
  return { configured, enabled, permissionVerified: false,
    mode: "remote-static-offline", profiles: VISUAL_PROFILES,
    reason: enabled ? "Authorization is checked on capture; no server package execution or external page requests."
      : "Visual verification blocked: remote browser capture must be explicitly enabled with Browser Rendering permission.",
    limitations: ["Saved static HTML/CSS/classic JavaScript only", "External network requests blocked", "No full-stack server, package installation, real Safari, checkout or deployment verification"] };
}
export async function remoteScreenshot(html: string, profile: VisualProfile, source: string, phase: "before" | "after", signal: AbortSignal) {
  if (!browserCaptureCapability().enabled) throw new ProjectFileError(503, browserCaptureCapability().reason);
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  if (!/^[a-f0-9]{32}$/i.test(account || "")) throw new ProjectFileError(503, "Remote browser account is not configured.");
  const viewport = VISUAL_PROFILES[profile];
  // No user URL, cookies, auth headers, provider key or host filesystem enters
  // the page. The browser is remote; outbound requests are fail-closed.
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/browser-rendering/screenshot?cacheTTL=0`, {
    method: "POST", redirect: "error",
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ html, viewport: { width: viewport.width, height: viewport.height, deviceScaleFactor: 1 },
      allowRequestPattern: ["^data:", "^about:blank$"],
      rejectRequestPattern: ["^https?://", "^wss?://", "^file:", "^ftp:"],
      gotoOptions: { waitUntil: "networkidle0", timeout: 15000 }, actionTimeout: 5000, bestAttempt: false,
      screenshotOptions: { type: "jpeg", quality: 80, fullPage: false } }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new BrowserCaptureError(response.status === 401 || response.status === 403 ? 503 : 502,
      response.status === 401 || response.status === 403
        ? "Visual verification blocked: browser provider denied access. Administrator must authorize Browser Rendering."
        : "Browser capture was not confirmed. Do not automatically retry this capture.",
      ![400,401,403,404,429].includes(response.status));
  }
  if (!response.headers.get("content-type")?.startsWith("image/jpeg")) {
    await response.body?.cancel();
    throw new ProjectFileError(502, "Browser returned no valid screenshot.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ProjectFileError(502, "Browser returned no screenshot bytes.");
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > EVIDENCE_LIMITS.fileBytes) throw new ProjectFileError(413, "Captured screenshot exceeds the private evidence size limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  signal.throwIfAborted();
  const item = validateEvidence({ name: `${viewport.label} · ${phase}`, mimeType: "image/jpeg",
    base64: Buffer.concat(chunks).toString("base64"), fingerprint: source, phase, capturedAt: new Date().toISOString(), pageLabel: "Saved project snapshot" }, source);
  if (item.width !== viewport.width || item.height !== viewport.height) throw new ProjectFileError(502, "Browser screenshot dimensions do not match the requested view.");
  return { ...item, profile, provenance: "remote-browser", viewport: { width: viewport.width, height: viewport.height } };
}
