import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/hooks/use-language";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SiGoogle, SiGithub } from "react-icons/si";
import { ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

const AUTH_BASE = "/cf-auth";

interface LockState {
  until: number; // epoch ms when the lock expires
  message: string; // server-provided message (or fallback)
}

/**
 * Pull the cool-off duration out of a 429 response. The Worker always sends a
 * Retry-After header in seconds; we fall back to parsing "about X minutes" out
 * of the message body, then to a conservative 15-minute default so we never
 * leave the panel showing a 0-second countdown.
 */
function parseRetryAfter(res: Response, message: string): number {
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

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "a moment";
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function LockedPanel({
  title,
  lock,
  remainingSec,
  onDismiss,
  testIdPrefix,
}: {
  title: string;
  lock: LockState;
  remainingSec: number;
  onDismiss: () => void;
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-4 mt-4" data-testid={`${testIdPrefix}-locked-panel`}>
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle data-testid={`${testIdPrefix}-locked-title`}>{title}</AlertTitle>
        <AlertDescription className="space-y-2">
          <p data-testid={`${testIdPrefix}-locked-message`}>{lock.message}</p>
          <p className="text-xs opacity-90" data-testid={`${testIdPrefix}-locked-countdown`}>
            Try again in <span className="font-semibold">{formatRemaining(remainingSec)}</span>.
          </p>
          <p className="text-xs opacity-80">
            If you've forgotten your password, you can{" "}
            <Link
              href="/forgot-password"
              className="underline underline-offset-2 font-medium"
              data-testid={`${testIdPrefix}-locked-forgot-link`}
            >
              reset it now
            </Link>{" "}
            — that still works while your account is locked.
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
        {remainingSec > 0 ? "Please wait…" : "Try again"}
      </Button>
    </div>
  );
}

export default function LoginPage() {
  useLanguage();
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const refCode = params.get("ref");
  const [isLoading, setIsLoading] = useState(false);

  // Two separate widgets so a successful login doesn't burn the signup token
  const [loginToken, setLoginToken] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [loginResetSignal, setLoginResetSignal] = useState(0);
  const [signupResetSignal, setSignupResetSignal] = useState(0);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerFirstName, setRegisterFirstName] = useState("");
  const [registerLastName, setRegisterLastName] = useState("");

  // Per-form lock state. We keep them separate so a signup throttle doesn't
  // hide the login form (and vice-versa) — the Worker tracks them as
  // independent throttle keys, so the UI mirrors that.
  const [loginLock, setLoginLock] = useState<LockState | null>(null);
  const [signupLock, setSignupLock] = useState<LockState | null>(null);
  // `now` ticks once a second while a lock is active so the countdown
  // re-renders without re-running the lock-clearing effect.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!loginLock && !signupLock) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [loginLock, signupLock]);

  // Auto-clear locks the moment they expire so the form comes back without
  // requiring the user to click "Try again".
  useEffect(() => {
    if (loginLock && now >= loginLock.until) setLoginLock(null);
    if (signupLock && now >= signupLock.until) setSignupLock(null);
  }, [now, loginLock, signupLock]);

  function preserveRef() {
    if (refCode) sessionStorage.setItem("ref_code", refCode);
  }

  function redirectAfterAuth() {
    const stored = sessionStorage.getItem("after_login_redirect");
    if (stored) sessionStorage.removeItem("after_login_redirect");
    window.location.href = stored && stored.startsWith("/") ? stored : "/";
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginToken) {
      toast({
        title: "One quick check",
        description: "Wait a moment for the security check to finish, then try again.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${AUTH_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
          turnstileToken: loginToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        const message =
          data?.message || "Too many sign-in attempts. Please wait a few minutes and try again.";
        const retryAfter = parseRetryAfter(res, message);
        setLoginLock({ until: Date.now() + retryAfter * 1000, message });
        setNow(Date.now());
        setLoginResetSignal((n) => n + 1);
        setLoginToken("");
        return;
      }
      if (!res.ok) {
        toast({
          title: "Login failed",
          description: data?.message || "Check your email and password and try again.",
          variant: "destructive",
        });
        setLoginResetSignal((n) => n + 1);
        setLoginToken("");
        return;
      }
      preserveRef();
      redirectAfterAuth();
    } catch {
      toast({
        title: "Login failed",
        description: "Check your internet and try again.",
        variant: "destructive",
      });
      setLoginResetSignal((n) => n + 1);
      setLoginToken("");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!signupToken) {
      toast({
        title: "One quick check",
        description: "Wait a moment for the security check to finish, then try again.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${AUTH_BASE}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: registerEmail.trim(),
          password: registerPassword,
          firstName: registerFirstName.trim() || undefined,
          lastName: registerLastName.trim() || undefined,
          turnstileToken: signupToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        const message =
          data?.message || "Too many signup attempts. Please wait a few minutes and try again.";
        const retryAfter = parseRetryAfter(res, message);
        setSignupLock({ until: Date.now() + retryAfter * 1000, message });
        setNow(Date.now());
        setSignupResetSignal((n) => n + 1);
        setSignupToken("");
        return;
      }
      if (!res.ok) {
        toast({
          title: "Registration failed",
          description: data?.message || "Please check your details and try again.",
          variant: "destructive",
        });
        setSignupResetSignal((n) => n + 1);
        setSignupToken("");
        return;
      }
      preserveRef();
      redirectAfterAuth();
    } catch {
      toast({
        title: "Registration failed",
        description: "Check your internet and try again.",
        variant: "destructive",
      });
      setSignupResetSignal((n) => n + 1);
      setSignupToken("");
    } finally {
      setIsLoading(false);
    }
  }

  function startOAuth(provider: "google" | "github") {
    preserveRef();
    // Forward the post-login destination to the Worker so OAuth lands on the
    // same page as the email/password flow (sanitized server-side).
    const stored = sessionStorage.getItem("after_login_redirect");
    let url = `${AUTH_BASE}/${provider}/start`;
    if (stored && stored.startsWith("/")) {
      const target = `${window.location.origin}${stored}`;
      url += `?redirect=${encodeURIComponent(target)}`;
    }
    window.location.href = url;
  }

  const loginRemaining = loginLock
    ? Math.max(0, Math.ceil((loginLock.until - now) / 1000))
    : 0;
  const signupRemaining = signupLock
    ? Math.max(0, Math.ceil((signupLock.until - now) / 1000))
    : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageSelector compact />
        <ThemeToggle />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm p-8 space-y-6 border-primary/20">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <img src={afroLogo} alt="Afro AI" className="w-12 h-12 object-contain" loading="lazy" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-serif tracking-tight" data-testid="text-login-title">
                Afro AI
              </h1>
              <p className="text-sm text-muted-foreground mt-1" data-testid="text-login-subtitle">
                Built for Africa, by Africans
              </p>
            </div>
          </div>

          <Tabs defaultValue="signup" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signup" data-testid="tab-signup">Sign Up</TabsTrigger>
              <TabsTrigger value="login" data-testid="tab-login">Log In</TabsTrigger>
            </TabsList>

            <TabsContent value="signup" className="space-y-4 mt-4">
              {signupLock ? (
                <LockedPanel
                  title="Too many signup attempts"
                  lock={signupLock}
                  remainingSec={signupRemaining}
                  onDismiss={() => setSignupLock(null)}
                  testIdPrefix="signup"
                />
              ) : (
                <>
                  <form onSubmit={handleRegister} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="reg-first-name">First Name</Label>
                        <Input
                          id="reg-first-name"
                          placeholder="Ada"
                          value={registerFirstName}
                          onChange={(e) => setRegisterFirstName(e.target.value)}
                          data-testid="input-register-firstname"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="reg-last-name">Last Name</Label>
                        <Input
                          id="reg-last-name"
                          placeholder="Okonkwo"
                          value={registerLastName}
                          onChange={(e) => setRegisterLastName(e.target.value)}
                          data-testid="input-register-lastname"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="reg-email">Email</Label>
                      <Input
                        id="reg-email"
                        type="email"
                        placeholder="you@example.com"
                        required
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        data-testid="input-register-email"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="reg-password">Password</Label>
                      <Input
                        id="reg-password"
                        type="password"
                        placeholder="At least 6 characters"
                        required
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        data-testid="input-register-password"
                      />
                    </div>
                    <div className="flex justify-center">
                      <TurnstileWidget
                        onToken={setSignupToken}
                        onExpire={() => setSignupToken("")}
                        resetSignal={signupResetSignal}
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading || !signupToken}
                      data-testid="button-register-submit"
                    >
                      {isLoading ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => startOAuth("google")}
                      data-testid="button-google-signup"
                    >
                      <SiGoogle className="w-4 h-4" />
                      Google
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => startOAuth("github")}
                      data-testid="button-github-signup"
                    >
                      <SiGithub className="w-4 h-4" />
                      GitHub
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="login" className="space-y-4 mt-4">
              {loginLock ? (
                <LockedPanel
                  title="Your account is temporarily locked"
                  lock={loginLock}
                  remainingSec={loginRemaining}
                  onDismiss={() => setLoginLock(null)}
                  testIdPrefix="login"
                />
              ) : (
                <>
                  <form onSubmit={handleEmailLogin} className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="you@example.com"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        data-testid="input-login-email"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="Your password"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        data-testid="input-login-password"
                      />
                    </div>
                    <div className="flex justify-center">
                      <TurnstileWidget
                        onToken={setLoginToken}
                        onExpire={() => setLoginToken("")}
                        resetSignal={loginResetSignal}
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading || !loginToken}
                      data-testid="button-login-submit"
                    >
                      {isLoading ? "Signing in..." : "Sign In"}
                    </Button>
                    <div className="text-center">
                      <Link
                        href="/forgot-password"
                        className="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                        data-testid="link-forgot-password"
                      >
                        Forgot your password?
                      </Link>
                    </div>
                  </form>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => startOAuth("google")}
                      data-testid="button-google-login"
                    >
                      <SiGoogle className="w-4 h-4" />
                      Google
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => startOAuth("github")}
                      data-testid="button-github-login"
                    >
                      <SiGithub className="w-4 h-4" />
                      GitHub
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          <p className="text-center text-xs text-muted-foreground">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </Card>
      </div>

      <footer className="text-center py-4 text-xs text-muted-foreground">
        Building the Future We Want
      </footer>
    </div>
  );
}
