import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { authDestination } from "@/lib/chat-entry";

const COPY: Record<string, { icon: any; title: string; body: string; tone: "ok" | "warn" }> = {
  pending: { icon: Mail, tone: "warn", title: "Verify your email first", body: "Open the confirmation link in your inbox to activate your account. If it hasn't arrived, you can request another below." },
  verifying: { icon: Mail, tone: "warn", title: "Confirming your email…", body: "Please wait while we check your link." },
  ok:      { icon: CheckCircle2, tone: "ok",   title: "Email confirmed!",          body: "Thanks — your email is now verified. You're all set." },
  used:    { icon: CheckCircle2, tone: "ok",   title: "Already confirmed",         body: "This link has already been used. Your email is verified." },
  expired: { icon: AlertCircle,  tone: "warn", title: "This link has expired",     body: "Verification links work for 24 hours. Request a new one from your account." },
  invalid: { icon: AlertCircle,  tone: "warn", title: "Link not recognised",       body: "We couldn't find this verification link. It may have been mistyped." },
  missing: { icon: AlertCircle,  tone: "warn", title: "No token provided",         body: "Open the link from your verification email to confirm your account." },
  error:   { icon: AlertCircle,  tone: "warn", title: "Something went wrong",      body: "We couldn't verify right now. Please try again in a moment." },
};

export function verificationRedirect(search: string): string | null {
  const token = new URLSearchParams(search).get("token");
  return token ? `/api/auth/verify-email?token=${encodeURIComponent(token)}` : null;
}

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [status, setStatus] = useState<string>("missing");

  useEffect(() => {
    if (user && !user.emailVerified && window.location.pathname !== "/verify-email") {
      try { sessionStorage.setItem("after_login_redirect", window.location.pathname + window.location.search); } catch { /* Storage unavailable. */ }
    }
    const params = new URLSearchParams(window.location.search);
    const redirect = verificationRedirect(window.location.search);
    if (redirect) {
      setStatus("verifying");
      // Support verification emails sent before the backend link was corrected.
      window.location.replace(redirect);
      return;
    }
    const s = params.get("status") || (user && !user.emailVerified ? "pending" : "missing");
    setStatus(s);
    document.title = "Verify your email — Afro AI";
  }, [user]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    if (sending || cooldown) return;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/send-verification", { method: "POST", credentials: "include" });
      const data = await response.json();
      if (response.status === 429) setCooldown(60);
      if (!response.ok) throw new Error(data.error || "Could not send verification email.");
      if (data.alreadyVerified) {
        window.location.replace(authDestination(sessionStorage.getItem("after_login_redirect")));
        return;
      }
      setCooldown(60);
      setMessage("Verification email sent. Check your inbox and spam folder.");
    } catch (error: any) {
      setMessage(error.message || "Could not send verification email.");
    } finally {
      setSending(false);
    }
  }

  const c = COPY[status] || COPY.error;
  const Icon = c.icon;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center ${c.tone === "ok" ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500"}`}>
            <Icon className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold font-serif" data-testid="text-verify-title">{c.title}</h1>
          <p className="text-muted-foreground" data-testid="text-verify-body">{c.body}</p>
          {c.tone === "ok" ? (
            <Button className="w-full" onClick={() => window.location.replace(authDestination(sessionStorage.getItem("after_login_redirect")))} data-testid="button-go-dashboard">
              Continue to Afro AI
            </Button>
          ) : (
            <div className="space-y-2">
              {user ? <>
                <Button className="w-full" onClick={resend} disabled={sending || cooldown > 0 || status === "verifying"} data-testid="button-resend-verify">
                  <Mail className="w-4 h-4 mr-2" /> {sending ? "Sending…" : cooldown ? `Resend in ${cooldown}s` : "Resend verification email"}
                </Button>
                <Button variant="ghost" onClick={() => window.location.reload()}>I've verified — check again</Button>
                <Button variant="ghost" onClick={() => logout()}>Sign out</Button>
              </> : <Button className="w-full" onClick={() => setLocation("/login")}>Sign in to request a new link</Button>}
              {message && <p role="status" className="text-sm">{message}</p>}
              <Link href="/" className="text-sm text-muted-foreground hover:text-primary block" data-testid="link-home">Back to home</Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
