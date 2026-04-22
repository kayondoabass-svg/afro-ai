import { Link } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export interface LockState {
  until: number;
  message: string;
}

export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

/**
 * Pull the cool-off duration out of a 429 response. The Worker always sends a
 * Retry-After header in seconds; we fall back to parsing "about X minutes" out
 * of the message body, then to a conservative 15-minute default so we never
 * leave the panel showing a 0-second countdown.
 */
export function parseRetryAfter(res: Response, message: string): number {
  const header = res.headers.get("Retry-After");
  if (header) {
    const n = parseInt(header, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const m = message.match(/(\d+)\s*minute/i);
  if (m) {
    const minutes = parseInt(m[1], 10);
    if (Number.isFinite(minutes) && minutes > 0) return minutes * 60;
  }
  return 15 * 60;
}

/**
 * Map the Worker's stable error codes to translation keys for the lock-out
 * panel body. Shared between login, signup, and password-reset flows so each
 * page renders the same translated copy when the same code comes back.
 */
export const LOCK_BODY_KEYS: Record<string, string> = {
  rate_limited_login: "auth.locked.body.login",
  rate_limited_signup: "auth.locked.body.signup",
  rate_limited_reset: "auth.locked.body.reset",
};

/**
 * Pick a translated body string for a 429 lock response, falling back to the
 * Worker's English `message` (and finally an English fallback) when the code
 * is unknown or no translation is registered for the user's language.
 */
export function translateLockMessage(
  t: TranslateFn,
  data: any,
  fallback: string,
): string {
  const code = typeof data?.code === "string" ? data.code : "";
  const key = LOCK_BODY_KEYS[code];
  if (key) {
    const translated = t(key);
    // `t` returns the key itself when no translation exists for it; only use
    // the translation when we got something different back.
    if (translated && translated !== key) return translated;
  }
  return data?.message || fallback;
}

export function formatRemaining(seconds: number, t: TranslateFn): string {
  if (seconds <= 0) return t("auth.locked.duration.moment");
  if (seconds < 60) return t("auth.locked.duration.seconds", { count: seconds });
  const minutes = Math.ceil(seconds / 60);
  return t("auth.locked.duration.minutes", { count: minutes });
}

export function LockedPanel({
  title,
  lock,
  remainingSec,
  onDismiss,
  testIdPrefix,
  t,
}: {
  title: string;
  lock: LockState;
  remainingSec: number;
  onDismiss: () => void;
  testIdPrefix: string;
  t: TranslateFn;
}) {
  const tryAgainTpl = t("auth.locked.tryAgainIn");
  const [tryAgainPre, tryAgainPost = ""] = tryAgainTpl.split("{duration}");

  const forgotTpl = t("auth.locked.forgotLine");
  const [forgotPre, forgotPost = ""] = forgotTpl.split("{link}");

  return (
    <div className="space-y-4 mt-4" data-testid={`${testIdPrefix}-locked-panel`}>
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle data-testid={`${testIdPrefix}-locked-title`}>{title}</AlertTitle>
        <AlertDescription className="space-y-2">
          <p data-testid={`${testIdPrefix}-locked-message`}>{lock.message}</p>
          <p className="text-xs opacity-90" data-testid={`${testIdPrefix}-locked-countdown`}>
            {tryAgainPre}
            <span className="font-semibold">{formatRemaining(remainingSec, t)}</span>
            {tryAgainPost}
          </p>
          <p className="text-xs opacity-80">
            {forgotPre}
            <Link
              href="/forgot-password"
              className="underline underline-offset-2 font-medium"
              data-testid={`${testIdPrefix}-locked-forgot-link`}
            >
              {t("auth.locked.forgotLink")}
            </Link>
            {forgotPost}
          </p>
        </AlertDescription>
      </Alert>
      <Button
        variant="outline"
        className="w-full"
        onClick={onDismiss}
        disabled={remainingSec > 0}
        data-testid={`${testIdPrefix}-locked-dismiss`}
      >
        {remainingSec > 0 ? t("auth.locked.pleaseWait") : t("auth.locked.tryAgain")}
      </Button>
    </div>
  );
}
