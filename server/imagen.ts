import OpenAI from "openai";

const IMAGEN_MODEL = "imagen-3.0-generate-002";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

export interface ImagenResult {
  b64_json: string;
  mimeType: string;
}

function key(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API;
}

export function isImagenAvailable(): boolean {
  return Boolean(key());
}

export async function generateImageWithImagen(
  prompt: string,
  opts: { aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" } = {},
): Promise<ImagenResult> {
  const apiKey = key();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const url = `${ENDPOINT}/models/${IMAGEN_MODEL}:predict?key=${encodeURIComponent(apiKey)}`;
  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: opts.aspectRatio || "1:1",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const err: any = new Error(
      `Imagen request failed (${res.status}): ${txt.slice(0, 300)}`,
    );
    err.status = res.status;
    throw err;
  }

  const data: any = await res.json().catch(() => ({}));
  const pred = data?.predictions?.[0];
  const b64 = pred?.bytesBase64Encoded;
  if (!b64) {
    throw new Error("Imagen returned no image data — try a different prompt.");
  }
  return { b64_json: b64, mimeType: pred.mimeType || "image/png" };
}

// OpenAI fallback so that an Imagen outage / quota issue doesn't break
// image generation entirely.
export async function generateImageWithOpenAIFallback(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024",
): Promise<ImagenResult> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OpenAI key configured for image fallback.");
  const client = new OpenAI({ apiKey });
  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size,
  });
  const data = response.data?.[0];
  if (!data?.b64_json) {
    throw new Error("OpenAI image generation returned no data.");
  }
  return { b64_json: data.b64_json, mimeType: "image/png" };
}
