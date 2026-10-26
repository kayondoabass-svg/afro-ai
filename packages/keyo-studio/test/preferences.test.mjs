import test from "node:test";
import assert from "node:assert/strict";
import { createPreferencesRuntime, LANGUAGE_OPTIONS, PREFERENCES_KEY, resolveLanguage } from "../desktop/renderer/preferences.mjs";
import { catalogs } from "../desktop/renderer/locales/catalogs.mjs";

function setup(initial = {}, language = "en-US", languages = [language]) {
  const values = new Map([[PREFERENCES_KEY, JSON.stringify(initial)]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const attrs = new Map();
  const root = { setAttribute: (key, value) => attrs.set(key, value), style: { setProperty() {} } };
  const translated = { dataset: { i18n: "preferences.title" }, textContent: "" };
  const accessible = { dataset: { i18nAriaLabel: "sidebar.conversations" }, setAttribute(key, value) { this[key] = value; } };
  const doc = {
    documentElement: root,
    querySelectorAll(selector) { return selector === "[data-i18n]" ? [translated] : selector === "[data-i18n-aria-label]" ? [accessible] : []; },
  };
  let listener;
  const media = { matches: false, addEventListener(event, fn) { if (event === "change") listener = fn; } };
  const dispatched = [];
  const win = {
    matchMedia: () => media,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent(event) { dispatched.push(event); },
  };
  const runtime = createPreferencesRuntime({ document: doc, navigator: { language, languages }, storage, window: win });
  return { runtime, values, attrs, translated, accessible, media, onMedia: () => listener, dispatched };
}

test("preferences persist explicit appearance and language selections", () => {
  const ctx = setup();
  ctx.runtime.start();
  assert.deepEqual(ctx.runtime.preferences, { appearance: "system", language: "automatic" });
  ctx.runtime.setAppearance("dark");
  ctx.runtime.setLanguage("ar");
  assert.deepEqual(JSON.parse(ctx.values.get(PREFERENCES_KEY)), { appearance: "dark", language: "ar" });
  assert.equal(ctx.attrs.get("data-theme"), "dark");
  assert.equal(ctx.attrs.get("dir"), "rtl");
});

test("system appearance follows OS changes only while system mode is active", () => {
  const ctx = setup();
  ctx.runtime.start();
  ctx.media.matches = true;
  ctx.onMedia()();
  assert.equal(ctx.attrs.get("data-theme"), "dark");
  ctx.runtime.setAppearance("light");
  ctx.media.matches = false;
  ctx.onMedia()();
  assert.equal(ctx.attrs.get("data-theme"), "light");
});

test("automatic locale prefers supported navigator language then local region mapping", () => {
  assert.equal(resolveLanguage("automatic", { languages: ["fr-CA", "en-US"], language: "fr-CA" }), "fr");
  assert.equal(resolveLanguage("automatic", { languages: ["und"], language: "und-UG" }), "lg");
  assert.equal(resolveLanguage("automatic", { languages: ["zz-ZZ", "und-GH"], language: "zz-ZZ" }), "tw");
  assert.equal(resolveLanguage("automatic", { languages: ["und"], language: "und-ZZ" }), "en");
  assert.equal(resolveLanguage("sw", { languages: ["en-US"] }), "sw");
  assert.equal(LANGUAGE_OPTIONS.length, 15);
});

test("runtime applies English catalog text, metadata, and RTL on language changes", () => {
  const ctx = setup();
  ctx.runtime.start();
  assert.equal(ctx.translated.textContent, "Preferences");
  assert.equal(ctx.accessible["aria-label"], "Conversations");
  ctx.runtime.setLanguage("ar");
  assert.equal(ctx.translated.textContent, catalogs.ar["preferences.title"]);
  assert.equal(ctx.accessible["aria-label"], catalogs.ar["sidebar.conversations"]);
  assert.equal(ctx.attrs.get("lang"), "ar");
  assert.equal(ctx.attrs.get("dir"), "rtl");
  assert.equal(ctx.dispatched.at(-1).type, "keyo:localechange");
});

test("every supported offline catalog is complete and preserves interpolation placeholders", () => {
  assert.deepEqual(Object.keys(catalogs).sort(), [...LANGUAGE_OPTIONS].sort());
  for (const [language, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(catalogs.en).sort(), language);
    for (const [key, value] of Object.entries(catalog)) {
      assert.ok(value.trim(), `${language}.${key}`);
      assert.deepEqual((value.match(/\{[^}]+\}/g) || []).sort(), (catalogs.en[key].match(/\{[^}]+\}/g) || []).sort(), `${language}.${key}`);
    }
  }
});

test("a saved manual language survives reopening and switching to automatic follows the device", () => {
  const first = setup({ language: "fr", appearance: "dark" }, "ar-EG");
  first.runtime.start();
  assert.equal(first.runtime.language, "fr");
  assert.equal(first.attrs.get("dir"), "ltr");
  const reopened = setup(JSON.parse(first.values.get(PREFERENCES_KEY)), "ar-EG");
  reopened.runtime.start();
  assert.equal(reopened.runtime.language, "fr");
  assert.equal(reopened.attrs.get("data-theme"), "dark");
  reopened.runtime.setLanguage("automatic");
  assert.equal(reopened.runtime.language, "ar");
  assert.equal(reopened.attrs.get("dir"), "rtl");
});

test("invalid or inaccessible preference storage does not prevent offline startup", () => {
  const ctx = setup();
  const runtime = createPreferencesRuntime({
    document: { documentElement: {setAttribute() {}, style:{setProperty(){}}}, querySelectorAll:() => [] },
    navigator: { languages:["es-MX"] },
    storage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } },
  });
  runtime.start();
  runtime.setAppearance("dark");
  runtime.setLanguage("sw");
  assert.equal(runtime.language, "sw");
  assert.equal(ctx.runtime.language, "en");
});
