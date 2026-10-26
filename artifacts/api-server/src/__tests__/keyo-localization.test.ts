// @vitest-environment node
import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { keyoStudioPage } from "../keyo-studio-page";
import { keyoLanguages, preferredKeyoLanguage, keyoText } from "../keyo-studio-i18n";
import catalogs from "../keyo-studio-translations.json";
import { authHomeTranslations } from "../../client/src/lib/auth-home-translations";

describe("KEYO public page localization", () => {
  it("covers all 15 languages and preserves every interpolation variable", () => {
    const english = catalogs.en;
    expect(Object.keys(catalogs).sort()).toEqual(keyoLanguages.map(([code]) => code).sort());
    for (const [code] of keyoLanguages) {
      const dictionary = catalogs[code];
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(english).sort());
      expect(authHomeTranslations[code]).toBeTruthy();
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim()).not.toBe("");
        expect((value.match(/\{\w+\}/g) ?? []).sort()).toEqual((key.match(/\{\w+\}/g) ?? []).sort());
      }
    }
  });

  it("renders translated instructions, selectors, metadata and Arabic RTL without altering links or commands", () => {
    const english = new JSDOM(keyoStudioPage()).window.document;
    const links = [...english.querySelectorAll("a")].map(node => node.getAttribute("href"));
    const commands = [...english.querySelectorAll("pre")].map(node => node.textContent);
    for (const [code] of keyoLanguages) {
      const doc = new JSDOM(keyoStudioPage(code)).window.document;
      expect(doc.documentElement.lang).toBe(code);
      expect(doc.documentElement.dir).toBe(code === "ar" ? "rtl" : "ltr");
      expect([...doc.querySelectorAll("a")].map(node => node.getAttribute("href"))).toEqual(links);
      expect([...doc.querySelectorAll("pre")].map(node => node.textContent)).toEqual(commands);
      expect(doc.querySelector("#page-language option[value='ar']")?.textContent).toBe("العربية");
      expect(doc.querySelector("#install-windows h2")?.textContent).toBe(keyoText(code, "Download, open, then try a model."));
      expect(doc.querySelector("#install-macos h2")?.textContent).toBe(keyoText(code, "Choose your Mac’s processor."));
      if (code !== "en") expect(doc.querySelector("h1")?.textContent).not.toBe(english.querySelector("h1")?.textContent);
    }
  });

  it("resolves browser language quality, region fallback and invalid inputs safely", () => {
    expect(preferredKeyoLanguage("fr-CA, en;q=0.8")).toBe("fr");
    expect(preferredKeyoLanguage("en;q=0, ar;q=0.9")).toBe("ar");
    expect(preferredKeyoLanguage("fr;q=0.2, es;q=0.9")).toBe("es");
    expect(preferredKeyoLanguage("und", "UG")).toBe("lg");
    expect(preferredKeyoLanguage("invalid")).toBe("en");
    expect(keyoStudioPage("<script>")).toContain('<html lang="en" dir="ltr">');
  });

  it("persists public theme choices and follows OS changes only in System mode", () => {
    let systemDark = true;
    const listeners: Array<() => void> = [];
    const dom = new JSDOM(keyoStudioPage("fr"), {
      url: "https://example.test/keyo-studio?lang=fr", runScripts: "dangerously",
      beforeParse(window) {
        window.matchMedia = (() => ({
          get matches() { return systemDark; },
          addEventListener(_event: string, listener: () => void) { listeners.push(listener); },
        })) as any;
      },
    });
    const { window } = dom;
    const select = window.document.querySelector<HTMLSelectElement>("#page-theme")!;
    expect(window.document.documentElement.dataset.theme).toBe("dark");
    select.value = "light";
    select.dispatchEvent(new window.Event("change"));
    expect(window.localStorage.getItem("keyo-page-theme")).toBe("light");
    systemDark = true;
    listeners.forEach(listener => listener());
    expect(window.document.documentElement.dataset.theme).toBe("light");
    select.value = "system";
    select.dispatchEvent(new window.Event("change"));
    systemDark = false;
    listeners.forEach(listener => listener());
    expect(window.document.documentElement.dataset.theme).toBe("light");
    systemDark = true;
    listeners.forEach(listener => listener());
    expect(window.document.documentElement.dataset.theme).toBe("dark");
    dom.window.close();
  });

  it("includes the explicit homepage link outside the login form", () => {
    const source = readFileSync("client/src/pages/login.tsx", "utf8");
    expect(source).toContain('data-testid="link-login-home"');
    expect(source).toContain('<Link href="/"');
    expect(source).toContain('t("auth.backHome")');
  });
});
