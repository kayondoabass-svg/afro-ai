import catalogs from "./keyo-studio-translations.json";
import { KEYO_VERSION } from "../packages/keyo-studio/src/version.mjs";

export const keyoLanguages = [
  ["en", "English"], ["sw", "Kiswahili"], ["ar", "العربية"], ["zu", "isiZulu"],
  ["hi", "हिन्दी"], ["es", "Español"], ["fr", "Français"], ["lg", "Oluganda"],
  ["yo", "Yorùbá"], ["ha", "Hausa"], ["tw", "Twi"], ["pt", "Português"],
  ["zh", "中文"], ["gu", "ગુજરાતી"], ["ta", "தமிழ்"],
] as const;

export function validKeyoLanguage(value: unknown): string | undefined {
  return typeof value === "string" && keyoLanguages.some(([code]) => code === value) ? value : undefined;
}

export function preferredKeyoLanguage(acceptLanguage = "", country = ""): string {
  const candidates = acceptLanguage.split(",").map((entry, index) => {
    const [tag, quality] = entry.trim().split(";");
    return { tag, index, quality: quality ? Number(quality.replace(/^q=/, "")) : 1 };
  }).filter(entry => Number.isFinite(entry.quality) && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { tag } of candidates) {
    const code = validKeyoLanguage(tag.toLowerCase().split("-")[0]);
    if (code) return code;
  }
  const regions: Record<string, string> = { UG: "lg", KE: "sw", TZ: "sw", NG: "yo", GH: "tw", ZA: "zu", IN: "hi", CN: "zh", TW: "zh", BR: "pt", PT: "pt", FR: "fr", ES: "es", EG: "ar", SA: "ar" };
  return regions[country.toUpperCase()] ?? "en";
}

export function keyoText(language: string, text: string): string {
  const dictionary = (catalogs as Record<string, Record<string, string>>)[language] ?? {};
  const key = text.replaceAll(KEYO_VERSION, "{version}");
  return (dictionary[key] ?? text).replaceAll("{version}", KEYO_VERSION);
}

export function escapeKeyoText(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

// The input is our owned static template, never customer HTML. Preserve commands,
// script/style contents, download URLs and model filenames exactly.
export function localizeKeyoMarkup(html: string, language: string): string {
  if (language === "en") return html;
  return html.replace(/<!--[\s\S]*?-->|<(script|style|pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>|<[^>]+>|[^<]+/gi, token => {
    if (token.startsWith("<")) {
      if (/^<(?:script|style|pre|code)\b/i.test(token)) return token;
      return token.replace(/\b(aria-label|title|placeholder|content)="([^"]*)"/g, (match, attr, value) => {
        const translated = keyoText(language, value);
        return translated === value ? match : `${attr}="${escapeKeyoText(translated)}"`;
      });
    }
    const text = token.trim();
    const translated = keyoText(language, text);
    return translated === text ? token : token.replace(text, escapeKeyoText(translated));
  });
}
