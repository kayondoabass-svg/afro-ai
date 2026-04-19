import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { useToast } from "@/hooks/use-toast";
import { Lock, CheckCircle2, AlertTriangle, Eye, EyeOff } from "lucide-react";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

export default function ResetPasswordPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
  }, []);

  const passwordTooShort = password.length > 0 && password.length < 6;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = token && password.length >= 6 && password === confirm && !isLoading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn't reset password", description: data.message || "Please try again.", variant: "destructive" });
        return;
      }
      setDone(true);
      setTimeout(() => {
        if (data.loggedIn) setLocation("/dashboard");
        else setLocation("/login");
      }, 2000);
    } catch {
      toast({ title: "Couldn't reset password", description: "Check your internet and try again.", variant: "destructive" });
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
            <h1 className="text-2xl font-bold" data-testid="text-title">Set a new password</h1>
            <p className="text-sm text-muted-foreground">Choose something you can remember. At least 6 characters.</p>
          </div>

          {!token ? (
            <div className="space-y-4 text-center" data-testid="state-no-token">
              <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Reset link is missing</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This page needs a valid reset link. Tap the button in the email we sent you, or request a new link.
                </p>
              </div>
              <Link href="/forgot-password">
                <Button className="w-full" data-testid="button-request-new">Request a new link</Button>
              </Link>
            </div>
          ) : done ? (
            <div className="space-y-4 text-center" data-testid="state-done">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <div>
                <h2 className="font-semibold text-lg" data-testid="text-done-heading">Password updated</h2>
                <p className="text-sm text-muted-foreground mt-1">Signing you in now…</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    placeholder="At least 6 characters"
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
                    aria-label={showPwd ? "Hide password" : "Show password"}
                    data-testid="button-toggle-password"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordTooShort && (
                  <p className="text-xs text-amber-500" data-testid="text-password-error">Password must be at least 6 characters.</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="confirm">Type it again</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type={showPwd ? "text" : "password"}
                    placeholder="Same password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pl-9"
                    data-testid="input-confirm"
                  />
                </div>
                {mismatch && (
                  <p className="text-xs text-amber-500" data-testid="text-mismatch-error">Passwords don't match yet.</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={!canSubmit}
                data-testid="button-submit"
              >
                {isLoading ? "Saving..." : "Save new password"}
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
