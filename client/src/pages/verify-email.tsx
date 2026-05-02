import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Mail } from "lucide-react";

const COPY: Record<string, { icon: any; title: string; body: string; tone: "ok" | "warn" }> = {
  ok:      { icon: CheckCircle2, tone: "ok",   title: "Email confirmed!",          body: "Thanks — your email is now verified. You're all set." },
  used:    { icon: CheckCircle2, tone: "ok",   title: "Already confirmed",         body: "This link has already been used. Your email is verified." },
  expired: { icon: AlertCircle,  tone: "warn", title: "This link has expired",     body: "Verification links work for 24 hours. Request a new one from your account." },
  invalid: { icon: AlertCircle,  tone: "warn", title: "Link not recognised",       body: "We couldn't find this verification link. It may have been mistyped." },
  missing: { icon: AlertCircle,  tone: "warn", title: "No token provided",         body: "Open the link from your verification email to confirm your account." },
  error:   { icon: AlertCircle,  tone: "warn", title: "Something went wrong",      body: "We couldn't verify right now. Please try again in a moment." },
};

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<string>("missing");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status") || "missing";
    setStatus(s);
    document.title = "Verify your email — Afro AI";
  }, []);

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
            <Button className="w-full" onClick={() => setLocation("/dashboard")} data-testid="button-go-dashboard">
              Go to dashboard
            </Button>
          ) : (
            <div className="space-y-2">
              <Button className="w-full" onClick={() => setLocation("/dashboard")} data-testid="button-go-account">
                <Mail className="w-4 h-4 mr-2" /> Open my account
              </Button>
              <Link href="/" className="text-sm text-muted-foreground hover:text-primary block" data-testid="link-home">Back to home</Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
