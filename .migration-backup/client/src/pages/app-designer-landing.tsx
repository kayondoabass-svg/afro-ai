import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Smartphone, Sparkles, Zap, Check, ArrowRight, ChevronDown, ChevronUp,
  CheckCircle2, Wifi, WifiOff, Bell, Download, Code2, Layers,
} from "lucide-react";

const FEATURES = [
  { icon: Sparkles, title: "AI generates the whole app", desc: "Describe what your app does. The AI designs screens, writes the code, and wires up the data — all in minutes." },
  { icon: Smartphone, title: "Installable on any phone", desc: "Your app is a Progressive Web App — users install it from the browser. No App Store fees, no Google Play approvals." },
  { icon: WifiOff, title: "Works offline", desc: "Apps cache data so they work even when the network drops — perfect for African connectivity reality." },
  { icon: Bell, title: "Push notifications", desc: "Send notifications to your users without needing native iOS or Android development." },
  { icon: Download, title: "Lightweight & fast", desc: "Apps install in seconds and load instantly — even on low-end Androids and 2G networks." },
  { icon: Code2, title: "Export your code", desc: "Download the full source. Convert to native iOS/Android with Capacitor whenever you're ready." },
];

const STEPS = [
  { num: "1", title: "Sign in", desc: "Create a free account. No credit card needed." },
  { num: "2", title: "Describe your app", desc: "Tell the AI what your app should do — booking, e-commerce, learning, social, anything." },
  { num: "3", title: "Customize & test", desc: "Tweak design, add screens, connect data. Test it live on your phone via QR code." },
  { num: "4", title: "Publish & install", desc: "Publish in one click. Share the install link via WhatsApp, SMS or QR code." },
];

const APP_TYPES = [
  { name: "Booking apps", desc: "Salons, clinics, gyms, restaurants" },
  { name: "E-commerce", desc: "Mobile stores with mobile money checkout" },
  { name: "Learning apps", desc: "Courses, quizzes, tutorials" },
  { name: "Service apps", desc: "Plumbers, electricians, drivers" },
  { name: "Community apps", desc: "Churches, NGOs, schools, sacco" },
  { name: "Internal tools", desc: "Inventory, attendance, sales tracking" },
];

const PLANS = [
  { name: "Free", price: "$0", period: "forever", desc: "Try it out", features: ["1 published app", "Afro AI subdomain install URL", "Community support"], cta: "Start free", highlight: false },
  { name: "Pro", price: "$15", period: "/month", desc: "For freelancers & small businesses", features: ["10 published apps", "Custom install domain", "Push notifications", "Remove Afro AI branding", "Priority support"], cta: "Get Pro", highlight: true },
  { name: "Business", price: "$29.90", period: "/month", desc: "For growing teams", features: ["Unlimited apps", "All Pro features", "White-label install pages", "Team collaboration", "Phone & WhatsApp support"], cta: "Get Business", highlight: false },
];

const FAQS = [
  { q: "Do I need to publish to the App Store or Google Play?", a: "No. Your app installs directly from the browser as a Progressive Web App (PWA). No store fees, no review delays. If you want native store distribution later, you can export the code." },
  { q: "Will it work on iPhone?", a: "Yes — both iOS and Android. iOS users install via Safari's Share menu, Android users get a one-tap install banner." },
  { q: "Can the app accept payments?", a: "Yes. Pesapal, mobile money (M-Pesa, MTN, Airtel) — all integrate with a few clicks. No coding needed." },
  { q: "What about offline use?", a: "All apps work offline by default. Data syncs when the user comes back online." },
  { q: "Can I use my own domain for the install URL?", a: "Yes — on Pro and above. Buy a domain in our Domain Store or bring your own." },
];

export default function AppDesignerLandingPage() {
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
            <Smartphone className="w-3 h-3 mr-1" /> App Designer
          </Badge>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold leading-tight">
            Build a mobile app without code.
            <span className="text-primary block mt-1">Install on any phone. No app store needed.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Describe your app — the AI builds it. Users install it directly from the browser.
            Works offline. Push notifications. Mobile money built in.
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
            {["No App Store fees", "Works offline", "Mobile money ready"].map(t => (
              <span key={t} className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" />{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center font-serif text-3xl font-bold mb-10">From idea to installed app in 4 steps</h2>
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

      {/* App types */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center font-serif text-3xl font-bold mb-10">What kind of app will you build?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {APP_TYPES.map(t => (
              <Card key={t.name} className="hover-elevate">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-sm">{t.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-center font-serif text-3xl font-bold mb-3">Everything you need to ship</h2>
          <p className="text-center text-muted-foreground mb-12">Built for the realities of African mobile users.</p>
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
      <section className="py-20 px-4" id="pricing">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-serif text-3xl font-bold">Simple, transparent pricing</h2>
            <p className="text-muted-foreground mt-2">Start free. Upgrade only when you're ready. Pay with mobile money.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map(p => (
              <Card key={p.name} className={p.highlight ? "border-primary border-2 shadow-lg shadow-primary/20 relative" : ""} data-testid={`card-plan-${p.name.toLowerCase()}`}>
                {p.highlight && <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</Badge>}
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
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-serif text-3xl font-bold text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border rounded-xl overflow-hidden bg-card">
                <button
                  className="w-full flex items-center justify-between p-4 text-left font-medium hover:bg-muted/40 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  data-testid={`faq-app-${i}`}
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
          <h2 className="font-serif text-3xl font-bold">Build your app today.</h2>
          <p className="text-muted-foreground">Sign up free. Have a working app in under an hour.</p>
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
