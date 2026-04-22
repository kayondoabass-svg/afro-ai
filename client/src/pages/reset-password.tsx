import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Lock, CheckCircle2, AlertTriangle, Eye, EyeOff } from "lucide-react";
import {
  LockedPanel,
  parseRetryAfter,
  translateLockMessage,
  type LockState,
} from "@/components/locked-panel";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

export default function ResetPasswordPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [token, setToken] = useState("");
  const [isWelcome, setIsWelcome] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  // Mirrors the login/signup lock flow. The Worker doesn't currently throttle
  // /reset-password, but if/when it starts returning 429 (e.g. to slow down
  // token-guessing) the page reuses the same shared lock UI so the experience
  // stays consistent across login, signup, and reset.
  const [lock, setLock] = useState<LockState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
    // welcome=1 is appended by the migration blast (cf-auth/admin/mint-reset-token)
    // so first-time users see "Set your password" copy instead of "Reset your password".
    setIsWelcome(params.get("welcome") === "1");
  }, []);

  useEffect(() => {
    if (!lock) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [lock]);

  useEffect(() => {
    if (lock && now >= lock.until) setLock(null);
  }, [now, lock]);

  const lockRemaining = lock ? Math.max(0, Math.ceil((lock.until - now) / 1000)) : 0;

  const passwordTooShort = password.length > 0 && password.length < 6;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = token && password.length >= 6 && password === confirm && !isLoading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    try {
      const res = await fetch("/cf-auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const data: { message?: string; loggedIn?: boolean } = await res
        .json()
        .catch(() => ({}));
      if (res.status === 429) {
        const message = translateLockMessage(
          t,
          data,
          t("resetPassword.toast.errorRetry"),
        );
        const retryAfter = parseRetryAfter(res, data?.message || message);
        setLock({ until: Date.now() + retryAfter * 1000, message });
        setNow(Date.now());
        return;
      }
      if (!res.ok) {
        toast({ title: t("resetPassword.toast.errorTitle"), description: data.message || t("resetPassword.toast.errorRetry"), variant: "destructive" });
        return;
      }
      setDone(true);
      setTimeout(() => {
        if (data.loggedIn) setLocation("/dashboard");
        else setLocation("/login");
      }, 2000);
    } catch {
      toast({ title: t("resetPassword.toast.errorTitle"), description: t("resetPassword.toast.errorNetwork"), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageSelector compact />
        <ThemeToggle />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 space-y-5">
          <div className="text-center space-y-2">
            <img src={afroLogo} alt="Afro AI" className="w-14 h-14 mx-auto rounded-xl" />
            <h1 className="text-2xl font-bold" data-testid="text-title">
              {isWelcome ? t("resetPassword.title.welcome") : t("resetPassword.title.reset")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isWelcome
                ? t("resetPassword.subtitle.welcome")
                : t("resetPassword.subtitle.reset")}
            </p>
          </div>

          {lock ? (
            <LockedPanel
              title={t("auth.locked.reset.title")}
              lock={lock}
              remainingSec={lockRemaining}
              onDismiss={() => setLock(null)}
              testIdPrefix="reset"
              t={t}
            />
          ) : !token ? (
            <div className="space-y-4 text-center" data-testid="state-no-token">
              <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">{t("resetPassword.noToken.heading")}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("resetPassword.noToken.desc")}
                </p>
              </div>
              <Link href="/forgot-password">
                <Button className="w-full" data-testid="button-request-new">{t("resetPassword.noToken.cta")}</Button>
              </Link>
            </div>
          ) : done ? (
            <div className="space-y-4 text-center" data-testid="state-done">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <div>
                <h2 className="font-semibold text-lg" data-testid="text-done-heading">
                  {isWelcome ? t("resetPassword.done.welcome") : t("resetPassword.done.reset")}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{t("resetPassword.done.signingIn")}</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="password">{t("resetPassword.field.password")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    placeholder={t("resetPassword.field.passwordPlaceholder")}
                    required
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9"
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPwd ? t("resetPassword.field.hidePassword") : t("resetPassword.field.showPassword")}
                    data-testid="button-toggle-password"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordTooShort && (
                  <p className="text-xs text-amber-500" data-testid="text-password-error">{t("resetPassword.field.tooShort")}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="confirm">{t("resetPassword.field.confirm")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type={showPwd ? "text" : "password"}
                    placeholder={t("resetPassword.field.confirmPlaceholder")}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pl-9"
                    data-testid="input-confirm"
                  />
                </div>
                {mismatch && (
                  <p className="text-xs text-amber-500" data-testid="text-mismatch-error">{t("resetPassword.field.mismatch")}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={!canSubmit}
                data-testid="button-submit"
              >
                {isLoading ? t("resetPassword.button.saving") : isWelcome ? t("resetPassword.button.welcome") : t("resetPassword.button.reset")}
              </Button>
            </form>
          )}
        </Card>
      </div>

      <footer className="text-center py-4 text-xs text-muted-foreground">
        Building the Future We Want
      </footer>
    </div>
  );
}
