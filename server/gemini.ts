import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
  prompt?: string
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const analysisPrompt = prompt || 
    `Analyze this image in detail. Provide:
1. **What it is**: Identify the object, product, scene, or subject
2. **Description**: Detailed description of what you see
3. **Key details**: Brand, text, colors, materials, or notable features
4. **Category**: What category this falls under (food, electronics, clothing, nature, etc.)
5. **Estimated value/price**: If it's a product, estimate the price range
6. **Additional info**: Any other relevant information (origin, manufacturer, usage, etc.)

Be specific and helpful. If you recognize a brand or product, provide as much detail as possible.`;

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: imageBase64,
      },
    },
    { text: analysisPrompt },
  ]);

  const response = result.response;
  return response.text();
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
