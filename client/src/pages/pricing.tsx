import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Check, Rocket, Globe, Loader2, Shield, CreditCard, Smartphone, Zap, Coins, Clock } from "lucide-react";
import { africanCountries, formatLocalPrice, formatUsdPrice, type AfricanCountry } from "@shared/currencies";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

const USD_PRICES = {
  pro: 15,
  business: 29.90,
};

const PAYG_PACKS = [
  { key: "pack5",  usd: 5,  credits: 500,  gens: 250 },
  { key: "pack10", usd: 10, credits: 1000, gens: 500 },
  { key: "pack20", usd: 20, credits: 2000, gens: 1000 },
  { key: "pack50", usd: 50, credits: 5000, gens: 2500 },
];

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
  const [toppingUp, setToppingUp] = useState<string | null>(null);
  const [paygLimit, setPaygLimit] = useState("10");

  const handleSubscribe = async (plan: string) => {
    if (!user) { window.location.href = "/login"; return; }
    setSubscribingPlan(plan);
    try {
      const res = await apiRequest("POST", "/api/subscribe", { plan, countryCode: country || undefined });
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        toast({ title: t("dashboard.error"), description: "Payment redirect not available. Please try again later.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: t("dashboard.error"), description: err.message || "Failed to start subscription.", variant: "destructive" });
    } finally {
      setSubscribingPlan(null);
    }
  };

  const handleTopup = async (pack: string) => {
    if (!user) { window.location.href = "/login"; return; }
    setToppingUp(pack);
    try {
      const limitDollars = parseFloat(paygLimit) || 10;
      await apiRequest("POST", "/api/payg/limit", { limitDollars });
      const res = await apiRequest("POST", "/api/payg/topup", { pack, countryCode: country || undefined });
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        toast({ title: "Error", description: "Could not start payment. Try again.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to initiate top-up.", variant: "destructive" });
    } finally {
      setToppingUp(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto min-h-0">
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
          {/* Starter */}
          <Card className="hover-elevate">
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold">{t("pricing.starter")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("pricing.starter.desc")}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold" data-testid="text-price-free">Free</span>
              </div>
              <div className="space-y-2">
                {[
                  "1 published app",
                  "App stays live for 30 days",
                  "Basic AI builder (GPT-4.1 Nano)",
                  "Community templates",
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 text-sm text-yellow-400 mt-2 pt-2 border-t border-white/10">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>App suspends after 30 days — upgrade to keep it live</span>
                </div>
              </div>
              <Button variant="secondary" className="w-full" data-testid="button-current-plan">
                {t("pricingPage.currentPlan")}
              </Button>
            </CardContent>
          </Card>

          {/* Pro */}
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
              <div className="space-y-2">
                {[
                  "Unlimited published apps",
                  "Apps stay live forever",
                  "GPT-4.1 Mini (better quality)",
                  "32K context — edit large apps",
                  "Custom domain connection",
                  "All platform features",
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full" data-testid="button-pro-plan" disabled={subscribingPlan === "pro"} onClick={() => handleSubscribe("pro")}>
                {subscribingPlan === "pro" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <img src={afroLogo} alt="" className="w-4 h-4 object-contain mr-2" />}
                {subscribingPlan === "pro" ? "Processing..." : "Subscribe — $15/mo"}
              </Button>
            </CardContent>
          </Card>

          {/* Business */}
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
              <div className="space-y-2">
                {[
                  "Everything in Pro",
                  "GPT-4.1 Full model (best quality)",
                  "Priority AI responses",
                  "Collaboration (team access)",
                  "Advanced analytics",
                  "White-label ready",
                  "Priority support",
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full" data-testid="button-business-plan" disabled={subscribingPlan === "business"} onClick={() => handleSubscribe("business")}>
                {subscribingPlan === "business" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {subscribingPlan === "business" ? "Processing..." : "Subscribe — $29.90/mo"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Pay-As-You-Go */}
        <Card className="hover-elevate border-yellow-500/30">
          <CardContent className="p-6 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
                <Coins className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  Pay As You Go
                  <Badge variant="outline" className="text-xs border-yellow-500/40 text-yellow-400">No monthly fee</Badge>
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Buy credits and use them when you need. <strong className="text-foreground">$0.02 per AI generation</strong> (same quality as Pro). Set a spending limit — AI stops when you hit it.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Set your spending limit</p>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    min="1"
                    max="500"
                    value={paygLimit}
                    onChange={(e) => setPaygLimit(e.target.value)}
                    className="w-28"
                    data-testid="input-payg-limit"
                  />
                  <span className="text-sm text-muted-foreground">max spend</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">AI pauses when this is reached</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">With each pack you get</p>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between"><span>$5 pack</span><span className="text-muted-foreground">250 AI generations</span></div>
                  <div className="flex justify-between"><span>$10 pack</span><span className="text-muted-foreground">500 AI generations</span></div>
                  <div className="flex justify-between"><span>$20 pack</span><span className="text-muted-foreground">1,000 AI generations</span></div>
                  <div className="flex justify-between"><span>$50 pack</span><span className="text-muted-foreground">2,500 AI generations</span></div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PAYG_PACKS.map((pack) => (
                <Button
                  key={pack.key}
                  variant="outline"
                  className="flex flex-col h-auto py-3 gap-1 border-yellow-500/30 hover:border-yellow-500/60"
                  disabled={toppingUp === pack.key}
                  onClick={() => handleTopup(pack.key)}
                  data-testid={`button-payg-${pack.key}`}
                >
                  {toppingUp === pack.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-lg font-bold text-yellow-400">${pack.usd}</span>}
                  <span className="text-xs text-muted-foreground">{pack.gens.toLocaleString()} gens</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

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
