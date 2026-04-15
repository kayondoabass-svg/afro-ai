import { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/hooks/use-language";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SiGoogle, SiGithub, SiTiktok } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";

function useRecaptcha(siteKey: string) {
  const [token, setToken] = useState<string | null>(null);
  const widgetRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey) return;
    const scriptId = "recaptcha-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const tryRender = () => {
      const grecaptcha = (window as any).grecaptcha;
      if (!grecaptcha || !containerRef.current) {
        setTimeout(tryRender, 300);
        return;
      }
      if (widgetRef.current !== null) return;
      grecaptcha.ready(() => {
        if (widgetRef.current !== null || !containerRef.current) return;
        try {
          widgetRef.current = grecaptcha.render(containerRef.current, {
            sitekey: siteKey,
            callback: (t: string) => setToken(t),
            "expired-callback": () => setToken(null),
          });
        } catch (_) {}
      });
    };
    tryRender();
  }, [siteKey]);

  const reset = () => {
    const grecaptcha = (window as any).grecaptcha;
    if (grecaptcha && widgetRef.current !== null) {
      grecaptcha.reset(widgetRef.current);
      setToken(null);
    }
  };

  return { containerRef, token, reset };
}

export default function LoginPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const refCode = params.get("ref");
  const [isLoading, setIsLoading] = useState(false);
  const loginRecaptcha = useRecaptcha(RECAPTCHA_SITE_KEY);
  const registerRecaptcha = useRecaptcha(RECAPTCHA_SITE_KEY);

  const authUrl = (base: string) => refCode ? `${base}?ref=${encodeURIComponent(refCode)}` : base;

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerFirstName, setRegisterFirstName] = useState("");
  const [registerLastName, setRegisterLastName] = useState("");

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword, recaptchaToken: loginRecaptcha.token }),
      });
      const data = await res.json();
      if (!res.ok) {
        loginRecaptcha.reset();
        toast({ title: "Login failed", description: data.message, variant: "destructive" });
      } else {
        window.location.href = "/";
      }
    } catch {
      loginRecaptcha.reset();
      toast({ title: "Login failed", description: "An error occurred. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: registerEmail,
          password: registerPassword,
          firstName: registerFirstName,
          lastName: registerLastName,
          recaptchaToken: registerRecaptcha.token,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        registerRecaptcha.reset();
        toast({ title: "Registration failed", description: data.message, variant: "destructive" });
      } else {
        window.location.href = "/";
      }
    } catch {
      registerRecaptcha.reset();
      toast({ title: "Registration failed", description: "An error occurred. Please try again.", variant: "destructive" });
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
                <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-register-submit">
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
                  onClick={() => { window.location.href = authUrl("/api/login"); }}
                  data-testid="button-google-signup"
                >
                  <SiGoogle className="w-4 h-4" />
                  Google
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => { window.location.href = authUrl("/api/auth/github"); }}
                  data-testid="button-github-signup"
                >
                  <SiGithub className="w-4 h-4" />
                  GitHub
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => { window.location.href = authUrl("/api/auth/tiktok"); }}
                  data-testid="button-tiktok-signup"
                >
                  <SiTiktok className="w-4 h-4" />
                  TikTok
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="login" className="space-y-4 mt-4">
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
                <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login-submit">
                  {isLoading ? "Signing in..." : "Sign In"}
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
                  onClick={() => { window.location.href = authUrl("/api/login"); }}
                  data-testid="button-google-login"
                >
                  <SiGoogle className="w-4 h-4" />
                  Google
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => { window.location.href = authUrl("/api/auth/github"); }}
                  data-testid="button-github-login"
                >
                  <SiGithub className="w-4 h-4" />
                  GitHub
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => { window.location.href = authUrl("/api/auth/tiktok"); }}
                  data-testid="button-tiktok-login"
                >
                  <SiTiktok className="w-4 h-4" />
                  TikTok
                </Button>
              </div>
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
