import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Mail, Zap, Shield, BarChart3, Code2, Check, X,
  ArrowRight, ChevronDown, ChevronUp, Globe, Key,
  CheckCircle2, Send, Lock, RefreshCw, Smartphone, CreditCard,
  Receipt, KeyRound, Bell, ShoppingCart, GraduationCap, Building2,
  Loader2, Sparkles,
} from "lucide-react";

type Currency = "USD" | "KES" | "NGN" | "GHS" | "ZAR";
const CURRENCIES: { code: Currency; symbol: string; rate: number; label: string }[] = [
  { code: "USD", symbol: "$", rate: 1, label: "USD" },
  { code: "KES", symbol: "KSh", rate: 130, label: "KES" },
  { code: "NGN", symbol: "₦", rate: 1500, label: "NGN" },
  { code: "GHS", symbol: "₵", rate: 15, label: "GHS" },
  { code: "ZAR", symbol: "R", rate: 19, label: "ZAR" },
];

const PLANS = [
  {
    name: "Free",
    priceUSD: 0,
    desc: "Get started with transactional email at no cost",
    color: "border-border",
    badge: null,
    features: [
      "1,000 emails / month",
      "REST API + SMTP",
      "1 sending domain",
      "Delivery tracking",
      "API key management",
      "Community support",
    ],
    notIncluded: ["Dedicated IP", "Priority support", "Custom templates", "Webhooks"],
    cta: "Start Free",
    ctaVariant: "outline" as const,
  },
  {
    name: "Pro",
    priceUSD: 9,
    desc: "For growing apps and startups",
    color: "border-primary",
    badge: "Most Popular",
    features: [
      "10,000 emails / month",
      "REST API + SMTP",
      "5 sending domains",
      "Delivery + open + click tracking",
      "Webhooks",
      "Custom email templates",
      "Priority email support",
    ],
    notIncluded: ["Dedicated IP", "Dedicated account manager"],
    cta: "Get Started",
    ctaVariant: "default" as const,
  },
  {
    name: "Business",
    priceUSD: 29,
    desc: "For high-volume apps and agencies",
    color: "border-amber-500/40",
    badge: "Best Value",
    features: [
      "100,000 emails / month",
      "REST API + SMTP",
      "Unlimited sending domains",
      "Full tracking + analytics",
      "Webhooks",
      "Custom email templates",
      "Dedicated IP address",
      "Priority phone & email support",
      "Dedicated account manager",
    ],
    notIncluded: [],
    cta: "Contact Sales",
    ctaVariant: "outline" as const,
  },
];

const FEATURES = [
  { icon: Send, title: "Simple REST API", desc: "Send emails with a single API call. Works with any language — Node, Python, PHP, Go, and more." },
  { icon: Globe, title: "SMTP Support", desc: "Plug into your existing stack with standard SMTP credentials. No code changes required." },
  { icon: BarChart3, title: "Delivery Analytics", desc: "Track opens, clicks, bounces, and spam reports in real time from your dashboard." },
  { icon: Shield, title: "SPF, DKIM & DMARC", desc: "We guide you through domain verification so your emails land in inboxes, not spam folders." },
  { icon: Key, title: "API Key Management", desc: "Create multiple API keys with scoped permissions. Rotate or revoke them any time." },
  { icon: RefreshCw, title: "Webhooks", desc: "Get notified instantly when an email is delivered, opened, clicked, or bounced." },
];

const USE_CASES = [
  { icon: KeyRound, title: "OTP & 2FA codes", desc: "Deliver login codes in under 2 seconds." },
  { icon: Receipt, title: "Receipts & invoices", desc: "Order confirmations and payment receipts." },
  { icon: Bell, title: "Notifications", desc: "Real-time alerts and status updates." },
  { icon: ShoppingCart, title: "E-commerce updates", desc: "Order, shipping, and delivery emails." },
  { icon: Mail, title: "Welcome & onboarding", desc: "Engage users from their first signup." },
  { icon: GraduationCap, title: "Schools & results", desc: "Bulk results, fee notices, term updates." },
  { icon: Building2, title: "Fintech statements", desc: "Statements, KYC, and compliance emails." },
  { icon: Lock, title: "Password resets", desc: "Secure reset links with click tracking." },
];

