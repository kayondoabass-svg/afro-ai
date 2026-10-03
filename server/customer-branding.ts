/** Customer identity is separate from platform/vendor identity. */
export const CUSTOMER_BRANDING_POLICY = `
=== CUSTOMER NAME AND DESIGN — OVERRIDES ANY CONFLICTING BUILD INSTRUCTION ===
Afro AI and KEYO are platform/vendor identities, never a customer's business or app name.
Never invent Afro-prefixed brands such as AfroBalance for customers. Never copy the platform's gold/black identity as the default customer design.
Before a NEW customer build, use the name explicitly supplied by that customer or their named project. If it is missing, ask ONE short question for their preferred app/business name and WAIT. Do not generate HTML, a plan claiming a name, or a placeholder-branded finished app in that response.
If the customer asks you to choose a name, suggest neutral choices and wait for their selection. Never treat their login/profile name or KEYO company details as their customer brand.
Do not ask again when the customer already supplied a name. Preserve the chosen name during edits. If an existing app incorrectly uses Afro AI/KEYO/an invented Afro brand, ask for the replacement name rather than preserving the error.
Customer copyright and identity use only the customer's chosen brand. Do not add Powered by Afro AI, Built by KEYO, or other vendor credits. "Made with Afro AI" is optional ONLY if the customer explicitly requests that attribution.
For new visual builds, use an intentional layout for the actual product: clear hierarchy, distinctive typography, balanced spacing, responsive navigation and meaningful content. Choose a palette for the customer's business, not Afro AI. Do not reduce a complete web-app request to a heading and four plain buttons.
A requested USSD simulator can legitimately have a short menu: label it as a simulator, provide clear interaction states and navigation, and do not claim live airtime, balances or money transfers without real integrations. Respect a customer's explicit request for a simple design. Never add invented testimonials or pretend backend functionality exists.
Existing-page edits preserve unrelated structure unless the user requested a redesign.
=== END CUSTOMER POLICY ===`;

const QUESTIONS: Record<string, string> = {
  en: "What name would you like to use for your app or business?",
  sw: "Ungependa kutumia jina gani kwa programu au biashara yako?",
  ar: "ما الاسم الذي تود استخدامه لتطبيقك أو نشاطك التجاري؟",
  zu: "Ungathanda ukusebenzisa liphi igama lohlelo lokusebenza noma lebhizinisi lakho?",
  hi: "आप अपने ऐप या व्यवसाय के लिए कौन-सा नाम रखना चाहेंगे?",
  es: "¿Qué nombre quieres usar para tu aplicación o negocio?",
  fr: "Quel nom souhaitez-vous utiliser pour votre application ou entreprise ?",
  lg: "Oyagala okukozesa linnya ki ku app yo oba bizinensi yo?",
  yo: "Orúkọ wo ni o fẹ́ lò fún app tàbí iṣẹ́ rẹ?",
  ha: "Wane suna kake so ka yi amfani da shi don manhajarka ko kasuwancinka?",
  tw: "Edin bɛn na wopɛ sɛ wode to wo app anaa w’adwuma?",
  pt: "Que nome gostaria de usar para seu aplicativo ou negócio?",
  zh: "您希望为您的应用或企业使用什么名称？",
  gu: "તમે તમારી એપ અથવા વ્યવસાય માટે કયું નામ રાખવા માંગો છો?",
};
export function customerNameQuestion(language: string) { return QUESTIONS[language] || QUESTIONS.en; }
const forbidden = /\b(?:afro[\s_-]*ai|keyo(?:\s+technologies)?|afrobalance)\b/i;
const explicitName = /\b(?:(?:app|business|company|project|website|site|store|brand)\s+(?:called|named|titled)|(?:brand|app|business|company|project|website)\s+name\s*(?:is|:))\s*["'“]?([^\n.!?]{2,100})/i;
type Message = { role: string; content: unknown };

/** Conservative deterministic gate for recognizable new-build requests; the prompt covers other languages/phrasing. */
export function needsCustomerName(history: Message[], current: string, existingHtml: string, projectName?: string | null) {
  if (existingHtml) return false;
  if (projectName && !/^(?:new|my|untitled|test)\s*(?:app|project|website)?$/i.test(projectName.trim()) && !forbidden.test(projectName)) return false;
  const users = history.filter(m => m.role === "user" && typeof m.content === "string").map(m => m.content as string);
  const all = [...users, current];
  if (all.some(text => { const match = text.match(explicitName); return !!match && !forbidden.test(match[1]); })) return false;
  let questionIndex = -1;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index].role === "assistant" && Object.values(QUESTIONS).includes(String(history[index].content))) { questionIndex = index; break; }
  }
  if (questionIndex >= 0) {
    const answer = [...history.slice(questionIndex + 1).filter(m => m.role === "user").map(m => String(m.content)), current].find(text =>
      text.trim().length >= 2 && text.length <= 100 && !forbidden.test(text) &&
      !/\b(?:choose|suggest|pick|you decide|don't know|do not know|whatever)\b/i.test(text) &&
      !/^(?:yes|no|okay|ok|sure|proceed|go ahead)$/i.test(text.trim()));
    return !answer;
  }
  if (/^\s*(?:what|why|how|explain|tell me)\b/i.test(current)) return false;
  return /\b(?:build|create|make|design|develop|generate)\b[\s\S]{0,180}\b(?:app|website|site|dashboard|store|portal|ussd|platform)\b/i.test(current);
}

/** Check visible brand locations, not code comments or technical references to the platform. */
export function hasForbiddenCustomerBrand(html: string, customerRequests = "") {
  const headings = Array.from(html.matchAll(/<(title|h1|h2)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi));
  return headings.some(match => {
    const text = match[2].replace(/<[^>]*>/g, "").replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (_m, hex, decimal) => String.fromCodePoint(Math.min(parseInt(hex || decimal, hex ? 16 : 10), 0x10ffff)))
      .replace(/&(?:nbsp|amp);/gi, " ").trim();
    if (forbidden.test(text)) return true;
    const coined = text.match(/\bAfro[A-Z][A-Za-z]+\b/g) || [];
    return coined.some(brand => !customerRequests.toLowerCase().includes(brand.toLowerCase()));
  });
}

/** A publish-form name is explicit customer input, not an AI-created title.
 * Update the document title and exact brand labels; never rewrite scripts/styles or hero copy. */
export function applyCustomerPublishName(html: string, preferredName: unknown) {
  if (typeof preferredName !== "string" || !preferredName.trim() || preferredName.trim().length > 160 ||
      forbidden.test(preferredName) || /[\u0000-\u001f]/.test(preferredName)) {
    throw new Error("Enter your preferred customer app/business name, not Afro AI or KEYO, before publishing.");
  }
  const name = preferredName.trim();
  const escaped = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const oldTitle = html.match(/<title\b[^>]*>([^<>]*)<\/title\s*>/i)?.[1]?.trim();
  const result = html.replace(
    /<(script|style|pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>|<(title|h1|h2|a|span|div|strong|p)\b([^>]*)>([^<>]*)<\/\2\s*>/gi,
    (whole, protectedTag, tag, attributes, text) => {
      if (protectedTag) return whole;
      const label = text.trim();
      const isBrandLabel = label && (label === oldTitle || forbidden.test(label) || /^Afro[A-Z][A-Za-z]+$/.test(label));
      if (tag.toLowerCase() !== "title" && !isBrandLabel) return whole;
      return `<${tag}${attributes}>${escaped}</${tag}>`;
    },
  );
  return /<title\b/i.test(result) ? result : result.replace(/<head\b[^>]*>/i, match => `${match}<title>${escaped}</title>`);
}