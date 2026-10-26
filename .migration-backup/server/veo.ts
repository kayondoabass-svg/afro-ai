// Veo 2 video generation via the Gemini REST API.
//
// Veo is asynchronous: POST kicks off a long-running operation, then we
// poll until it completes (typically 30-90 seconds for a 5-second clip).
// Cost is roughly $0.35 per second of generated video, so we hard-cap
// duration at 5 seconds and gate the route to BUSINESS plan + above
// (see server/replit_integrations/quota.ts DAILY_REQUEST_LIMITS.video).

const VEO_MODEL = "veo-2.0-generate-001";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";
const MAX_DURATION_SECONDS = 5;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60_000; // 5 minutes — Veo can take a while.

export interface VeoResult {
  videoBase64: string;
  mimeType: string;
  durationSeconds: number;
}

function key(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API;
}

export function isVeoAvailable(): boolean {
  return Boolean(key());
}

async function startGeneration(prompt: string, durationSeconds: number, apiKey: string, signal?: AbortSignal): Promise<string> {
  const url = `${ENDPOINT}/models/${VEO_MODEL}:predictLongRunning?key=${encodeURIComponent(apiKey)}`;
  const body = {
    instances: [{ prompt }],
    parameters: {
      aspectRatio: "16:9",
      durationSeconds,
      personGeneration: "allow_adult",
    },
  };
  const res = await fetch(url, {
    signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const err: any = new Error(`Veo start failed (${res.status}): ${txt.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data: any = await res.json().catch(() => ({}));
  const opName: string | undefined = data?.name;
  if (!opName) throw new Error("Veo did not return an operation name.");
  return opName;
}

async function pollOperation(opName: string, apiKey: string, signal?: AbortSignal): Promise<any> {
  const startedAt = Date.now();
  const url = `${ENDPOINT}/${opName}?key=${encodeURIComponent(apiKey)}`;
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const error = new Error(`Veo poll failed (${res.status}): ${txt.slice(0, 200)}`);
      Object.assign(error, { status: res.status });
      throw error;
    }
    const data: any = await res.json().catch(() => ({}));
    if (data?.done) {
      if (data?.error) {
        throw new Error(`Veo generation error: ${data.error?.message || JSON.stringify(data.error)}`);
      }
      return data?.response;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  const timeout = new Error("Veo generation timed out after 5 minutes.");
  timeout.name = "TimeoutError";
  throw timeout;
}

export async function generateVideoWithVeo(
  prompt: string,
  opts: { durationSeconds?: number; signal?: AbortSignal } = {},
): Promise<VeoResult> {
  const duration = opts.durationSeconds === undefined ? 5 : opts.durationSeconds;
  if (!Number.isInteger(duration) || duration < 2 || duration > MAX_DURATION_SECONDS)
    throw new Error("VEO_INVALID_DURATION");
  const apiKey = key();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const opName = await startGeneration(prompt, duration, apiKey, opts.signal);
  const response = await pollOperation(opName, apiKey, opts.signal);

  const sample = response?.generatedSamples?.[0] || response?.videos?.[0];
  const videoBytes: string | undefined =
    sample?.video?.bytesBase64Encoded ||
    sample?.bytesBase64Encoded ||
    response?.videoBytes;
  if (!videoBytes) {
    throw new Error("Veo returned no video bytes.");
  }
  return {
    videoBase64: videoBytes,
    mimeType: sample?.video?.mimeType || sample?.mimeType || "video/mp4",
    durationSeconds: duration,
  };
}
