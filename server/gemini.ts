import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API || "");

export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
  prompt?: string
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const analysisPrompt = prompt || 
    `You are an expert image analyst. Analyze this image carefully and provide a detailed report:

1. **What it is**: Identify the main object, product, scene, or subject in the image. Be as specific as possible (e.g., "Samsung Galaxy S24 Ultra smartphone" instead of just "phone").
2. **Description**: Detailed description of what you see — colors, shapes, materials, setting, lighting.
3. **Key details**: Any visible text, brand logos, labels, serial numbers, model numbers, or distinguishing features.
4. **Category**: What category this falls under (food, electronics, clothing, vehicle, furniture, nature, document, etc.)
5. **Estimated value/price**: If it's a product, estimate the price range in USD and common African currencies (KSh, NGN, UGX, GHS).
6. **Condition**: If applicable, describe the condition (new, used, damaged, etc.)
7. **Additional info**: Any other relevant information — origin, manufacturer, common uses, interesting facts.

Be confident and specific. If you're uncertain about something, say so, but always provide your best analysis.`;

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: imageBase64,
        },
      },
      { text: analysisPrompt },
    ]);

    const response = result.response;
    const text = response.text();
    
    if (!text || text.trim().length === 0) {
      throw new Error("Gemini returned an empty response. The image may be too dark, blurry, or unclear.");
    }
    
    return text;
  } catch (error: any) {
    console.error("Gemini API error details:", error.message, error.status, error.statusText);
    
    if (error.message?.includes("SAFETY")) {
      throw new Error("The image was blocked by safety filters. Please try a different image.");
    }
    if (error.message?.includes("quota") || error.message?.includes("429")) {
      throw new Error("Image analysis rate limit reached. Please wait a moment and try again.");
    }
    if (error.message?.includes("invalid") || error.message?.includes("decode")) {
      throw new Error("The image could not be processed. Please try a clearer photo.");
    }
    
    throw error;
  }
}

export async function analyzeImageFromUrl(
  imageUrl: string,
  prompt?: string
): Promise<string> {
  const response = await fetch(imageUrl);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = response.headers.get("content-type") || "image/jpeg";
  return analyzeImage(base64, mimeType, prompt);
}
