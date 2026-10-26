import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/hooks/use-language";
import { translations, languages, type LanguageCode } from "@/lib/translations";

vi.mock("@/components/turnstile-widget", () => ({
  TurnstileWidget: ({ onToken }: { onToken: (t: string) => void }) => {
    setTimeout(() => onToken("test-turnstile-token"), 0);
    return <div data-testid="mock-turnstile" />;
  },
}));

vi.mock("@assets/IMG_5719_1771852498362.png", () => ({ default: "logo.png" }));

import ResetPasswordPage from "@/pages/reset-password";
import LoginPage from "@/pages/login";
import ForgotPasswordPage from "@/pages/forgot-password";

type LockCode = "rate_limited_login" | "rate_limited_signup" | "rate_limited_reset";

function mockLockedFetch(code: LockCode, retryAfterSec = 600) {
  const body = JSON.stringify({
    code,
    message: "Too many requests (English fallback that should NOT appear)",
  });
  return vi.fn(async () =>
    new Response(body, {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    }),
  );
}

function renderWithLanguage(ui: React.ReactElement, lang: LanguageCode) {
  localStorage.setItem("africa-ai-lang", lang);
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

/**
 * Strict, no-fallback lookup. The whole point of this test suite is to catch
 * translation-key regressions, so we deliberately do NOT mirror the runtime
 * `?? translations.en[key]` fallback in `useLanguage.lookup`. If a key is
 * missing or renamed for a locale, the test must fail loudly instead of
 * silently passing on the English string.
 */
function getStrict(lang: LanguageCode, key: string): string {
  const value = translations[lang]?.[key];
  if (value === undefined) {
    throw new Error(
      `Missing translation key "${key}" for locale "${lang}" — this is exactly the regression these tests guard against.`,
    );
  }
  return value;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    params[name] === undefined ? `{${name}}` : String(params[name]),
  );
}

const ALL_LOCALES = languages.map((l) => l.code);
const RETRY_AFTER_SEC = 600; // 10 minutes — exercises the *_other plural form.

interface LockExpectation {
  titleKey: string;
  bodyKey: string;
  testIdPrefix: string;
}

async function assertLocalizedLockPanel(
  lang: LanguageCode,
  { titleKey, bodyKey, testIdPrefix }: LockExpectation,
) {
  const expectedTitle = getStrict(lang, titleKey);
  const expectedBody = getStrict(lang, bodyKey);
  const expectedCta = getStrict(lang, "auth.locked.pleaseWait");
  const expectedForgotLink = getStrict(lang, "auth.locked.forgotLink");

  // Build the full countdown sentence the same way LockedPanel does: the
  // `tryAgainIn` template with `{duration}` replaced by the localized minutes
  // string (10 minutes -> *_other plural form).
  const expectedMinutes = interpolate(
    getStrict(lang, "auth.locked.duration.minutes_other"),
    { count: Math.ceil(RETRY_AFTER_SEC / 60) },
  );
  const expectedCountdown = interpolate(
    getStrict(lang, "auth.locked.tryAgainIn"),
    { duration: expectedMinutes },
  );

  const titleEl = await screen.findByTestId(`${testIdPrefix}-locked-title`);
  expect(titleEl.textContent).toBe(expectedTitle);

  const messageEl = screen.getByTestId(`${testIdPrefix}-locked-message`);
  expect(messageEl.textContent).toBe(expectedBody);
  // Guard against the worker's English `message` field leaking into the UI.
  expect(messageEl.textContent).not.toMatch(/English fallback/);

  const countdownEl = screen.getByTestId(`${testIdPrefix}-locked-countdown`);
  // Normalize whitespace because the countdown is split across pre/post text
  // nodes around a <span> with the duration.
  const renderedCountdown = (countdownEl.textContent ?? "").replace(/\s+/g, " ").trim();
  expect(renderedCountdown).toBe(expectedCountdown.replace(/\s+/g, " ").trim());

  const dismissBtn = screen.getByTestId(`${testIdPrefix}-locked-dismiss`);
  expect(dismissBtn.textContent?.trim()).toBe(expectedCta);
  expect(dismissBtn).toBeDisabled();

  const forgotLink = screen.getByTestId(`${testIdPrefix}-locked-forgot-link`);
  expect(forgotLink.textContent).toBe(expectedForgotLink);

  // For non-English locales, additionally assert that none of the rendered
  // strings accidentally match the English copy. This catches the case where
  // a non-English key is deleted and `useLanguage.lookup` silently falls back
  // to English at runtime.
  if (lang !== "en") {
    const enTitle = translations.en[titleKey];
    const enBody = translations.en[bodyKey];
    const enCta = translations.en["auth.locked.pleaseWait"];
    const enForgotLink = translations.en["auth.locked.forgotLink"];
    const enCountdown = interpolate(
      translations.en["auth.locked.tryAgainIn"],
      {
        duration: interpolate(translations.en["auth.locked.duration.minutes_other"], {
          count: Math.ceil(RETRY_AFTER_SEC / 60),
        }),
      },
    );
    expect(titleEl.textContent, `title leaked English fallback for ${lang}`).not.toBe(enTitle);
    expect(messageEl.textContent, `body leaked English fallback for ${lang}`).not.toBe(enBody);
    expect(dismissBtn.textContent?.trim(), `CTA leaked English fallback for ${lang}`).not.toBe(enCta);
    expect(forgotLink.textContent, `forgot link leaked English fallback for ${lang}`).not.toBe(enForgotLink);
    expect(renderedCountdown, `countdown leaked English fallback for ${lang}`).not.toBe(
      enCountdown.replace(/\s+/g, " ").trim(),
    );
  }
}