const CODE_SAMPLES: Record<string, string> = {
  curl: `curl -X POST https://api.afroaigroup.com/v1/email/send \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "you@yourdomain.com",
    "to": "customer@example.com",
    "subject": "Your OTP Code",
    "text": "Your code is 482910"
  }'`,
  node: `import fetch from "node-fetch";

await fetch("https://api.afroaigroup.com/v1/email/send", {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: "you@yourdomain.com",
    to: "customer@example.com",
    subject: "Your OTP Code",
    text: "Your code is 482910",
  }),
});`,
  python: `import requests

requests.post(
  "https://api.afroaigroup.com/v1/email/send",
  headers={"Authorization": "Bearer YOUR_API_KEY"},
  json={
    "from": "you@yourdomain.com",
    "to": "customer@example.com",
    "subject": "Your OTP Code",
    "text": "Your code is 482910",
  },
)`,
  php: `<?php
$ch = curl_init("https://api.afroaigroup.com/v1/email/send");
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
  "Authorization: Bearer YOUR_API_KEY",
  "Content-Type: application/json",
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
  "from" => "you@yourdomain.com",
  "to" => "customer@example.com",
  "subject" => "Your OTP Code",
  "text" => "Your code is 482910",
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
echo curl_exec($ch);`,
  laravel: `use Illuminate\\Support\\Facades\\Http;

Http::withToken('YOUR_API_KEY')
  ->post('https://api.afroaigroup.com/v1/email/send', [
    'from'    => 'you@yourdomain.com',
    'to'      => 'customer@example.com',
    'subject' => 'Your OTP Code',
    'text'    => 'Your code is 482910',
  ]);`,
  go: `req, _ := http.NewRequest("POST",
  "https://api.afroaigroup.com/v1/email/send",
  strings.NewReader(\`{
    "from":"you@yourdomain.com",
    "to":"customer@example.com",
    "subject":"Your OTP Code",
    "text":"Your code is 482910"
  }\`))
req.Header.Set("Authorization", "Bearer YOUR_API_KEY")
req.Header.Set("Content-Type", "application/json")
http.DefaultClient.Do(req)`,
};

const COMPARISON = [
  { feature: "Free tier (emails/mo)", afro: "1,000", resend: "3,000", sendgrid: "100/day", mailgun: "Trial only" },
  { feature: "Starter price", afro: "$9 / 10k", resend: "$20 / 50k", sendgrid: "$19.95 / 50k", mailgun: "$15 / 10k" },
  { feature: "Mobile Money payment", afro: true, resend: false, sendgrid: false, mailgun: false },
  { feature: "Local currency (KES, NGN, etc.)", afro: true, resend: false, sendgrid: false, mailgun: false },
  { feature: "African support hours", afro: true, resend: false, sendgrid: false, mailgun: false },
  { feature: "POPIA / NDPR aware", afro: true, resend: false, sendgrid: false, mailgun: false },
  { feature: "REST API + SMTP", afro: true, resend: true, sendgrid: true, mailgun: true },
  { feature: "Webhooks", afro: true, resend: true, sendgrid: true, mailgun: true },
];

const FAQS = [
  { q: "How do I start sending emails?", a: "Sign up, verify your domain, and grab your API key. You can send your first email in under 5 minutes using our REST API or SMTP credentials." },
  { q: "Do I need to verify my domain?", a: "Yes. Domain verification (SPF + DKIM) is required to send emails from your own address. It protects your reputation and improves deliverability." },
  { q: "What counts as one email?", a: "Each recipient counts as one email. Sending to 100 people counts as 100 emails, regardless of how many attachments or template variables you use." },
  { q: "Can I pay with Mobile Money?", a: "Yes. We accept M-Pesa, MTN MoMo, Airtel Money, plus Visa, Mastercard and bank transfers via Pesapal across Africa." },
  { q: "Can I use this for marketing emails?", a: "The Email API is optimized for transactional emails (receipts, OTPs, notifications). For bulk marketing campaigns, check our Email Marketing tool in the dashboard." },
  { q: "What happens when I hit my monthly limit?", a: "Sending is paused until the next billing cycle. You can upgrade your plan at any time to increase your limit immediately." },
];

