import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Globe, Sparkles, Zap, Check, ArrowRight, ChevronDown, ChevronUp,
  CheckCircle2, Palette, Layers, Smartphone, Search, Code2, Languages,
} from "lucide-react";

const FEATURES = [
  { icon: Sparkles, title: "Describe it. We build it.", desc: "Type what you want in plain English (or French, Swahili, Yoruba). The AI generates a full website — pages, copy, images, and code." },
  { icon: Palette, title: "African-first templates", desc: "21 ready-made templates for African businesses — restaurants, salons, NGOs, schools, churches, MTN agents, mobile money shops." },
  { icon: Smartphone, title: "Mobile-perfect by default", desc: "Every site looks great on the phones your customers actually use — including low-end Androids." },
  { icon: Search, title: "SEO that actually ranks", desc: "Pages are pre-optimized for Google with proper titles, meta tags, OpenGraph and structured data." },
  { icon: Languages, title: "Built for African languages", desc: "Add multilingual support in one click. Swahili, French, Arabic, Luganda, Yoruba, Amharic — all supported." },
  { icon: Code2, title: "Export the code anytime", desc: "Own your project. Download the full source code as React/Next.js or deploy to GitHub Pages." },
];

const STEPS = [
  { num: "1", title: "Sign in", desc: "Create a free account. No credit card required." },
  { num: "2", title: "Describe your business", desc: "Tell the AI what you do in 1–2 sentences. It builds the site." },
  { num: "3", title: "Tweak & publish", desc: "Edit text, swap images, change colors. Hit publish — your site goes live in seconds." },
  { num: "4", title: "Connect your domain", desc: "Buy a .africa, .com or .co.ke domain and connect it in one click." },
];

const PLANS = [
  { name: "Free", price: "$0", period: "forever", desc: "Try it out", features: ["1 published website", "Afro AI subdomain", "Community support"], cta: "Start free", highlight: false },
  { name: "Pro", price: "$15", period: "/month", desc: "For freelancers & small businesses", features: ["10 published websites", "Custom domain support", "Remove Afro AI branding", "Priority AI generations", "Email support"], cta: "Get Pro", highlight: true },
  { name: "Business", price: "$29.90", period: "/month", desc: "For growing teams", features: ["Unlimited websites", "All Pro features", "Team collaboration", "White-label exports", "Phone & WhatsApp support"], cta: "Get Business", highlight: false },
];

const FAQS = [
  { q: "Do I need to know how to code?", a: "No. You describe what you want in plain English (or French, Swahili) and the AI does everything. If you do know code, you can edit anything you want." },
  { q: "Can I use my own domain?", a: "Yes. Buy a domain in our Domain Store or bring one you already own — connect it in one click." },
  { q: "How fast is publishing?", a: "Sites publish in under 5 seconds. The first generation by the AI usually takes 30–90 seconds." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel from your dashboard. You keep access until the end of your billing period and your sites stay live on the free tier." },
  { q: "Which payment methods work?", a: "Mobile money (MTN, Airtel, M-Pesa), Visa/Mastercard, and bank transfer — all via Pesapal." },
];

export default function WebsiteBuilderLandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const loginUrl = "/login";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <a href="/" className="flex items-center gap-2"><span className="font-bold text-lg">Afro AI</span></a>
          <div className="flex items-center gap-3">
            <a href="/pricing" className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">Pricing</a>
            <a href={loginUrl}><Button variant="ghost" size="sm">Log In</Button></a>
            <a href={loginUrl}><Button size="sm" data-testid="button-nav-get-started">Get Started <ArrowRight className="w-4 h-4 ml-1" /></Button></a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            <Globe className="w-3 h-3 mr-1" /> Website Builder
          </Badge>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold leading-tight">
            Build a website in minutes.
            <span className="text-primary block mt-1">Powered by AI. Made for Africa.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Describe your business — get a full, beautiful website. No coding, no design skills, no waiting weeks.
            Pay with mobile money. Connect your own domain.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <a href={loginUrl}>
              <Button size="lg" className="gap-2" data-testid="button-hero-start">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
            <a href="/pricing">
              <Button size="lg" variant="outline">View Pricing</Button>
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground pt-4">
            {["No credit card", "Free forever plan", "Mobile money accepted"].map(t => (
              <span key={t} className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" />{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center font-serif text-3xl font-bold mb-10">From idea to live in 4 steps</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map(s => (
              <Card key={s.num} className="hover-elevate">
                <CardContent className="p-5 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center">{s.num}</div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-center font-serif text-3xl font-bold mb-3">Everything you need, nothing you don't</h2>
          <p className="text-center text-muted-foreground mb-12">Built specifically for African business owners and entrepreneurs.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <Card key={i}>
                <CardContent className="p-6 space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 bg-muted/30" id="pricing">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-serif text-3xl font-bold">Simple, transparent pricing</h2>
            <p className="text-muted-foreground mt-2">Start free. Upgrade only when you're ready. Pay with mobile money.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map(p => (
              <Card key={p.name} className={p.highlight ? "border-primary border-2 shadow-lg shadow-primary/20 relative" : ""} data-testid={`card-plan-${p.name.toLowerCase()}`}>
                {p.highlight && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</Badge>
                )}
                <CardContent className="p-6 space-y-4">
                  <div>
                    <h3 className="font-bold text-lg">{p.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                  </div>
                  <div>
                    <span className="text-3xl font-bold">{p.price}</span>
                    <span className="text-muted-foreground text-sm ml-1">{p.period}</span>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {p.features.map(f => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <a href={p.name === "Free" ? loginUrl : `/pricing?plan=${p.name.toLowerCase()}`} className="block">
                    <Button className="w-full" variant={p.highlight ? "default" : "outline"} data-testid={`button-plan-${p.name.toLowerCase()}`}>
                      {p.cta}
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-6">
            All paid plans accept MTN Mobile Money, Airtel Money, M-Pesa, Visa & Mastercard via Pesapal.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-serif text-3xl font-bold text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-4 text-left font-medium hover:bg-muted/40 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  data-testid={`faq-website-${i}`}
                >
                  {faq.q}
                  {openFaq === i ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                </button>
                {openFaq === i && <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{faq.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 text-center bg-primary/5 border-t border-primary/10">
        <div className="max-w-xl mx-auto space-y-5">
          <h2 className="font-serif text-3xl font-bold">Ready to build?</h2>
          <p className="text-muted-foreground">Sign up free. Build your first site in 5 minutes.</p>
          <a href={loginUrl}>
            <Button size="lg" data-testid="button-cta-start">
              Get Started Free <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </a>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} KEYO TECHNOLOGIES — <a href="/" className="hover:text-primary">Afro AI</a> · <a href="/privacy" className="hover:text-primary">Privacy</a> · <a href="/terms" className="hover:text-primary">Terms</a></p>
      </footer>
    </div>
  );
}