function setSearch(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

beforeEach(() => {
  setSearch("");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Lock screen translations — ResetPasswordPage", () => {
  it.each(ALL_LOCALES)(
    "renders translated 429 lock panel for locale %s",
    async (lang) => {
      vi.stubGlobal("fetch", mockLockedFetch("rate_limited_reset"));
      setSearch("?token=abc123");

      renderWithLanguage(<ResetPasswordPage />, lang);

      const passwordInput = await screen.findByTestId("input-password");
      const confirmInput = screen.getByTestId("input-confirm");
      fireEvent.change(passwordInput, { target: { value: "secret123" } });
      fireEvent.change(confirmInput, { target: { value: "secret123" } });

      await act(async () => {
        fireEvent.click(screen.getByTestId("button-submit"));
      });

      await waitFor(() =>
        expect(screen.getByTestId("reset-locked-panel")).toBeInTheDocument(),
      );

      await assertLocalizedLockPanel(lang, {
        titleKey: "auth.locked.reset.title",
        bodyKey: "auth.locked.body.reset",
        testIdPrefix: "reset",
      });
    },
  );
});

describe("Lock screen translations — LoginPage (login tab)", () => {
  it.each(ALL_LOCALES)(
    "renders translated 429 lock panel for locale %s",
    async (lang) => {
      vi.stubGlobal("fetch", mockLockedFetch("rate_limited_login"));

      const user = userEvent.setup();
      renderWithLanguage(<LoginPage />, lang);

      await user.click(screen.getByTestId("tab-login"));

      const emailInput = await screen.findByTestId("input-login-email");
      const passwordInput = screen.getByTestId("input-login-password");
      fireEvent.change(emailInput, { target: { value: "ada@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "password" } });

      const submit = screen.getByTestId("button-login-submit");
      await waitFor(() => expect(submit).not.toBeDisabled());

      await act(async () => {
        fireEvent.click(submit);
      });

      await waitFor(() =>
        expect(screen.getByTestId("login-locked-panel")).toBeInTheDocument(),
      );

      await assertLocalizedLockPanel(lang, {
        titleKey: "auth.locked.login.title",
        bodyKey: "auth.locked.body.login",
        testIdPrefix: "login",
      });
    },
  );
});

describe("Lock screen translations — ForgotPasswordPage", () => {
  it.each(ALL_LOCALES)(
    "renders translated 429 lock panel for locale %s",
    async (lang) => {
      vi.stubGlobal("fetch", mockLockedFetch("rate_limited_reset"));

      renderWithLanguage(<ForgotPasswordPage />, lang);

      const emailInput = await screen.findByTestId("input-email");
      fireEvent.change(emailInput, { target: { value: "ada@example.com" } });

      const submit = screen.getByTestId("button-submit");
      await waitFor(() => expect(submit).not.toBeDisabled());

      await act(async () => {
        fireEvent.click(submit);
      });

      await waitFor(() =>
        expect(screen.getByTestId("forgot-locked-panel")).toBeInTheDocument(),
      );

      await assertLocalizedLockPanel(lang, {
        titleKey: "auth.locked.reset.title",
        bodyKey: "auth.locked.body.reset",
        testIdPrefix: "forgot",
      });
    },
  );
});

describe("Lock screen translations — LoginPage (signup tab)", () => {
  it.each(ALL_LOCALES)(
    "renders translated 429 lock panel for locale %s",
    async (lang) => {
      vi.stubGlobal("fetch", mockLockedFetch("rate_limited_signup"));

      renderWithLanguage(<LoginPage />, lang);

      const emailInput = await screen.findByTestId("input-register-email");
      const passwordInput = screen.getByTestId("input-register-password");
      const confirmPasswordInput = screen.getByTestId(
        "input-register-confirm-password",
      );
      fireEvent.change(emailInput, { target: { value: "ada@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "password" } });
      fireEvent.change(confirmPasswordInput, { target: { value: "password" } });

      const submit = screen.getByTestId("button-register-submit");
      await waitFor(() => expect(submit).not.toBeDisabled());

      await act(async () => {
        fireEvent.click(submit);
      });

      await waitFor(() =>
        expect(screen.getByTestId("signup-locked-panel")).toBeInTheDocument(),
      );

      await assertLocalizedLockPanel(lang, {
        titleKey: "auth.locked.signup.title",
        bodyKey: "auth.locked.body.signup",
        testIdPrefix: "signup",
      });
    },
  );
});
