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
import { Check, Rocket, Globe, Loader2, Shield, CreditCard, Smartphone, Zap, Coins, Clock, Bot, Mail, ArrowRight, Receipt, FileText, MessageCircle, Search } from "lucide-react";
import { Link } from "wouter";
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

        {/* Product family — choose what you're here for */}
        <div className="space-y-3">
          <div className="text-center">
            <h2 className="text-xl font-semibold">Choose your product</h2>
            <p className="text-sm text-muted-foreground mt-1">Afro AI ships three products. Pick what you need — each has its own plans.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {/* App Builder */}
            <a href="#app-builder-plans" className="block" data-testid="link-product-app-builder">
              <Card className="hover-elevate h-full border-primary/30">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Rocket className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">AI App Builder</h3>
                      <p className="text-xs text-muted-foreground">From Free</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Build & publish full apps from a prompt. Custom domains, hosting, AI editing.</p>
                  <div className="flex items-center text-xs text-primary font-medium">See plans <ArrowRight className="w-3 h-3 ml-1" /></div>
                </CardContent>
              </Card>
            </a>

            {/* Chatbot */}
            <Link href="/chatbots" className="block" data-testid="link-product-chatbot">
              <Card className="hover-elevate h-full border-yellow-500/30">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">AI Chatbot <Badge variant="outline" className="text-[10px] border-yellow-500/40 text-yellow-400">Live</Badge></h3>
                      <p className="text-xs text-muted-foreground">From $19/mo</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Trainable widget chat for your website. Auto-scans your site, white-label, programmatic API.</p>
                  <div className="flex items-center text-xs text-yellow-400 font-medium">See chatbot plans <ArrowRight className="w-3 h-3 ml-1" /></div>
                </CardContent>
              </Card>
            </Link>

            {/* Email API */}
            <Link href="/email-api" className="block" data-testid="link-product-email-api">
              <Card className="hover-elevate h-full">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">Email API <Badge variant="outline" className="text-[10px]">Free tier</Badge></h3>
                      <p className="text-xs text-muted-foreground">Free / $9 / $29</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Transactional email at half the price of Resend or SendGrid. Built for African senders.</p>
                  <div className="flex items-center text-xs text-blue-400 font-medium">See email plans <ArrowRight className="w-3 h-3 ml-1" /></div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* AI App Builder Plans heading */}
        <div id="app-builder-plans" className="text-center pt-4 scroll-mt-24">
          <h2 className="text-2xl font-bold">AI App Builder Plans</h2>
          <p className="text-sm text-muted-foreground mt-1">Build, host and publish AI apps. All plans include unlimited drafts.</p>
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

        {/* Related — links to other parts of the platform */}
        <div className="space-y-3 pt-2">
          <div className="text-center">
            <h2 className="text-lg font-semibold">Related</h2>
            <p className="text-xs text-muted-foreground mt-1">Tools, docs and policies</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {user && (
              <Link href="/billing" className="block" data-testid="link-related-billing">
                <Card className="hover-elevate h-full">
                  <CardContent className="p-4 flex items-start gap-3">
                    <Receipt className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-medium text-sm">Your account & receipts</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">Usage, plan, payment history</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
            <Link href="/email-audit" className="block" data-testid="link-related-email-audit">
              <Card className="hover-elevate h-full">
                <CardContent className="p-4 flex items-start gap-3">
                  <Search className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-sm">Free Email Audit</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Check your domain's deliverability</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/docs/email-api" className="block" data-testid="link-related-docs">
              <Card className="hover-elevate h-full">
                <CardContent className="p-4 flex items-start gap-3">
                  <FileText className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-sm">Email API Docs</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Endpoints, examples, SDKs</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/refund-policy" className="block" data-testid="link-related-refund">
              <Card className="hover-elevate h-full">
                <CardContent className="p-4 flex items-start gap-3">
                  <Shield className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-sm">Refund policy</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">How refunds & cancellations work</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/contact" className="block" data-testid="link-related-contact">
              <Card className="hover-elevate h-full">
                <CardContent className="p-4 flex items-start gap-3">
                  <MessageCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-sm">Talk to sales</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Custom plans & enterprise</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
