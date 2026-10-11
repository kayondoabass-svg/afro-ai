import { catalogs } from "./locales/catalogs.mjs";

export const PREFERENCES_KEY = "keyo-studio.preferences.v1";
export const LANGUAGE_OPTIONS = ["en", "sw", "ar", "zu", "hi", "es", "fr", "lg", "yo", "ha", "tw", "pt", "zh", "gu", "ta"];
export const LANGUAGE_NAMES = { en:"English", sw:"Kiswahili", ar:"العربية", zu:"isiZulu", hi:"हिन्दी", es:"Español", fr:"Français", lg:"Oluganda", yo:"Yorùbá", ha:"Hausa", tw:"Twi", pt:"Português", zh:"中文", gu:"ગુજરાતી", ta:"தமிழ்" };
const REGION_LANGUAGE = {
  UG: "lg", KE: "sw", TZ: "sw", RW: "sw", GH: "tw", ZA: "zu",
  NG: "yo", IN: "hi", ES: "es", MX:"es", FR: "fr", PT: "pt", BR: "pt",
  CN: "zh", TW:"zh", HK:"zh", EG:"ar", SA:"ar", MA:"ar", DZ:"ar", TN:"ar",
  US: "en", GB: "en",
};
const readPreferences = (storage) => {
  try {
    const value = JSON.parse(storage?.getItem(PREFERENCES_KEY) || "{}");
    return {
      appearance: ["system", "light", "dark"].includes(value.appearance) ? value.appearance : "system",
      language: value.language === "automatic" || LANGUAGE_OPTIONS.includes(value.language) ? value.language : "automatic",
    };
  } catch { return { appearance: "system", language: "automatic" }; }
};

export function resolveLanguage(choice, navigatorLike = globalThis.navigator, intl = Intl) {
  if (choice && choice !== "automatic" && LANGUAGE_OPTIONS.includes(choice)) return choice;
  const supported = new Set(LANGUAGE_OPTIONS);
  for (const locale of navigatorLike?.languages || [navigatorLike?.language]) {
    if (!locale) continue;
    const exact = String(locale).toLowerCase().split("-")[0];
    if (supported.has(exact)) return exact;
  }
  const localeCandidates = [...(navigatorLike?.languages || []), navigatorLike?.language].filter(Boolean);
  for (const locale of localeCandidates) {
    let region = "";
    try { region = new intl.Locale(locale).region || ""; } catch {}
    if (!region) region = String(locale).match(/^[a-z]{2,3}-([a-z]{2}|[0-9]{3})(?:-|$)/i)?.[1] || "";
    if (REGION_LANGUAGE[String(region).toUpperCase()]) return REGION_LANGUAGE[String(region).toUpperCase()];
  }
  try {
    const region = new intl.DateTimeFormat().resolvedOptions().locale.split("-").at(-1);
    if (REGION_LANGUAGE[String(region).toUpperCase()]) return REGION_LANGUAGE[String(region).toUpperCase()];
  } catch {}
  return "en";
}

function safeStorage() { try { return globalThis.localStorage; } catch { return undefined; } }
export function createPreferencesRuntime({ document: doc = globalThis.document, navigator: nav = globalThis.navigator, storage = safeStorage(), window: win = globalThis.window } = {}) {
  let preferences = readPreferences(storage);
  let language = resolveLanguage(preferences.language, nav);
  const t = (key, values = {}) => {
    const template = catalogs[language]?.[key] ?? catalogs.en[key] ?? key;
    return template.replace(/\{([^}]+)\}/g, (_, name) => String(values[name] ?? ""));
  };
  const applyAppearance = () => {
    const dark = preferences.appearance === "dark" || (preferences.appearance === "system" && Boolean(win?.matchMedia?.("(prefers-color-scheme: dark)").matches));
    doc?.documentElement?.setAttribute("data-theme", dark ? "dark" : "light");
    doc?.documentElement?.style?.setProperty("color-scheme", dark ? "dark" : "light");
  };
  const applyLanguage = () => {
    language = resolveLanguage(preferences.language, nav);
    const rtl = language === "ar";
    doc?.documentElement?.setAttribute("lang", language);
    doc?.documentElement?.setAttribute("dir", rtl ? "rtl" : "ltr");
    doc?.querySelectorAll?.("[data-i18n]").forEach(node => {
      const values = {};
      for (const [name, value] of Object.entries(node.dataset)) {
        if (name.startsWith("i18n") && name !== "i18n") values[name.slice(4).toLowerCase()] = value;
      }
      node.textContent = t(node.dataset.i18n, values);
    });
    for (const attr of ["placeholder", "title", "aria-label"]) {
      const datasetKey = `i18n${attr.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()).replace(/^./, letter => letter.toUpperCase())}`;
      doc?.querySelectorAll?.(`[data-i18n-${attr}]`).forEach(node => node.setAttribute(attr, t(node.dataset[datasetKey])));
    }
  };
  const persist = () => {
    try { storage?.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); } catch {}
    applyAppearance(); applyLanguage();
    win?.dispatchEvent?.(new win.CustomEvent("keyo:localechange", { detail: { language, t } }));
  };
  const media = win?.matchMedia?.("(prefers-color-scheme: dark)");
  const onSystemChange = () => { if (preferences.appearance === "system") applyAppearance(); };
  media?.addEventListener?.("change", onSystemChange);
  const setAppearance = value => { if (["system", "light", "dark"].includes(value)) { preferences = { ...preferences, appearance: value }; persist(); } };
  const setLanguage = value => { if (value === "automatic" || LANGUAGE_OPTIONS.includes(value)) { preferences = { ...preferences, language: value }; persist(); } };
  const start = () => { applyAppearance(); applyLanguage(); };
  return { t, start, setAppearance, setLanguage, get language() { return language; }, get preferences() { return { ...preferences }; } };
}
