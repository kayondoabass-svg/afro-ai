import { useEffect, useRef, useState } from "react";

// Cloudflare-published test key that always issues a passing token.
// See https://developers.cloudflare.com/turnstile/troubleshooting/testing/
const TEST_SITE_KEY = "1x00000000000000000000AA";
const PROD_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

function pickSiteKey(): string | undefined {
  if (typeof window === "undefined") return PROD_SITE_KEY;
  const host = window.location.hostname;
  // The real key is locked to afroaigroup.com; fall back to the test key
  // anywhere else (Replit preview, localhost, custom dev domains) so the
  // widget renders during development.
  if (host === "afroaigroup.com" || host === "www.afroaigroup.com") {
    return PROD_SITE_KEY || TEST_SITE_KEY;
  }
  return TEST_SITE_KEY;
}

const SITE_KEY = pickSiteKey();
const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__turnstileReady&render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
          appearance?: "always" | "execute" | "interaction-only";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
    __turnstileReady?: () => void;
    __turnstileReadyPromise?: Promise<void>;
  }
}

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.__turnstileReadyPromise) return window.__turnstileReadyPromise;

  window.__turnstileReadyPromise = new Promise<void>((resolve) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    window.__turnstileReady = () => resolve();
    if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  });
  return window.__turnstileReadyPromise;
}

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onExpire?: () => void;
  resetSignal?: number;
  theme?: "light" | "dark" | "auto";
  className?: string;
}

const LOAD_TIMEOUT_MS = 10_000;

export function TurnstileWidget({
  onToken,
  onExpire,
  resetSignal,
  theme = "auto",
  className,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!SITE_KEY) {
      console.warn(
        "VITE_TURNSTILE_SITE_KEY is not set — Turnstile widget will not render.",
      );
      setFailed(true);
      return;
    }

    setFailed(false);
    timer = setTimeout(() => {
      if (cancelled) return;
      if (!window.turnstile) setFailed(true);
    }, LOAD_TIMEOUT_MS);

    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        if (timer) clearTimeout(timer);
        try {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: SITE_KEY!,
            theme,
            callback: (token) => onTokenRef.current(token),
            "expired-callback": () => onExpireRef.current?.(),
            "error-callback": () => {
              onExpireRef.current?.();
              setFailed(true);
            },
          });
        } catch {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [theme, reloadKey]);

  useEffect(() => {
    if (resetSignal === undefined) return;
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {}
    }
  }, [resetSignal]);

  if (!SITE_KEY) {
    return (
      <div
        className="text-xs text-amber-500 text-center"
        data-testid="turnstile-missing-key"
      >
        Security check is not configured.
      </div>
    );
  }

  if (failed) {
    return (
      <div
        className="text-xs text-center space-y-1"
        data-testid="turnstile-load-failed"
      >
        <p className="text-amber-500">
          Security check couldn't load. Check your connection or any ad-blocker, then retry.
        </p>
        <button
          type="button"
          onClick={() => {
            // Force a reload of the script + widget
            try {
              if (typeof window !== "undefined") {
                delete window.__turnstileReadyPromise;
                const s = document.getElementById(SCRIPT_ID);
                if (s) s.remove();
              }
            } catch {}
            setReloadKey((k) => k + 1);
          }}
          className="underline text-primary"
          data-testid="button-turnstile-retry"
        >
          Retry security check
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className} data-testid="turnstile-widget" />
  );
}
