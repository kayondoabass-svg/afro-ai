import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Smartphone, Zap, Globe, BarChart3, Check, X,
  ArrowRight, ChevronDown, ChevronUp, Users,
  CheckCircle2, Layers, Phone, Wifi, Code2,
} from "lucide-react";

const PLANS = [
  {
    name: "Starter",
    price: 19,
    desc: "For small businesses testing USSD",
    color: "border-border",
    badge: null,
    features: [
      "1 USSD application",
      "Up to 5 menu levels",
      "500 sessions / month",
      "Visual menu builder",
      "Basic analytics",
      "Email support",
    ],
    notIncluded: ["Multiple apps", "API integrations", "Custom shortcode", "Priority support"],
    cta: "Start Free Trial",
    ctaVariant: "outline" as const,
  },
  {
    name: "Business",
    price: 49,
    desc: "For companies serving customers via USSD",
    color: "border-primary",
    badge: "Most Popular",
    features: [
      "5 USSD applications",
      "Unlimited menu levels",
      "5,000 sessions / month",
      "Visual menu builder",
      "Full analytics & logs",
      "REST API integration",
      "Connect to your backend",
      "Priority email support",
    ],
    notIncluded: ["Dedicated shortcode", "Dedicated account manager"],
    cta: "Get Started",
    ctaVariant: "default" as const,
  },
  {
    name: "Enterprise",
    price: 99,
    desc: "For telcos and large-scale deployments. Live on Africa's Talking — Kenya, Uganda, Tanzania, Rwanda, Malawi, Nigeria, Ethiopia, South Africa.",
    color: "border-amber-500/40",
    badge: "Best Value",
    features: [
      "Unlimited USSD applications",
      "Unlimited menu levels",
      "50,000 sessions / month",
      "Visual menu builder",
      "Full analytics & logs",
      "REST API integration",
      "Connect to your backend",
      "Dedicated shortcode",
      "Multi-network support",
      "Dedicated account manager",
      "SLA guarantee",
    ],
    notIncluded: [],
    cta: "Contact Sales",
    ctaVariant: "outline" as const,
  },
];

const FEATURES = [
  {
    icon: Layers,
    title: "Visual Menu Builder",
    desc: "Design your USSD menu flow with a drag-and-drop builder. No coding required.",
  },
  {
    icon: Phone,
    title: "Works on Any Phone",
    desc: "USSD reaches feature phones, smartphones — any device with a SIM card. No internet needed.",
  },
  {
    icon: Globe,
    title: "Multi-Network Support",
    desc: "Deploy across MTN, Airtel, Safaricom, Glo, and other African mobile networks.",
  },
  {
    icon: Code2,
    title: "API Integration",
    desc: "Connect your USSD menus to any backend or database via REST API. Real-time dynamic content.",
  },
  {
    icon: BarChart3,
    title: "Session Analytics",
    desc: "Track sessions, drop-off points, and user journeys. Understand how people use your service.",
  },
  {
    icon: Wifi,
    title: "No Internet Required",
    desc: "Your customers don't need data bundles. USSD works on the basic GSM network — always available.",
  },
];

const USE_CASES = [
  { icon: "🏦", title: "Mobile Banking", desc: "Balance checks, transfers, and bill payments without a smartphone or app." },
  { icon: "🛒", title: "Order & Payments", desc: "Let customers order products or pay for services via shortcode." },
  { icon: "📋", title: "Surveys & Feedback", desc: "Collect customer feedback from any phone, anywhere." },
  { icon: "🏥", title: "Health Services", desc: "Book appointments, check results, or receive health tips via USSD." },
  { icon: "🎓", title: "Education", desc: "Deliver lesson content, quizzes, and results to students without smartphones." },
  { icon: "🚜", title: "Agriculture", desc: "Give farmers market prices, weather updates, and tips via USSD." },
];

const FAQS = [
  {
    q: "What is USSD?",
    a: "USSD (Unstructured Supplementary Service Data) is a mobile technology that lets users interact with a menu system by dialing a shortcode like *123#. It works on any GSM phone — no smartphone or internet required.",
  },
  {
    q: "Do my customers need internet to use a USSD service?",
    a: "No. That's the biggest advantage of USSD. It works over the basic mobile network, making it accessible to everyone with a SIM card, even in areas with no data coverage.",
  },
  {
    q: "How do I deploy my USSD app to a mobile network?",
    a: "After building your USSD app in Afro AI, we handle the network integration. You choose which networks to deploy to (MTN, Airtel, Safaricom, etc.) and we manage the technical connection.",
  },
  {
    q: "Can I connect my USSD menu to my own database?",
    a: "Yes. On Business and Enterprise plans, you can connect your USSD menus to your backend via REST API. Display live data, process payments, or trigger any action in your system.",
  },
  {
    q: "What is a USSD session?",
    a: "A session starts when a user dials your shortcode and ends when the interaction is complete or times out. Each complete interaction counts as one session.",
  },
];

export default function UssdLandingPage() {
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
              <Button size="sm">Get Started <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            <Phone className="w-3 h-3 mr-1" /> USSD Builder
          </Badge>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold leading-tight">
            Build USSD apps that reach
            <span className="text-primary block mt-1">every African phone.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Afro AI USSD Builder lets you create, test, and deploy USSD services across African mobile networks — without writing a single line of code. Reach customers who don't have smartphones or internet.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href={loginUrl}>
              <Button size="lg">
                Build Your USSD App
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
            <a href="#how-it-works">
              <Button size="lg" variant="outline">
                See How It Works
              </Button>
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground pt-2">
            {["No coding needed", "Works on any phone", "Multi-network deployment"].map(t => (
              <span key={t} className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" />{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 px-4 bg-muted/30">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { value: "1B+", label: "Feature phone users in Africa" },
            { value: "54", label: "African countries covered" },
            { value: "10+", label: "Mobile networks supported" },
            { value: "99.9%", label: "Network uptime" },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-3xl font-bold text-primary">{s.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl font-bold mb-3">Built for African mobile</h2>
            <p className="text-muted-foreground">Everything you need to launch a USSD service.</p>
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

      {/* Use cases */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-serif text-3xl font-bold mb-3">Who uses USSD?</h2>
            <p className="text-muted-foreground">Industries already transforming with USSD in Africa.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {USE_CASES.map((u, i) => (
              <div key={i} className="bg-card border rounded-xl p-5 flex gap-4 items-start">
                <span className="text-2xl">{u.icon}</span>
                <div>
                  <h3 className="font-semibold text-sm">{u.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{u.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl font-bold mb-3">Pricing</h2>
            <p className="text-muted-foreground">Start with a free trial. Scale as your user base grows.</p>
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
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-serif text-3xl font-bold text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border rounded-xl overflow-hidden bg-card">
                <button
                  className="w-full flex items-center justify-between p-4 text-left font-medium hover:bg-muted/40 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  data-testid={`faq-ussd-${i}`}
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
      <section className="py-20 px-4 text-center">
        <div className="max-w-xl mx-auto space-y-5">
          <h2 className="font-serif text-3xl font-bold">Start reaching more customers today.</h2>
          <p className="text-muted-foreground">Join businesses across Africa using Afro AI to build USSD services in hours, not months.</p>
          <a href={loginUrl}>
            <Button size="lg" className="animate-pulse-gold">
              Build Your USSD App Free <ArrowRight className="w-4 h-4 ml-1" />
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
