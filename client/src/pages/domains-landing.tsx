import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Globe, Search, Shield, Zap, Check,
  ArrowRight, ChevronDown, ChevronUp,
  CheckCircle2, Lock, RefreshCw, Star,
} from "lucide-react";

const DOMAIN_EXTENSIONS = [
  { ext: ".africa", price: 12, desc: "Pan-African identity", popular: true },
  { ext: ".com", price: 10, desc: "Global standard", popular: true },
  { ext: ".co.ke", price: 8, desc: "Kenya", popular: true },
  { ext: ".co.ug", price: 9, desc: "Uganda", popular: false },
  { ext: ".co.tz", price: 9, desc: "Tanzania", popular: false },
  { ext: ".co.rw", price: 10, desc: "Rwanda", popular: false },
  { ext: ".co.za", price: 11, desc: "South Africa", popular: true },
  { ext: ".ng", price: 10, desc: "Nigeria", popular: true },
  { ext: ".gh", price: 10, desc: "Ghana", popular: false },
  { ext: ".et", price: 12, desc: "Ethiopia", popular: false },
  { ext: ".online", price: 6, desc: "Modern & flexible", popular: false },
  { ext: ".app", price: 14, desc: "Perfect for apps", popular: false },
];

const FEATURES = [
  {
    icon: Search,
    title: "Instant Search",
    desc: "Check if your domain name is available in seconds. Search across all African and global extensions at once.",
  },
  {
    icon: Shield,
    title: "WHOIS Privacy",
    desc: "Your personal details stay private. We include WHOIS privacy protection free with every domain.",
  },
  {
    icon: Zap,
    title: "Connect Instantly",
    desc: "Connect your domain to your Afro AI website with one click. DNS is configured automatically.",
  },
  {
    icon: RefreshCw,
    title: "Auto-Renewal",
    desc: "Never lose your domain. Enable auto-renewal and we'll handle it before the expiry date.",
  },
  {
    icon: Lock,
    title: "Domain Lock",
    desc: "Protect your domain from unauthorized transfers with domain locking — enabled by default.",
  },
  {
    icon: Globe,
    title: "DNS Management",
    desc: "Full DNS control. Add A, CNAME, MX, TXT records and more from a simple dashboard.",
  },
];

const FAQS = [
  {
    q: "How long does domain registration take?",
    a: "Most domains are registered instantly. Country-code domains like .co.ke or .co.ug may take a few hours depending on the registry.",
  },
  {
    q: "Can I transfer a domain I already own?",
    a: "Yes. You can transfer your existing domain to Afro AI from any registrar. We'll guide you through the process step by step.",
  },
  {
    q: "Do I need an Afro AI website to buy a domain?",
    a: "No. You can register a domain and point it anywhere — to your own server, GitHub Pages, or any other hosting. You don't need to use our website builder.",
  },
  {
    q: "What happens when my domain expires?",
    a: "You'll receive email reminders before expiry. If the domain expires, it enters a grace period where you can still renew it. After that, it becomes available to the public.",
  },
  {
    q: "Is WHOIS privacy included for free?",
    a: "Yes. All domains registered through Afro AI include free WHOIS privacy. Your name, address, and email are hidden from the public WHOIS database.",
  },
  {
    q: "Can I manage multiple domains?",
    a: "Yes. Your Afro AI dashboard lets you manage all your domains in one place — renewals, DNS records, transfers, and connections to your websites.",
  },
];

export default function DomainsLandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const loginUrl = "/login";

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.href = loginUrl;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <a href="/" className="flex items-center gap-2">
            <span className="font-bold text-lg">Afro AI</span>
          </a>
          <div className="flex items-center gap-3">
            <a href={loginUrl}>
              <Button variant="ghost" size="sm">Log In</Button>
            </a>
            <a href={loginUrl}>
              <Button size="sm">Get Started <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            <Globe className="w-3 h-3 mr-1" /> Domain Store
          </Badge>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold leading-tight">
            Claim your name on the internet.
            <span className="text-primary block mt-1">African domains. Global reach.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Register your .africa, .co.ke, .ng, .co.za domain and hundreds more. Connect it to your Afro AI website in one click — or point it anywhere you like.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex gap-2 max-w-lg mx-auto mt-4">
            <input
              type="text"
              placeholder="Search for your domain name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-domain-search"
            />
            <Button type="submit" size="lg">
              <Search className="w-4 h-4 mr-1" /> Search
            </Button>
          </form>

          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground pt-2">
            {["Free WHOIS privacy", "Auto-renewal", "Instant DNS setup"].map(t => (
              <span key={t} className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" />{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Domain pricing grid */}
      <section className="py-12 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="font-serif text-2xl font-bold">Popular domain extensions</h2>
            <p className="text-muted-foreground text-sm mt-1">Prices shown per year. Renewal at the same rate.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {DOMAIN_EXTENSIONS.map((d, i) => (
              <a key={i} href={loginUrl}>
                <div className={`rounded-xl border bg-card p-4 hover:border-primary transition-colors cursor-pointer ${d.popular ? "border-primary/40" : "border-border"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-base">{d.ext}</span>
                    {d.popular && <Star className="w-3 h-3 text-primary fill-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{d.desc}</p>
                  <p className="text-primary font-semibold text-sm mt-2">${d.price}<span className="text-muted-foreground font-normal"> / yr</span></p>
                </div>
              </a>
            ))}
          </div>
          <div className="text-center mt-6">
            <a href={loginUrl}>
              <Button variant="outline">View All Extensions <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl font-bold mb-3">Everything included, nothing extra</h2>
            <p className="text-muted-foreground">No hidden fees. All the tools you need come with every domain.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <Card key={i} className="border border-border">
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

      {/* Connect to website banner */}
      <section className="py-12 px-4 bg-primary/5 border-y border-primary/10">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-serif text-xl font-bold">Already have an Afro AI website?</h3>
            <p className="text-muted-foreground text-sm mt-1">Connect your custom domain in one click from your dashboard. No technical knowledge needed.</p>
          </div>
          <a href={loginUrl} className="flex-shrink-0">
            <Button size="lg">
              Connect a Domain <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </a>
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
                  data-testid={`faq-domains-${i}`}
                >
                  {faq.q}
                  {openFaq === i ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 text-center bg-muted/30">
        <div className="max-w-xl mx-auto space-y-5">
          <h2 className="font-serif text-3xl font-bold">Your perfect domain is waiting.</h2>
          <p className="text-muted-foreground">Search, register, and connect — all in one place.</p>
          <a href={loginUrl}>
            <Button size="lg" className="animate-pulse-gold">
              Find Your Domain <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} KEYO TECHNOLOGIES — <a href="/" className="hover:text-primary transition-colors">Afro AI</a> · <a href="/privacy" className="hover:text-primary transition-colors">Privacy</a> · <a href="/terms" className="hover:text-primary transition-colors">Terms</a></p>
      </footer>
    </div>
  );
}
