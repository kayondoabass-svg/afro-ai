import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn't send the link", description: data.message || "Please try again.", variant: "destructive" });
      } else {
        setSent(true);
      }
    } catch {
      toast({ title: "Couldn't send the link", description: "Check your internet and try again.", variant: "destructive" });
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
            <h1 className="text-2xl font-bold" data-testid="text-title">Forgot your password?</h1>
            <p className="text-sm text-muted-foreground">
              No worries — happens to everyone. Enter your email and we'll send you a link to set a new one.
            </p>
          </div>

          {sent ? (
            <div className="space-y-4 text-center" data-testid="state-sent">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <div>
                <h2 className="font-semibold text-lg" data-testid="text-sent-heading">Check your inbox</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  If <span className="font-medium text-foreground">{email}</span> is on Afro AI, a reset link is on its way. The link works for the next <strong>60 minutes</strong>.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Don't see it? Check your spam/junk folder or <button type="button" className="underline" onClick={() => setSent(false)} data-testid="button-try-again">try a different email</button>.
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full gap-2" data-testid="link-back-to-login">
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    data-testid="input-email"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !email}
                data-testid="button-submit"
              >
                {isLoading ? "Sending link..." : "Send reset link"}
              </Button>
              <Link href="/login">
                <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5" data-testid="link-back-to-login">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to sign in
                </button>
              </Link>
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
