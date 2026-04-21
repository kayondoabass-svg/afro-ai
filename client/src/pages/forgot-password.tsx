import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/cf-auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: t("forgotPassword.toast.errorTitle"),
          description: data.message || t("forgotPassword.toast.errorRetry"),
          variant: "destructive",
        });
      } else {
        setSent(true);
      }
    } catch {
      toast({
        title: t("forgotPassword.toast.errorTitle"),
        description: t("forgotPassword.toast.errorNetwork"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const bodyTpl = t("forgotPassword.sent.body");
  const bodyParts = bodyTpl.split(/\{email\}|\{duration\}/);
  const bodyOrder = (() => {
    const order: ("email" | "duration")[] = [];
    const re = /\{(email|duration)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bodyTpl)) !== null) order.push(m[1] as "email" | "duration");
    return order;
  })();

  const helpTpl = t("forgotPassword.sent.help");
  const [helpPre, helpPost = ""] = helpTpl.split("{link}");

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
            <h1 className="text-2xl font-bold" data-testid="text-title">{t("forgotPassword.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("forgotPassword.subtitle")}
            </p>
          </div>

          {sent ? (
            <div className="space-y-4 text-center" data-testid="state-sent">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <div>
                <h2 className="font-semibold text-lg" data-testid="text-sent-heading">{t("forgotPassword.sent.heading")}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {bodyParts.map((part, i) => (
                    <span key={i}>
                      {part}
                      {i < bodyOrder.length && (
                        bodyOrder[i] === "email" ? (
                          <span className="font-medium text-foreground">{email}</span>
                        ) : (
                          <strong>{t("forgotPassword.sent.duration")}</strong>
                        )
                      )}
                    </span>
                  ))}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {helpPre}
                <button type="button" className="underline" onClick={() => setSent(false)} data-testid="button-try-again">
                  {t("forgotPassword.sent.helpLink")}
                </button>
                {helpPost}
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full gap-2" data-testid="link-back-to-login">
                  <ArrowLeft className="w-4 h-4" />
                  {t("forgotPassword.backToSignIn")}
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email">{t("forgotPassword.field.email")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("forgotPassword.field.emailPlaceholder")}
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
                {isLoading ? t("forgotPassword.button.sending") : t("forgotPassword.button.submit")}
              </Button>
              <Link href="/login">
                <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5" data-testid="link-back-to-login">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t("forgotPassword.backToSignIn")}
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
