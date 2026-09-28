import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { productSelfKnowledge } from "../product-self-knowledge";

const original = {
  HF_TOKEN: process.env.HF_TOKEN,
  AFRO_AI_BASE_URL: process.env.AFRO_AI_BASE_URL,
  AFRO_AI_MODEL: process.env.AFRO_AI_MODEL,
  JINA_API_KEY: process.env.JINA_API_KEY,
};
afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("trusted product context", () => {
  it("reports unconfigured and unauthorized capabilities without revealing secrets or implying successful inference", () => {
    delete process.env.HF_TOKEN;
    delete process.env.AFRO_AI_BASE_URL;
    delete process.env.AFRO_AI_MODEL;
    delete process.env.JINA_API_KEY;
    const unavailable = productSelfKnowledge({ afroAuthorized: true });
    expect(unavailable).toContain("not configured in this runtime");
    expect(unavailable).toContain("Jina search is not configured");
    expect(unavailable).toContain("/knowledge");
    expect(unavailable).toContain("PDF, TXT, MD, CSV or JSON");
    expect(unavailable).toContain("no OCR");
    expect(unavailable).toContain("5 MB");
    expect(unavailable).toContain("first two minutes");
    expect(unavailable).toContain("BOTH a configured provider and the media storage migration");
    expect(unavailable).toContain("200 files");
    expect(unavailable).toContain("legacy founder console /d1");
    process.env.HF_TOKEN = "private-token";
    process.env.AFRO_AI_BASE_URL = "https://private.example/v1";
    process.env.AFRO_AI_MODEL = "private-model";
    process.env.JINA_API_KEY = "private-jina";
    const restricted = productSelfKnowledge({ afroAuthorized: false });
    expect(restricted).toContain("no confirmed authorization");
    const available = productSelfKnowledge({ afroAuthorized: true });
    expect(available).toContain("authorized and the Afro text provider is configured");
    expect(available).toContain("successful live inference is not verified");
    expect(available).toContain("Jina search is configured");
    for (const prompt of [restricted, available]) {
      for (const secret of ["private-token", "private.example", "private-model", "private-jina"]) {
        expect(prompt).not.toContain(secret);
      }
    }
  });

  it("assembles trusted context in builder, founder, selected-file, Knowledge Ask, standalone audio and legacy voice paths", () => {
    const chat = readFileSync(resolve(__dirname, "../replit_integrations/chat/routes.ts"), "utf8");
    expect(chat).toContain("let contextPrompt = isFounderRequest ? FOUNDER_COMMAND_SYSTEM_PROMPT : BUILDER_SYSTEM_PROMPT");
    expect(chat).toMatch(/contextPrompt \+= productSelfKnowledge\(\{ afroAuthorized: isFounderRequest \}\);\s*contextPrompt \+= CHAT_CREDENTIAL_POLICY;\s*const systemMessage/);
    expect(chat).toMatch(/role: "system", content: prompt \+ productSelfKnowledge\(\{ afroAuthorized: false \}\) \+ CHAT_CREDENTIAL_POLICY/);
    expect(chat).toContain("content: contextPrompt");
    const knowledge = readFileSync(resolve(__dirname, "../routes.ts"), "utf8").split('app.post("/api/knowledge/ask"')[1]!;
    expect(knowledge).toContain('system.content += productSelfKnowledge({ afroAuthorized: body.provider === "afro-test" })');
    expect(knowledge).toContain("messages: [system, ...history");
    const audio = readFileSync(resolve(__dirname, "../replit_integrations/audio/routes.ts"), "utf8");
    expect(audio).toContain("const selfKnowledge = productSelfKnowledge({ afroAuthorized: authorized })");
    expect(audio.match(/role: "system", content: selfKnowledge/g)).toHaveLength(2);
    expect(audio).toContain('role: "system" as const, content: productSelfKnowledge({ afroAuthorized: false })');
  });
});