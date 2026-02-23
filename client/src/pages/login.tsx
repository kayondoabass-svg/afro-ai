import { useLanguage } from "@/hooks/use-language";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SiGoogle } from "react-icons/si";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

export default function LoginPage() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageSelector compact />
        <ThemeToggle />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm p-8 space-y-8 border-primary/20">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <img src={afroLogo} alt="Afro AI" className="w-12 h-12 object-contain" />
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

          <div className="space-y-3">
            <Button
              variant="outline"
              size="lg"
              className="w-full gap-3"
              onClick={() => { window.location.href = "/api/login"; }}
              data-testid="button-google-login"
            >
              <SiGoogle className="w-5 h-5" />
              Continue with Google
            </Button>
          </div>

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
