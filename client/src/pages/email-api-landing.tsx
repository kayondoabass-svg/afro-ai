import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Mail, Zap, Shield, BarChart3, Code2, Check, X,
  ArrowRight, ChevronDown, ChevronUp, Globe, Key,
  CheckCircle2, Send, Lock, RefreshCw,
} from "lucide-react";

const PLANS = [
  {
    name: "Free",
    price: 0,
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
    price: 9,
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
    price: 29,
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
  {
    icon: Send,
    title: "Simple REST API",
    desc: "Send emails with a single API call. Works with any language — Node, Python, PHP, Go, and more.",
  },
  {
    icon: Globe,
    title: "SMTP Support",
    desc: "Plug into your existing stack with standard SMTP credentials. No code changes required.",
  },
  {
    icon: BarChart3,
    title: "Delivery Analytics",
    desc: "Track opens, clicks, bounces, and spam reports in real time from your dashboard.",
  },
  {
    icon: Shield,
    title: "SPF, DKIM & DMARC",
    desc: "We guide you through domain verification so your emails land in inboxes, not spam folders.",
  },
  {
    icon: Key,
    title: "API Key Management",
    desc: "Create multiple API keys with scoped permissions. Rotate or revoke them any time.",
  },
  {
    icon: RefreshCw,
    title: "Webhooks",
    desc: "Get notified instantly when an email is delivered, opened, clicked, or bounced.",
  },
];

const FAQS = [
  {
    q: "How do I start sending emails?",
    a: "Sign up, verify your domain, and grab your API key. You can send your first email in under 5 minutes using our REST API or SMTP credentials.",
  },
  {
    q: "Do I need to verify my domain?",
    a: "Yes. Domain verification (SPF + DKIM) is required to send emails from your own address. It protects your reputation and improves deliverability.",
  },
  {
    q: "What counts as one email?",
    a: "Each recipient counts as one email. Sending to 100 people counts as 100 emails, regardless of how many attachments or template variables you use.",
  },
  {
    q: "Can I use this for marketing emails?",
    a: "The Email API is optimized for transactional emails (receipts, OTPs, notifications). For bulk marketing campaigns, check our Email Marketing tool in the dashboard.",
  },
  {
    q: "What happens when I hit my monthly limit?",
    a: "Sending is paused until the next billing cycle. You can upgrade your plan at any time to increase your limit immediately.",
  },
];

export default function EmailApiLandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const loginUrl = "/login";

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
              <Button size="sm">Get Started Free <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            <Mail className="w-3 h-3 mr-1" /> Developer Email API
          </Badge>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold leading-tight">
            Send emails from your app.
            <span className="text-primary block mt-1">Fast, reliable, affordable.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Afro AI Email API lets developers send transactional emails — OTPs, receipts, notifications — via REST API or SMTP. Built for African apps, priced fairly.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href={loginUrl}>
              <Button size="lg">
                Start Free — 1,000 emails/mo
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
            <a href="/docs/email-api">
              <Button size="lg" variant="outline">
                <Code2 className="w-4 h-4 mr-1" /> View Setup Guide
              </Button>
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground pt-2">
            {["No credit card needed", "Free forever plan", "SMTP + REST API"].map(t => (
              <span key={t} className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" />{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Code snippet */}
      <section id="docs" className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-6 text-sm font-mono overflow-x-auto">
            <p className="text-zinc-400 mb-2">{"// Send an email in one request"}</p>
            <p className="text-blue-400">{"fetch"}<span className="text-white">{"('https://api.afroaigroup.com/v1/email/send', {"}</span></p>
            <p className="text-white ml-4">{"method: 'POST',"}</p>
            <p className="text-white ml-4">{"headers: { 'Authorization': 'Bearer YOUR_API_KEY' },"}</p>
            <p className="text-white ml-4">{"body: JSON.stringify({"}</p>
            <p className="text-green-400 ml-8">{"from: 'you@yourdomain.com',"}</p>
            <p className="text-green-400 ml-8">{"to: 'customer@example.com',"}</p>
            <p className="text-green-400 ml-8">{"subject: 'Your OTP Code',"}</p>
            <p className="text-green-400 ml-8">{"text: 'Your code is 482910'"}</p>
            <p className="text-white ml-4">{"}),"}</p>
            <p className="text-white">{"});"}</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
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

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl font-bold mb-3">Simple, transparent pricing</h2>
            <p className="text-muted-foreground">Start free. Scale as you grow.</p>
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
                  <span className="text-4xl font-bold">${plan.price}</span>
                  <span className="text-muted-foreground text-sm"> / month</span>
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
                  <Button variant={plan.ctaVariant} className="w-full">{plan.cta}</Button>
                </a>
              </div>
            ))}
          </div>
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
                  data-testid={`faq-email-api-${i}`}
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
          <h2 className="font-serif text-3xl font-bold">Ready to send your first email?</h2>
          <p className="text-muted-foreground">Free forever. No credit card needed. Up in minutes.</p>
          <a href={loginUrl}>
            <Button size="lg" className="animate-pulse-gold">
              Create Free Account <ArrowRight className="w-4 h-4 ml-1" />
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