function formatPrice(usd: number, currency: typeof CURRENCIES[number], annual: boolean) {
  if (usd === 0) return "0";
  const monthly = annual ? usd * 0.8 : usd;
  const value = monthly * currency.rate;
  if (currency.code === "USD") return value.toFixed(0);
  return Math.round(value / 10) * 10 + "";
}

export default function EmailApiLandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [annual, setAnnual] = useState(false);
  const [demoEmail, setDemoEmail] = useState("");
  const [demoSending, setDemoSending] = useState(false);
  const [demoSent, setDemoSent] = useState(false);
  const { toast } = useToast();
  const loginUrl = "/login";
  const cur = CURRENCIES.find(c => c.code === currency)!;

  useEffect(() => {
    document.title = "Email API for Africa — Send transactional email | Afro AI";
    const setMeta = (name: string, content: string, prop = false) => {
      const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let el = document.querySelector(sel) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        if (prop) el.setAttribute("property", name); else el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("description", "Send transactional emails from your app with the Afro AI Email API. REST + SMTP, Mobile Money payments, local pricing in KES, NGN, GHS, ZAR. Free 1,000 emails/month.");
    setMeta("og:title", "Afro AI Email API — Built for Africa, sends worldwide", true);
    setMeta("og:description", "Transactional email API with Mobile Money payments, local currencies, and African support. Free 1,000 emails/month.", true);
    setMeta("og:type", "website", true);
    setMeta("twitter:card", "summary_large_image");
  }, []);

  async function handleDemoSend(e: React.FormEvent) {
    e.preventDefault();
    if (!demoEmail) return;
    setDemoSending(true);
    try {
      const res = await fetch("/api/email-api/demo-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: demoEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setDemoSent(true);
      toast({ title: "Test email sent!", description: `Check ${demoEmail} (and your spam folder, just in case).` });
    } catch (err: any) {
      toast({ title: "Couldn't send", description: err.message, variant: "destructive" });
    } finally {
      setDemoSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <a href="/" className="flex items-center gap-2">
            <span className="font-bold text-lg">Afro AI</span>
          </a>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#compare" className="hover:text-foreground">Compare</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#playground" className="hover:text-foreground">Try it</a>
          </div>
          <div className="flex items-center gap-3">
            <a href={loginUrl}><Button variant="ghost" size="sm">Log In</Button></a>
            <a href={loginUrl}>
              <Button size="sm" data-testid="button-nav-get-started">
                Get Started Free <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-4 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            <Mail className="w-3 h-3 mr-1" /> Developer Email API
          </Badge>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold leading-tight">
            Send emails from your app.
            <span className="text-primary block mt-1">Built for Africa. Sends worldwide.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Transactional email API with Mobile Money payments, local pricing, and African support.
            OTPs, receipts, notifications — delivered in seconds.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href={loginUrl}>
              <Button size="lg" data-testid="button-hero-start">
                Start Free — 1,000 emails/mo <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
            <a href="#playground">
              <Button size="lg" variant="outline" data-testid="button-hero-try">
                <Sparkles className="w-4 h-4 mr-1" /> Send a test email
              </Button>
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground pt-2">
            {["No credit card needed", "Free forever plan", "Pay with Mobile Money"].map(t => (
              <span key={t} className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" />{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof bar */}
      <section className="py-8 px-4 border-y bg-muted/20">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-xs uppercase tracking-wider text-muted-foreground mb-5">
            Trusted by builders across Africa & beyond
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 opacity-70">
            {["NAIROBI · KE", "LAGOS · NG", "ACCRA · GH", "CAPE TOWN · ZA", "KAMPALA · UG", "DAKAR · SN", "CAIRO · EG", "DAR ES SALAAM · TZ"].map(c => (
              <span key={c} className="text-sm font-mono text-muted-foreground">{c}</span>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-8 mt-6 text-center">
            <div><div className="text-2xl font-bold text-primary">12.4M+</div><div className="text-xs text-muted-foreground">emails this month</div></div>
            <div><div className="text-2xl font-bold text-primary">99.98%</div><div className="text-xs text-muted-foreground">delivery rate</div></div>
            <div><div className="text-2xl font-bold text-primary">142</div><div className="text-xs text-muted-foreground">countries reached</div></div>
            <div><div className="text-2xl font-bold text-primary">&lt;2s</div><div className="text-xs text-muted-foreground">average send time</div></div>
          </div>
        </div>
      </section>

      {/* Code samples — multi-language */}
      <section id="docs" className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="font-serif text-2xl font-bold">Send your first email in any language</h2>
            <p className="text-muted-foreground text-sm mt-1">cURL, Node, Python, PHP, Laravel, Go — copy-paste ready.</p>
          </div>
          <Tabs defaultValue="curl">
            <TabsList className="flex flex-wrap">
              {Object.keys(CODE_SAMPLES).map(k => (
                <TabsTrigger key={k} value={k} data-testid={`tab-code-${k}`}>{k.charAt(0).toUpperCase() + k.slice(1)}</TabsTrigger>
              ))}
            </TabsList>
            {Object.entries(CODE_SAMPLES).map(([k, v]) => (
              <TabsContent key={k} value={k}>
                <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-5 text-xs sm:text-sm font-mono overflow-x-auto text-zinc-100">
                  <pre className="whitespace-pre">{v}</pre>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </section>

      {/* Live playground */}
      <section id="playground" className="py-16 px-4 bg-muted/30">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 mb-3">
              <Sparkles className="w-3 h-3 mr-1" /> Live Demo
            </Badge>
            <h2 className="font-serif text-3xl font-bold mb-2">Send yourself a test email</h2>
            <p className="text-muted-foreground text-sm">No signup. We'll send you a real email so you can see how it lands.</p>
          </div>
          <Card>
            <CardContent className="p-6">
              <form onSubmit={handleDemoSend} className="flex flex-col sm:flex-row gap-3">
                <Input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={demoEmail}
                  onChange={(e) => { setDemoEmail(e.target.value); setDemoSent(false); }}
                  disabled={demoSending}
                  className="flex-1"
                  data-testid="input-demo-email"
                />
                <Button type="submit" disabled={demoSending || demoSent} data-testid="button-demo-send">
                  {demoSending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> :
                   demoSent ? <><Check className="w-4 h-4 mr-2" /> Sent!</> :
                   <><Send className="w-4 h-4 mr-2" /> Send test</>}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground mt-3">
                One test per IP every 10 minutes. Check your spam folder if it doesn't appear.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-serif text-3xl font-bold mb-3">Built for every kind of email</h2>
            <p className="text-muted-foreground">From OTPs to receipts to fintech statements.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {USE_CASES.map((u, i) => (
              <Card key={i} className="border border-border hover-elevate">
                <CardContent className="p-5 space-y-2">
                  <u.icon className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-sm">{u.title}</h3>
                  <p className="text-xs text-muted-foreground">{u.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl font-bold mb-3">Everything you need to send email</h2>
            <p className="text-muted-foreground">No complex setup. Works from day one.</p>
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

      {/* Trust & compliance */}
      <section className="py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground">Security & compliance</h3>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {["SPF", "DKIM", "DMARC", "TLS 1.3", "POPIA aware", "NDPR aware", "Kenya DPA", "GDPR-friendly", "SOC 2 (in progress)"].map(b => (
              <Badge key={b} variant="outline" className="text-xs py-1.5 px-3">
                <Shield className="w-3 h-3 mr-1.5 text-primary" />{b}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section id="compare" className="py-16 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-serif text-3xl font-bold mb-3">How we compare</h2>
            <p className="text-muted-foreground">Why African builders are switching to Afro AI Email API.</p>
          </div>
          <p className="text-center text-xs text-muted-foreground mb-4">
            Public information from competitor websites as of April 2026. Pricing and features may change — always check the latest on each provider's site.
          </p>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium">Feature</th>
                  <th className="text-center p-4 font-bold text-primary">Afro AI</th>
                  <th className="text-center p-4 font-medium text-muted-foreground">Resend</th>
                  <th className="text-center p-4 font-medium text-muted-foreground">SendGrid</th>
                  <th className="text-center p-4 font-medium text-muted-foreground">Mailgun</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-4 text-muted-foreground">{row.feature}</td>
                    {[row.afro, row.resend, row.sendgrid, row.mailgun].map((cell, j) => (
                      <td key={j} className={`p-4 text-center ${j === 0 ? "bg-primary/5" : ""}`}>
                        {cell === true ? <Check className="w-5 h-5 text-primary mx-auto" /> :
                         cell === false ? <X className="w-5 h-5 text-muted-foreground/40 mx-auto" /> :
                         <span className={j === 0 ? "font-semibold text-foreground" : "text-muted-foreground"}>{cell}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="font-serif text-3xl font-bold mb-3">Simple, transparent pricing</h2>
            <p className="text-muted-foreground">Start free. Pay in your local currency.</p>
          </div>

          {/* Currency + billing toggle */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {CURRENCIES.map(c => (
                <button
                  key={c.code}
                  onClick={() => setCurrency(c.code)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${currency === c.code ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  data-testid={`button-currency-${c.code}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setAnnual(false)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${!annual ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                data-testid="button-billing-monthly"
              >Monthly</button>
              <button
                onClick={() => setAnnual(true)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${annual ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                data-testid="button-billing-annual"
              >Annual <span className="text-primary">−20%</span></button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <div key={i} className={`rounded-2xl border-2 ${plan.color} bg-card p-6 space-y-5 relative`}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">{plan.badge}</Badge>
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{plan.desc}</p>
                </div>
                <div>
                  <span className="text-4xl font-bold">{cur.symbol}{formatPrice(plan.priceUSD, cur, annual)}</span>
                  <span className="text-muted-foreground text-sm"> / mo</span>
                  {annual && plan.priceUSD > 0 && <div className="text-xs text-primary mt-1">Equivalent monthly · billed annually</div>}
                </div>
                <ul className="space-y-2 text-sm">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                  {plan.notIncluded.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-muted-foreground">
                      <X className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a href={loginUrl} className="block">
                  <Button variant={plan.ctaVariant} className="w-full" data-testid={`button-plan-${plan.name.toLowerCase()}`}>{plan.cta}</Button>
                </a>
              </div>
            ))}
          </div>

          {/* Payment methods */}
          <div className="mt-10 text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Pay with</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { icon: Smartphone, label: "M-Pesa" },
                { icon: Smartphone, label: "MTN MoMo" },
                { icon: Smartphone, label: "Airtel Money" },
                { icon: CreditCard, label: "Visa" },
                { icon: CreditCard, label: "Mastercard" },
                { icon: Building2, label: "Bank Transfer" },
              ].map(p => (
                <Badge key={p.label} variant="outline" className="text-xs py-1.5 px-3">
                  <p.icon className="w-3 h-3 mr-1.5 text-primary" />{p.label}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Secured by Pesapal · Available across Africa</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-serif text-3xl font-bold text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-4 text-left font-medium hover:bg-muted/40 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                  aria-controls={`faq-panel-${i}`}
                  data-testid={`faq-email-api-${i}`}
                >
                  {faq.q}
                  {openFaq === i ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                </button>
                {openFaq === i && (
                  <div id={`faq-panel-${i}`} className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 text-center bg-muted/30">
        <div className="max-w-xl mx-auto space-y-5">
          <h2 className="font-serif text-3xl font-bold">Ready to send your first email?</h2>
          <p className="text-muted-foreground">Free forever. No credit card needed. Up in minutes.</p>
          <a href={loginUrl}>
            <Button size="lg" className="animate-pulse-gold" data-testid="button-cta-create">
              Create Free Account <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground pb-24 md:pb-8">
        <p>© {new Date().getFullYear()} KEYO TECHNOLOGIES — <a href="/" className="hover:text-primary transition-colors">Afro AI</a> · <a href="/privacy" className="hover:text-primary transition-colors">Privacy</a> · <a href="/terms" className="hover:text-primary transition-colors">Terms</a></p>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t bg-background/95 backdrop-blur p-3">
        <a href={loginUrl} className="block">
          <Button className="w-full" size="lg" data-testid="button-mobile-sticky-cta">
            Start free — 1,000 emails/mo <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </a>
      </div>
    </div>
  );
}
