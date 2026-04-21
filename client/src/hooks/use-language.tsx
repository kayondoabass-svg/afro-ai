import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { translations, languages, countryToLanguage, type LanguageCode } from "@/lib/translations";

type TranslationParams = Record<string, string | number>;

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t: (key: string, params?: TranslationParams) => string;
}

function lookup(language: LanguageCode, key: string): string | undefined {
  return translations[language]?.[key] ?? translations.en[key];
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = params[name];
    return v === undefined || v === null ? `{${name}}` : String(v);
  });
}

const LanguageContext = createContext<LanguageContextType | null>(null);

async function detectCountryLanguage(): Promise<LanguageCode> {
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      const countryCode = data.country_code;
      if (countryCode && countryToLanguage[countryCode]) {
        return countryToLanguage[countryCode];
      }
    }
  } catch {}

  const browserLangs = navigator.languages || [navigator.language];
  for (const lang of browserLangs) {
    const code = lang.split("-")[0].toLowerCase();
    if (code in translations) return code as LanguageCode;
    const mapping: Record<string, LanguageCode> = {
      sw: "sw", ar: "ar", zu: "zu", hi: "hi",
      es: "es", fr: "fr", pt: "pt", yo: "yo", ha: "ha",
      zh: "zh", gu: "gu", ta: "ta",
    };
    if (mapping[code]) return mapping[code];
  }

  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const saved = localStorage.getItem("africa-ai-lang");
    if (saved && saved in translations) return saved as LanguageCode;
    return "en";
  });
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("africa-ai-lang");
    if (!saved) {
      detectCountryLanguage().then((code) => {
        setLanguageState(code);
        localStorage.setItem("africa-ai-lang", code);
        setDetected(true);
      });
    } else {
      setDetected(true);
    }
  }, []);

  useEffect(() => {
    const langInfo = languages.find((l) => l.code === language);
    document.documentElement.dir = langInfo?.rtl ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((code: LanguageCode) => {
    setLanguageState(code);
    localStorage.setItem("africa-ai-lang", code);
  }, []);

  const t = useCallback(
    (key: string, params?: TranslationParams): string => {
      let resolvedKey = key;
      if (params && typeof params.count === "number") {
        const suffix = params.count === 1 ? "_one" : "_other";
        if (lookup(language, key + suffix) !== undefined) {
          resolvedKey = key + suffix;
        }
      }
      const template = lookup(language, resolvedKey);
      if (template === undefined) return key;
      return interpolate(template, params);
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
