import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Check, Rocket, Globe, Loader2, Shield, CreditCard, Smartphone, Zap } from "lucide-react";
import { africanCountries, formatLocalPrice, formatUsdPrice, type AfricanCountry } from "@shared/currencies";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

const USD_PRICES = {
  pro: 9,
  business: 29,
};

function useCountryDetection() {
  const [country, setCountry] = useState<string>(() => {
    const saved = localStorage.getItem("afro-ai-country");
    return saved || "";
  });
  const [loading, setLoading] = useState(!localStorage.getItem("afro-ai-country"));

  useEffect(() => {
    const saved = localStorage.getItem("afro-ai-country");
    if (saved) return;

    (async () => {
      try {
        const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          const code = data.country_code;
          if (code && africanCountries.find((c) => c.isoCode === code)) {
            setCountry(code);
            localStorage.setItem("afro-ai-country", code);
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const selectCountry = (isoCode: string) => {
    setCountry(isoCode);
    localStorage.setItem("afro-ai-country", isoCode);
  };

  return { country, loading, selectCountry };
}

function PriceDisplay({ usdAmount, countryCode }: { usdAmount: number; countryCode: string }) {
  const localPrice = countryCode ? formatLocalPrice(usdAmount, countryCode) : null;
  const usdPrice = formatUsdPrice(usdAmount);

  return (
    <div className="flex flex-col">
      <span className="text-4xl font-bold" data-testid={`text-price-${usdAmount}`}>
        {localPrice || usdPrice}
      </span>
      {localPrice && (
        <span className="text-xs text-muted-foreground mt-1" data-testid={`text-usd-equiv-${usdAmount}`}>
          ({usdPrice} USD)
        </span>
      )}
    </div>
  );
}

export default function PricingPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const { country, loading: countryLoading, selectCountry } = useCountryDetection();
  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null);

  const handleSubscribe = async (plan: string) => {
    if (!user) {
      window.location.href = "/login";
      return;
    }

    setSubscribingPlan(plan);
    try {
      const res = await apiRequest("POST", "/api/subscribe", { plan, countryCode: country || undefined });
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        toast({
          title: t("dashboard.error"),
          description: "Payment redirect not available. Please try again later.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: t("dashboard.error"),
        description: err.message || "Failed to start subscription.",
        variant: "destructive",
      });
    } finally {
      setSubscribingPlan(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="text-center space-y-4">
          <Badge variant="outline" className="mx-auto">
            <Rocket className="w-3 h-3 mr-1" />
            {t("pricing.badge")}
          </Badge>
          <h1 className="text-3xl font-bold font-serif" data-testid="text-pricing-title">
            {t("pricingPage.title")}
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            {t("pricingPage.subtitle")}
          </p>
        </div>

        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <Select value={country} onValueChange={selectCountry}>
              <SelectTrigger className="w-[220px]" data-testid="select-country">
                <SelectValue placeholder={countryLoading ? "Detecting..." : "Select your country"} />
              </SelectTrigger>
              <SelectContent>
                {africanCountries.map((c) => (
                  <SelectItem key={c.isoCode} value={c.isoCode} data-testid={`option-country-${c.isoCode}`}>
                    {c.name} ({c.currencyCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="hover-elevate">
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold">{t("pricing.starter")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("pricing.starter.desc")}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold" data-testid="text-price-free">{t("pricing.free")}</span>
              </div>
              <div className="space-y-3">
                {[t("pricing.starter.f1"), t("pricing.starter.f2"), t("pricing.starter.f3"), t("pricing.starter.f4")].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <Button variant="secondary" className="w-full" data-testid="button-current-plan">
                {t("pricingPage.currentPlan")}
              </Button>
            </CardContent>
          </Card>

          <Card className="hover-elevate ring-2 ring-primary relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-primary text-primary-foreground">{t("pricing.mostPopular")}</Badge>
            </div>
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold">{t("pricing.pro")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("pricing.pro.desc")}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <PriceDisplay usdAmount={USD_PRICES.pro} countryCode={country} />
                <span className="text-muted-foreground">{t("pricing.perMonth")}</span>
              </div>
              <div className="space-y-3">
                {[t("pricing.pro.f1"), t("pricing.pro.f2"), t("pricing.pro.f3"), t("pricing.pro.f4"), t("pricing.pro.f5"), t("pricingPage.pro.f6")].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <Button
                className="w-full"
                data-testid="button-pro-plan"
                disabled={subscribingPlan === "pro"}
                onClick={() => handleSubscribe("pro")}
              >
                {subscribingPlan === "pro" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <img src={afroLogo} alt="" className="w-4 h-4 object-contain" />
                )}
                {subscribingPlan === "pro" ? "Processing..." : "Subscribe"}
              </Button>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold">{t("pricing.business")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("pricing.business.desc")}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <PriceDisplay usdAmount={USD_PRICES.business} countryCode={country} />
                <span className="text-muted-foreground">{t("pricing.perMonth")}</span>
              </div>
              <div className="space-y-3">
                {[t("pricing.business.f1"), t("pricing.business.f2"), t("pricing.business.f3"), t("pricing.business.f4"), t("pricing.business.f5"), t("pricing.business.f6"), t("pricingPage.business.f7")].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                className="w-full"
                data-testid="button-business-plan"
                disabled={subscribingPlan === "business"}
                onClick={() => handleSubscribe("business")}
              >
                {subscribingPlan === "business" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                {subscribingPlan === "business" ? "Processing..." : "Subscribe"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="animate-shimmer">
          <CardContent className="p-8 space-y-6">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">{t("pricingPage.pesapalTitle")}</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t("pricingPage.pesapalDesc")}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              {[
                { icon: Smartphone, label: "Mobile Money" },
                { icon: CreditCard, label: "Visa / Mastercard" },
                { icon: Globe, label: "Bank Transfer" },
                { icon: Zap, label: "Instant Activation" },
              ].map((method, i) => (
                <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-lg bg-card/80 border" data-testid={`text-payment-method-${i}`}>
                  <method.icon className="w-5 h-5 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground text-center">{method.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
