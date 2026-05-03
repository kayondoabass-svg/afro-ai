import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { InstallPwaButton } from "@/components/install-pwa-button";
import { useLanguage } from "@/hooks/use-language";
import {
  Smartphone,
  Globe,
  MessageSquare,
  Rocket,
  Shield,
  ArrowRight,
  Zap,
  Code2,
  Store,
  Check,
  Star,
  Users,
  CreditCard,
  Wifi,
  ScanSearch,
  Github,
  GitBranch,
} from "lucide-react";
import heroBg from "@assets/hero-bg.jpg";
import workspaceImg from "@assets/workspace.jpg";
import africaTechImg from "@assets/africa-tech.jpg";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

export default function LandingPage() {
  const { t } = useLanguage();

  const params = new URLSearchParams(window.location.search);
  const initialError = params.get("error");
  const authReason = params.get("reason");
  const refCode = params.get("ref");
  const [showError, setShowError] = useState(!!initialError);
  const loginUrl = refCode ? `/login?ref=${encodeURIComponent(refCode)}` : "/login";

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "glass-tilt-styles";
    style.textContent = `
      .glass-card {
        background: rgba(255,255,255,0.04);
        backdrop-filter: blur(16px) saturate(180%);
        -webkit-backdrop-filter: blur(16px) saturate(180%);
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08);
        transition: box-shadow 0.3s ease, border-color 0.3s ease;
        transform-style: preserve-3d;
        will-change: transform;
      }
      .glass-card:hover {
        border-color: rgba(212,175,55,0.25);
        box-shadow: 0 16px 48px rgba(0,0,0,0.45), 0 0 32px rgba(212,175,55,0.08), inset 0 1px 0 rgba(255,255,255,0.12);
      }
      .glass-card .glass-inner {
        transform: translateZ(20px);
      }
      .glass-card .glass-icon {
        transform: translateZ(30px);
      }
      .glass-card .glass-title {
        transform: translateZ(25px);
      }
      .vanilla-tilt-glare-wrapper { border-radius: inherit !important; }
    `;
    document.head.appendChild(style);

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/vanilla-tilt/1.8.1/vanilla-tilt.min.js";
    script.onload = () => {
      const VT = (window as any).VanillaTilt;
      if (!VT) return;
      const featureCards = document.querySelectorAll(".glass-card-feature");
      VT.init(featureCards, { max: 8, speed: 400, glare: true, "max-glare": 0.12, scale: 1.02 });
      const stepCards = document.querySelectorAll(".glass-card-step");
      VT.init(stepCards, { max: 10, speed: 350, glare: true, "max-glare": 0.15, scale: 1.03 });
      const testimonialCards = document.querySelectorAll(".glass-card-testimonial");
      VT.init(testimonialCards, { max: 6, speed: 450, glare: true, "max-glare": 0.08, scale: 1.01 });
      const pricingCards = document.querySelectorAll(".glass-card-pricing");
      VT.init(pricingCards, { max: 7, speed: 400, glare: true, "max-glare": 0.1, scale: 1.02 });
    };
    document.body.appendChild(script);

    return () => {
      style.remove();
      script.remove();
      document.querySelectorAll(".glass-card").forEach((el: any) => el._vanillaTilt?.destroy?.());
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {showError && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-destructive text-destructive-foreground text-center py-3 px-4 text-sm" data-testid="banner-auth-error">
          {authReason === "no_user"
            ? "Sign-in was cancelled or your account could not be verified. Please try again."
            : authReason?.includes("access_denied")
              ? "Access denied. Your Google account may not have permission to sign in. Please contact the administrator."
              : "Sign-in failed. Please try again or use a different Google account."}
          <button
            onClick={() => {
              setShowError(false);
              window.history.replaceState({}, "", "/");
            }}
            className="ml-3 underline font-medium"
            data-testid="button-dismiss-error"
          >
            Dismiss
          </button>
        </div>
      )}
      <nav className={`fixed ${showError ? "top-10" : "top-0"} left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-2 h-16">
          <div className="flex items-center gap-2 flex-shrink-0">
            <img src={afroLogo} alt="Afro AI" className="w-8 h-8 object-contain" />
            <span className="font-bold text-lg tracking-tight" data-testid="text-logo">Afro AI</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground transition-colors" data-testid="link-features">{t("nav.features")}</a>
            <a href="#pricing" className="text-sm text-muted-foreground transition-colors" data-testid="link-pricing">{t("nav.pricing")}</a>
            <a href="#about" className="text-sm text-muted-foreground transition-colors" data-testid="link-about">{t("nav.about")}</a>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <LanguageSelector compact />
            <ThemeToggle />
            <div className="hidden md:block">
              <InstallPwaButton variant="ghost" />
            </div>
            <a href={loginUrl} className="hidden sm:block">
              <Button variant="ghost" data-testid="button-login">{t("nav.login")}</Button>
            </a>
            <a href={loginUrl}>
              <Button data-testid="button-get-started" className="whitespace-nowrap">{t("nav.getStarted")}</Button>
            </a>
          </div>
        </div>
      </nav>

      <section className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroBg}
            alt=""
            className="w-full h-full object-cover"
            fetchPriority="high"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-background" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36 lg:py-44">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="space-y-8">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 backdrop-blur-sm">
                <Zap className="w-3 h-3 mr-1" />
                {t("hero.badge")}
              </Badge>

              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-white animate-fade-in-up">
                {t("hero.title1")}
                <span className="animate-gradient-text block mt-1">{t("hero.title2")}</span>
              </h1>

              <p className="text-lg text-gray-300 max-w-lg leading-relaxed">
                {t("hero.subtitle")}
              </p>

              <div className="flex flex-wrap gap-3">
                <a href={loginUrl}>
                  <Button size="lg" data-testid="button-hero-start">
                    {t("hero.cta1")}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </a>
                <a href="#features">
                  <Button size="lg" variant="outline" className="backdrop-blur-sm bg-white/5 text-white border-white/20" data-testid="button-hero-learn">
                    {t("hero.cta2")}
                  </Button>
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Check className="w-4 h-4 text-primary" />
                  <span>{t("hero.check1")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Check className="w-4 h-4 text-primary" />
                  <span>{t("hero.check2")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Check className="w-4 h-4 text-primary" />
                  <span>{t("hero.check3")}</span>
                </div>
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="relative animate-float">
                <div className="absolute -inset-4 bg-primary/20 rounded-2xl blur-3xl animate-glow-pulse" />
                <img
                  src={workspaceImg}
                  alt="Afro AI workspace"
                  className="relative rounded-2xl ring-1 ring-white/10"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-4">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {t("stats.label")}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl font-bold text-primary" data-testid="text-stat-creators">10K+</p>
              <p className="text-sm text-muted-foreground mt-1">{t("stats.creators")}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary" data-testid="text-stat-apps">5K+</p>
              <p className="text-sm text-muted-foreground mt-1">{t("stats.apps")}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary" data-testid="text-stat-countries">54</p>
              <p className="text-sm text-muted-foreground mt-1">{t("stats.countries")}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary" data-testid="text-stat-uptime">99.9%</p>
              <p className="text-sm text-muted-foreground mt-1">{t("stats.uptime")}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">
              <img src={afroLogo} alt="" className="w-3 h-3" />
              {t("features.badge")}
            </Badge>
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">
              {t("features.title1")}
              <span className="text-primary"> {t("features.title2")}</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("features.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" style={{ perspective: "1000px" }}>
            {[
              { icon: Globe, title: t("features.website.title"), desc: t("features.website.desc"), testId: "text-feature-websites", href: loginUrl, cta: "Build a website →" },
              { icon: Smartphone, title: t("features.app.title"), desc: t("features.app.desc"), testId: "text-feature-apps", href: loginUrl, cta: "Build an app →" },
              { icon: MessageSquare, title: t("features.ai.title"), desc: t("features.ai.desc"), testId: "text-feature-ai", href: loginUrl, cta: "Start chatting →" },
              { icon: Store, title: t("features.store.title"), desc: t("features.store.desc"), testId: "text-feature-store", href: "/marketplace", cta: "Browse marketplace →" },
              { icon: Code2, title: t("features.code.title"), desc: t("features.code.desc"), testId: "text-feature-code", href: "/templates", cta: "Browse templates →" },
              { icon: Shield, title: t("features.security.title"), desc: t("features.security.desc"), testId: "text-feature-security", href: loginUrl, cta: "Get started free →" },
            ].map((f, i) => (
              <a key={i} href={f.href} className="block group">
                <div className="glass-card glass-card-feature rounded-2xl p-6 space-y-4 cursor-pointer h-full" style={{ transition: "border-color 0.2s" }}>
                  <div className="glass-icon w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center ring-1 ring-primary/20">
                    <f.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="glass-inner space-y-2">
                    <h3 className="glass-title text-lg font-semibold" data-testid={f.testId}>{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                  <p className="text-xs text-primary font-medium group-hover:underline">{f.cta}</p>
                </div>
              </a>
            ))}
          </div>

          <div className="text-center mt-10">
            <a href={loginUrl}>
              <Button size="lg" data-testid="button-features-start">
                Start Building Free
                <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section className="py-20 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">
              <Zap className="w-3 h-3 mr-1" />
              How It Works
            </Badge>
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">
              Three Steps to
              <span className="animate-gradient-text"> Your Dream App</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto" style={{ perspective: "1000px" }}>
            {[
              { step: "01", icon: MessageSquare, title: "Describe Your Vision", desc: "Tell our AI what you want to build. Describe your website or app in plain language.", href: loginUrl },
              { step: "02", icon: Code2, title: "AI Builds It Live", desc: "Watch as AI generates your complete website or app in real-time with live preview.", href: loginUrl },
              { step: "03", icon: Rocket, title: "Publish Instantly", desc: "Launch your creation to the world with one click on your own .afroaigroup.com domain.", href: loginUrl },
            ].map((item, i) => (
              <a key={i} href={item.href} className="block group">
                <div className="glass-card glass-card-step text-center space-y-4 rounded-2xl p-8 cursor-pointer h-full">
                  <div className="glass-icon relative inline-flex">
                    <div className="w-16 h-16 rounded-2xl bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center mx-auto">
                      <item.icon className="w-7 h-7 text-primary" />
                    </div>
                    <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-lg" data-testid={`text-step-${item.step}`}>
                      {item.step}
                    </span>
                  </div>
                  <div className="glass-inner space-y-2">
                    <h3 className="glass-title text-lg font-semibold" data-testid={`text-howit-title-${i}`}>{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>

          <div className="text-center mt-10">
            <a href={loginUrl}>
              <Button size="lg" className="animate-pulse-gold" data-testid="button-howit-start">
                Try It Now — Free
                <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <img
                src={africaTechImg}
                alt="Africa connected through technology"
                className="rounded-2xl ring-1 ring-border max-w-sm mx-auto lg:mx-0"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="space-y-6">
              <h2 className="font-serif text-3xl md:text-4xl font-bold">
                {t("africa.title1")}
                <span className="text-primary block mt-1">{t("africa.title2")}</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {t("africa.desc")}
              </p>
              <div className="space-y-3">
                {[
                  { text: t("africa.item1"), icon: Globe },
                  { text: t("africa.item2"), icon: Users },
                  { text: t("africa.item3"), icon: CreditCard },
                  { text: t("africa.item4"), icon: Wifi },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium">{item.text}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <a href={loginUrl}>
                  <Button data-testid="button-africa-start">
                    Start Building Free
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </a>
                <a href="/domains">
                  <Button variant="outline" data-testid="button-africa-domains">
                    Get an African Domain
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-serif text-2xl md:text-3xl font-bold mb-3">
              Trusted by African Creators
            </h2>
            <p className="text-muted-foreground">Hear from creators across the continent</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6" style={{ perspective: "1200px" }}>
            {[
              { name: "Amara Osei", country: "Ghana", text: "I built and launched my business website in under 30 minutes. Afro AI understands what African businesses need.", rating: 5 },
              { name: "Kwame Mensah", country: "Kenya", text: "The Mobile Money payment integration is a game changer. Finally, a platform that works with how Africa pays.", rating: 5 },
              { name: "Fatima Diallo", country: "Senegal", text: "I had no coding experience. Now I have a professional website for my fashion brand live on the internet.", rating: 5 },
            ].map((review, i) => (
              <div key={i} className="glass-card glass-card-testimonial rounded-2xl p-6 space-y-4 cursor-default" data-testid={`card-testimonial-${i}`}>
                <div className="glass-icon flex gap-0.5">
                  {Array.from({ length: review.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed italic">
                  "{review.text}"
                </p>
                <div className="glass-inner flex items-center gap-2 pt-2 border-t border-white/5">
                  <div className="w-9 h-9 rounded-full bg-primary/15 ring-1 ring-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                    {review.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{review.name}</p>
                    <p className="text-xs text-muted-foreground">{review.country}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">
              <Rocket className="w-3 h-3 mr-1" />
              {t("pricing.badge")}
            </Badge>
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">
              {t("pricing.title1")}
              <span className="text-primary"> {t("pricing.title2")}</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("pricing.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto" style={{ perspective: "1200px" }}>
            {/* Starter */}
            <div className="glass-card glass-card-pricing rounded-2xl p-6 space-y-6 cursor-default">
              <div className="glass-inner">
                <h3 className="text-lg font-semibold">{t("pricing.starter")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("pricing.starter.desc")}</p>
              </div>
              <div className="glass-title flex items-baseline gap-1">
                <span className="text-4xl font-bold">{t("pricing.free")}</span>
              </div>
              <div className="space-y-2">
                {[t("pricing.starter.f1"), t("pricing.starter.f2"), t("pricing.starter.f3"), t("pricing.starter.f4")].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
                <div className="flex items-start gap-2 text-xs text-yellow-400/80 pt-1 border-t border-white/5 mt-1">
                  <span className="mt-0.5">⏱</span>
                  <span>App suspends after 30 days — upgrade to keep it live</span>
                </div>
              </div>
              <a href={loginUrl} className="block">
                <Button variant="outline" className="w-full" data-testid="button-plan-starter">{t("nav.getStarted")}</Button>
              </a>
            </div>

            {/* Pro */}
            <div className="glass-card glass-card-pricing rounded-2xl p-6 space-y-6 cursor-default relative" style={{ borderColor: "rgba(212,175,55,0.4)", boxShadow: "0 0 0 2px rgba(212,175,55,0.3), 0 16px 48px rgba(0,0,0,0.4), 0 0 40px rgba(212,175,55,0.1)" }}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground shadow-lg">{t("pricing.mostPopular")}</Badge>
              </div>
              <div className="glass-inner">
                <h3 className="text-lg font-semibold">{t("pricing.pro")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("pricing.pro.desc")}</p>
              </div>
              <div className="glass-title flex items-baseline gap-1">
                <span className="text-4xl font-bold">{t("pricing.pro.price")}</span>
                <span className="text-muted-foreground">{t("pricing.perMonth")}</span>
              </div>
              <div className="space-y-2">
                {[t("pricing.pro.f1"), t("pricing.pro.f2"), t("pricing.pro.f3"), t("pricing.pro.f4"), t("pricing.pro.f5")].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <a href="/pricing" className="block">
                <Button className="w-full" data-testid="button-plan-pro">Subscribe — $15/mo</Button>
              </a>
            </div>

            {/* Business */}
            <div className="glass-card glass-card-pricing rounded-2xl p-6 space-y-6 cursor-default">
              <div className="glass-inner">
                <h3 className="text-lg font-semibold">{t("pricing.business")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("pricing.business.desc")}</p>
              </div>
              <div className="glass-title flex items-baseline gap-1">
                <span className="text-4xl font-bold">{t("pricing.business.price")}</span>
                <span className="text-muted-foreground">{t("pricing.perMonth")}</span>
              </div>
              <div className="space-y-2">
                {[t("pricing.business.f1"), t("pricing.business.f2"), t("pricing.business.f3"), t("pricing.business.f4"), t("pricing.business.f5"), t("pricing.business.f6")].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <a href="/pricing" className="block">
                <Button variant="outline" className="w-full" data-testid="button-plan-business">Subscribe — $29.90/mo</Button>
              </a>
            </div>
          </div>

          {/* Pay As You Go callout */}
          <div className="max-w-3xl mx-auto mt-6">
            <div className="glass-card rounded-2xl p-5 flex items-start gap-4" style={{ borderColor: "rgba(212,175,55,0.2)" }}>
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-lg">💳</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-sm">Pay As You Go</h4>
                  <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">No monthly fee</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Buy credit packs from <strong className="text-foreground">$5</strong>. Use them anytime at <strong className="text-foreground">$0.02/generation</strong>. Set a spending limit so you never overspend.</p>
                <div className="flex gap-2 flex-wrap">
                  {[["$5","250 gens"],["$10","500 gens"],["$20","1K gens"],["$50","2.5K gens"]].map(([price, gens]) => (
                    <a key={price} href="/pricing" className="px-2.5 py-1 rounded-lg border border-yellow-500/30 text-xs font-medium hover:border-yellow-500/60 transition-colors">
                      {price} <span className="text-muted-foreground">· {gens}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {t("pricing.pesapal")}
          </p>
        </div>
      </section>

      <section id="about" className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary">
            <Star className="w-4 h-4 fill-primary" />
            The Africa We Want
          </div>
          <h2 className="font-serif text-3xl md:text-5xl font-bold">
            {t("quote.line1")}
            <span className="animate-gradient-text block mt-2">{t("quote.line2")}</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
            {t("quote.desc")}
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <a href={loginUrl}>
              <Button size="lg" className="animate-pulse-gold" data-testid="button-join-movement">
                {t("quote.cta")}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
            <a href="#pricing">
              <Button size="lg" variant="outline" data-testid="button-see-plans">
                View Plans
              </Button>
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t py-12 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div className="col-span-2 md:col-span-1 space-y-4">
              <div className="flex items-center gap-2">
                <img src={afroLogo} alt="Afro AI" className="w-7 h-7 object-contain" />
                <span className="font-bold">Afro AI</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("footer.tagline")}
              </p>
              <div className="flex items-center gap-3 pt-1">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="GitHub"
                  data-testid="link-footer-github"
                >
                  <Github className="w-5 h-5" />
                </a>
                <a
                  href="https://pages.github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="GitHub Pages — free hosting"
                  data-testid="link-footer-github-pages"
                >
                  <GitBranch className="w-5 h-5" />
                </a>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm">{t("footer.product")}</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <a href="/website-builder" className="block hover:text-primary transition-colors" data-testid="link-footer-website-builder">{t("footer.websiteBuilder")}</a>
                <a href="/app-designer" className="block hover:text-primary transition-colors" data-testid="link-footer-app-designer">{t("footer.appDesigner")}</a>
                <a href={loginUrl} className="block hover:text-primary transition-colors" data-testid="link-footer-ai-assistant">{t("footer.aiAssistant")}</a>
                <a href="/templates" className="block hover:text-primary transition-colors" data-testid="link-footer-templates">Templates</a>
                <a href="/marketplace" className="block hover:text-primary transition-colors" data-testid="link-footer-marketplace">Marketplace</a>
                <a href="/domain-names" className="block hover:text-primary transition-colors" data-testid="link-footer-domains">Domain Store</a>
                <a href="/chatbot-api" className="block hover:text-primary transition-colors" data-testid="link-footer-chatbot-api">Chatbot API</a>
                <a href="/developer-email" className="block hover:text-primary transition-colors" data-testid="link-footer-email-api">Email API</a>
                <a href="/ussd-builder" className="block hover:text-primary transition-colors" data-testid="link-footer-ussd-builder">USSD Builder</a>
                <a href="https://pages.github.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors" data-testid="link-footer-github-pages-product">
                  <Github className="w-3.5 h-3.5" /> GitHub Pages
                </a>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Earn</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <a href="/affiliate" className="block hover:text-primary transition-colors" data-testid="link-footer-affiliate">Affiliate Program</a>
                <a href={loginUrl} className="block hover:text-primary transition-colors" data-testid="link-footer-referrals">Refer & Earn</a>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm">{t("footer.company")}</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <a href="/about" className="block hover:text-primary transition-colors" data-testid="link-footer-about">{t("footer.aboutUs")}</a>
                <a href="/blog" className="block hover:text-primary transition-colors" data-testid="link-footer-blog">{t("footer.blog")}</a>
                <a href="/contact" className="block hover:text-primary transition-colors" data-testid="link-footer-contact">{t("footer.contact")}</a>
                <a href="mailto:Support@afroaigroup.com" className="block hover:text-primary transition-colors" data-testid="link-footer-support">Support</a>
                <a href="/pricing" className="block hover:text-primary transition-colors" data-testid="link-footer-pricing">Pricing</a>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm">{t("footer.legal")}</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <a href="/privacy" className="block hover:text-primary transition-colors" data-testid="link-footer-privacy">{t("footer.privacy")}</a>
                <a href="/terms" className="block hover:text-primary transition-colors" data-testid="link-footer-terms">{t("footer.terms")}</a>
                <a href="/cookies" className="block hover:text-primary transition-colors" data-testid="link-footer-cookies">{t("footer.cookies")}</a>
                <a href="/refund-policy" className="block hover:text-primary transition-colors" data-testid="link-footer-refund">Refund Policy</a>
                <a href="/.well-known/security.txt" className="block hover:text-primary transition-colors" data-testid="link-footer-security">Security</a>
              </div>
              <div className="pt-2">
                <InstallPwaButton variant="outline" />
              </div>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} KEYO TECHNOLOGIES. Afro AI — {t("footer.copyright")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
