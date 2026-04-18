import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import LiveDemoChat from "@/components/live-demo-chat";
import {
  MessageSquare, Zap, Globe, Shield, BarChart3, Code2,
  Check, X, ArrowRight, Star, ChevronDown, ChevronUp,
  Building2, Landmark, ShoppingBag, GraduationCap,
  Bot, Sparkles, CheckCircle2, TrendingUp, Cpu,
  Stethoscope, Home, Banknote, Hotel, Languages, Wand2,
  AlertTriangle, Quote,
} from "lucide-react";

const LANGUAGES = [
  "English", "Swahili", "Pidgin", "Yoruba", "Hausa", "Igbo",
  "Amharic", "Wolof", "Luganda", "Kinyarwanda", "Zulu", "Xhosa",
  "French", "Arabic", "Portuguese", "Lingala", "Shona", "Somali",
  "Twi", "Tigrinya", "Oromo", "Chichewa", "Afrikaans", "+ 20 more",
];

const PLANS = [
  {
    name: "Starter",
    price: 19,
    desc: "Perfect for small businesses and personal websites",
    color: "border-border",
    badge: null,
    features: [
      "1 AI chatbot",
      "1,000 AI replies / month",
      "Custom knowledge base",
      "Brand color & greeting",
      "1-line embed code",
      "Conversation history (7 days)",
      "Email support",
    ],
    notIncluded: ["White-label (remove branding)", "Multiple chatbots", "Priority support", "API access"],
    cta: "Start Free Trial",
    ctaVariant: "outline" as const,
  },
  {
    name: "Business",
    price: 49,
    desc: "Ideal for growing companies and agencies",
    color: "border-primary",
    badge: "Most Popular",
    features: [
      "5 AI chatbots",
      "5,000 AI replies / month",
      "Custom knowledge base per bot",
      "Full brand customization",
      "1-line embed code",
      "Conversation history (30 days)",
      "White-label (no Afro AI branding)",
      "Install verification tool",
      "Priority email support",
    ],
    notIncluded: ["Unlimited chatbots", "Dedicated account manager"],
    cta: "Get Started",
    ctaVariant: "default" as const,
  },
  {
    name: "Agency",
    price: 99,
    desc: "For agencies managing multiple client chatbots",
    color: "border-amber-500/40",
    badge: "Best Value",
    features: [
      "Unlimited AI chatbots",
      "20,000 AI replies / month",
      "Custom knowledge base per bot",
      "Full brand customization",
      "1-line embed code",
      "Conversation history (90 days)",
      "White-label (no Afro AI branding)",
      "Install verification tool",
      "API access",
      "Dedicated account manager",
      "Priority phone & email support",
    ],
    notIncluded: [],
    cta: "Contact Sales",
    ctaVariant: "outline" as const,
  },
];

const COMPETITORS = [
  { name: "Tidio", price: "$29–$349/mo", perConvo: false, whiteLabel: "$20 extra", afroAi: false },
  { name: "Chatbase", price: "$40–$500/mo", perConvo: true, whiteLabel: "$39 extra", afroAi: false },
  { name: "Intercom (Fin)", price: "$29/seat + $0.99/reply", perConvo: true, whiteLabel: true, afroAi: false },
  { name: "Crisp", price: "$49–$323/mo", perConvo: false, whiteLabel: "Plus plan only", afroAi: false },
  { name: "Afro AI Chatbot", price: "$19–$99/mo", perConvo: false, whiteLabel: "Included", afroAi: true },
];

const FAQS = [
  {
    q: "What is an AI reply?",
    a: "Each time a visitor sends a message and the chatbot responds, that counts as one AI reply. If a visitor sends 5 messages in one conversation, that uses 5 replies.",
  },
  {
    q: "How do I install the chatbot on my website?",
    a: "Copy one line of code and paste it before the </body> tag on your website. The chatbot appears instantly — no developer needed.",
  },
  {
    q: "Can I use my own brand colors and name?",
    a: "Yes. On all plans you can set the chatbot's name, greeting, and brand color. On Business and Agency plans, the 'Powered by Afro AI' badge is removed completely.",
  },
  {
    q: "What language does the chatbot support?",
    a: "The chatbot responds in any language your visitors write in — Swahili, French, Arabic, English, Portuguese, and more. Powered by Afro AI Agent 4 — our African-tuned AI stack built on top of leading frontier language models, fine-tuned for African languages and conversational context.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. The Starter plan comes with a 14-day free trial — no credit card required. You can test a live chatbot on your real website before paying.",
  },
  {
    q: "What happens if I exceed my monthly replies?",
    a: "Your chatbot will gracefully let visitors know it's temporarily unavailable. You can upgrade your plan or wait for the monthly reset — no surprise charges.",
  },
  {
    q: "Can I buy this for a client's website?",
    a: "Yes. The Business and Agency plans are designed for agencies. You create and manage chatbots for multiple clients from your Afro AI dashboard.",
  },
  {
    q: "Do you offer payment via mobile money?",
    a: "Yes. We accept M-Pesa, Airtel Money, Visa, Mastercard, and bank transfers across Africa via Pesapal.",
  },
];

const USE_CASES = [
  { icon: Landmark, label: "Government Portals", desc: "Answer citizen FAQs 24/7 without hiring staff" },
  { icon: Building2, label: "Businesses", desc: "Handle customer support while your team sleeps" },
  { icon: ShoppingBag, label: "Online Stores", desc: "Guide shoppers, answer product questions, boost sales" },
  { icon: GraduationCap, label: "Schools & Universities", desc: "Student admission and course enquiry bots" },
];

function RoiCalculator() {
  const [msgsPerDay, setMsgsPerDay] = useState(40);
  const [staffCostMonthly, setStaffCostMonthly] = useState(80000);
  const [currency, setCurrency] = useState<"NGN" | "KES" | "UGX" | "ZAR" | "USD">("NGN");

  const symbols: Record<string, string> = { NGN: "₦", KES: "KSh", UGX: "USh", ZAR: "R", USD: "$" };
  const botCosts: Record<string, number> = { NGN: 15000, KES: 2500, UGX: 70000, ZAR: 350, USD: 19 };
  const sym = symbols[currency];
  const botCost = botCosts[currency];

  const messagesPerMonth = msgsPerDay * 30;
  const savings = Math.max(0, staffCostMonthly - botCost);
  const fmt = (n: number) => n.toLocaleString();

  return (
    <section className="py-20 px-4 bg-muted/20 border-y border-border/30">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <Badge className="mb-3 bg-primary/10 text-primary border-primary/20">ROI Calculator</Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">How much will this save you?</h2>
          <p className="text-muted-foreground">Adjust the sliders for your business. See the real number.</p>
        </div>
        <Card className="border-border/50">
          <CardContent className="p-6 md:p-8 grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Currency</label>
                <div className="flex gap-1.5 flex-wrap">
                  {(["NGN", "KES", "UGX", "ZAR", "USD"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        currency === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}
                      data-testid={`roi-currency-${c}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="flex items-center justify-between text-sm mb-2">
                  <span>Customer messages per day</span>
                  <span className="font-bold text-primary">{fmt(msgsPerDay)}</span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={500}
                  step={5}
                  value={msgsPerDay}
                  onChange={(e) => setMsgsPerDay(Number(e.target.value))}
                  className="w-full accent-primary"
                  data-testid="roi-slider-messages"
                />
                <p className="text-xs text-muted-foreground mt-1">≈ {fmt(messagesPerMonth)} per month</p>
              </div>
              <div>
                <label className="flex items-center justify-between text-sm mb-2">
                  <span>Current monthly cost of replying (staff)</span>
                  <span className="font-bold text-primary">{sym}{fmt(staffCostMonthly)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={currency === "USD" ? 2000 : currency === "UGX" ? 1500000 : currency === "KES" ? 80000 : currency === "ZAR" ? 20000 : 500000}
                  step={currency === "UGX" ? 10000 : currency === "USD" ? 50 : 1000}
                  value={staffCostMonthly}
                  onChange={(e) => setStaffCostMonthly(Number(e.target.value))}
                  className="w-full accent-primary"
                  data-testid="roi-slider-staff"
                />
              </div>
            </div>
            <div className="bg-gradient-to-br from-primary/10 to-amber-500/5 rounded-2xl p-6 flex flex-col justify-center text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">You'd save approximately</p>
              <p className="text-4xl md:text-5xl font-extrabold text-primary mb-1" data-testid="text-roi-savings">
                {sym}{fmt(savings)}
              </p>
              <p className="text-sm text-muted-foreground mb-5">per month</p>
              <p className="text-xs text-foreground mb-1">+ never miss a customer at 2am</p>
              <p className="text-xs text-foreground mb-1">+ instant replies in 40+ languages</p>
              <p className="text-xs text-foreground mb-5">+ scales free as your business grows</p>
              <p className="text-[10px] text-muted-foreground italic">Estimate based on Starter plan ({sym}{fmt(botCost)}/mo). Actual savings vary.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export default function ChatbotLandingPage() {
  const [, navigate] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [billingAnnual, setBillingAnnual] = useState(false);

  const price = (base: number) =>
    billingAnnual ? Math.round(base * 0.8) : base;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <span className="font-bold text-lg text-primary cursor-pointer">Afro AI</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#compare" className="hover:text-foreground transition-colors">Compare</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")} data-testid="link-chatbot-login">
              Sign In
            </Button>
            <Button size="sm" onClick={() => navigate("/login")} className="bg-primary text-primary-foreground" data-testid="button-chatbot-cta-nav">
              Get Started Free
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden py-24 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-amber-500/5 pointer-events-none" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 gap-1.5 px-3 py-1">
            <Bot className="w-3.5 h-3.5" /> AI-Powered Chatbot for Any Website
          </Badge>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
            Your website's smartest<br />
            <span className="text-primary">employee. Live in 2 minutes.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
            Paste your website link. Our AI reads it, learns your business, and starts answering customers
            in <span className="text-foreground font-medium">English, Pidgin, Swahili, Yoruba</span> and 40+ languages — 24/7.
            One line of code. No developer needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              onClick={() => navigate("/chatbot-checkout?plan=starter")}
              className="bg-primary text-primary-foreground gap-2 text-base px-8"
              data-testid="button-hero-cta"
            >
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/chatbot-checkout?plan=business")}
              className="gap-2 text-base px-8"
              data-testid="button-hero-secondary"
            >
              <MessageSquare className="w-4 h-4" /> See Demo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            14-day free trial · No credit card required · Cancel anytime
          </p>

          {/* Hero mockup */}
          <div className="mt-16 relative max-w-sm mx-auto">
            <div className="rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden">
              <div className="bg-primary p-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-white text-xs font-semibold">Kampala City Council Bot</p>
                  <p className="text-white/70 text-[10px]">Online · Powered by AI</p>
                </div>
              </div>
              <div className="p-4 space-y-3 bg-background">
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center">
                    <Bot className="w-3 h-3 text-primary" />
                  </div>
                  <div className="bg-muted rounded-xl rounded-tl-none p-2.5 text-xs max-w-[80%]">
                    Hello! I'm your digital assistant. How can I help you today? 🇺🇬
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="bg-primary rounded-xl rounded-tr-none p-2.5 text-xs text-primary-foreground max-w-[75%]">
                    How do I renew my business license?
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center">
                    <Bot className="w-3 h-3 text-primary" />
                  </div>
                  <div className="bg-muted rounded-xl rounded-tl-none p-2.5 text-xs max-w-[80%]">
                    To renew your business license, visit our offices at City Hall or use our online portal at kcca.go.ug. You'll need your TIN number and previous license. The renewal fee is UGX 150,000 for sole proprietors...
                  </div>
                </div>
                <div className="flex gap-2 items-center mt-1">
                  <input
                    readOnly
                    placeholder="Type your question..."
                    className="flex-1 text-xs bg-muted/50 border border-border/50 rounded-lg px-3 py-2 outline-none"
                  />
                  <button className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                    <ArrowRight className="w-3 h-3 text-primary-foreground" />
                  </button>
                </div>
              </div>
            </div>
            {/* floating badge */}
            <div className="absolute -top-3 -right-3 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
              LIVE
            </div>
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-card border border-border/50 text-xs px-3 py-1.5 rounded-full shadow-md whitespace-nowrap text-muted-foreground">
              <Code2 className="w-3 h-3 inline mr-1.5 text-primary" />
              1 line of code to embed
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-10 px-4 border-y border-border/30 bg-muted/20">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs text-muted-foreground mb-6 uppercase tracking-widest">Trusted by teams across Africa and beyond</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {USE_CASES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="text-center">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NEW: Auto-Scan spotlight */}
      <section className="py-20 px-4 bg-gradient-to-br from-primary/5 via-background to-amber-500/5 border-y border-border/30">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <Badge className="mb-3 bg-primary/10 text-primary border-primary/20 gap-1.5">
                <Wand2 className="w-3.5 h-3.5" /> NEW · Auto-Scan
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
                Paste a link. <span className="text-primary">Get a trained bot.</span>
              </h2>
              <p className="text-muted-foreground mb-5 leading-relaxed">
                We crawl your website, extract every Q&A your customers might ask, group them by topic,
                and auto-flag anything sensitive — prices, salaries, personal data — so you control what the bot can share.
              </p>
              <ul className="space-y-2.5 text-sm">
                <li className="flex gap-2 items-start">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><span className="font-medium text-foreground">Up to 30 pages</span> scanned automatically — no manual training</span>
                </li>
                <li className="flex gap-2 items-start">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><span className="font-medium text-foreground">Sensitive content detection</span> — emails, phones, prices, confidential info auto-excluded by default</span>
                </li>
                <li className="flex gap-2 items-start">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><span className="font-medium text-foreground">Confidence-tiered answers</span> — bot escalates to a human when it isn't sure</span>
                </li>
                <li className="flex gap-2 items-start">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><span className="font-medium text-foreground">Source citations</span> — every answer links back to the page it learned from</span>
                </li>
                <li className="flex gap-2 items-start">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><span className="font-medium text-foreground">Smart re-scans</span> — only re-learns pages that actually changed</span>
                </li>
              </ul>
            </div>
            <div className="relative">
              <div className="rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden">
                <div className="bg-muted/40 px-4 py-2 flex items-center gap-2 border-b border-border/50">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                  </div>
                  <span className="text-xs text-muted-foreground ml-2">Auto-Scan in progress</span>
                </div>
                <div className="p-5 space-y-3 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Crawling https://yourbusiness.com…
                  </div>
                  <div className="space-y-1.5 pl-4 border-l-2 border-primary/30">
                    <p className="text-foreground"><span className="text-green-500">✓</span> 28 pages scanned</p>
                    <p className="text-foreground"><span className="text-green-500">✓</span> 142 Q&As extracted</p>
                    <p className="text-foreground"><span className="text-amber-500">⚠</span> 11 flagged as sensitive</p>
                    <p className="text-foreground"><span className="text-green-500">✓</span> Grouped into 9 topics</p>
                  </div>
                  <div className="pt-3 border-t border-border/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Pricing & Plans</span>
                      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[9px] gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> sensitive
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Shipping & Delivery</span>
                      <span className="text-green-500 text-[10px]">14 Q&As · active</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Returns Policy</span>
                      <span className="text-green-500 text-[10px]">8 Q&As · active</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NEW: Languages section */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <Badge className="mb-3 bg-primary/10 text-primary border-primary/20 gap-1.5">
            <Languages className="w-3.5 h-3.5" /> Speaks how your customers actually speak
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">40+ languages, including African ones nobody else supports</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            Western chatbots reply in textbook English. Yours replies in Pidgin, Swahili, Luganda, Amharic — the way your customers actually message you on WhatsApp.
          </p>
          <div className="flex flex-wrap gap-2 justify-center max-w-3xl mx-auto">
            {LANGUAGES.map((lang) => (
              <Badge
                key={lang}
                variant="outline"
                className="bg-background border-border/50 text-foreground px-3 py-1.5 text-xs hover:border-primary/40 hover:bg-primary/5 transition-colors"
                data-testid={`lang-${lang.toLowerCase().replace(/\s|\+/g, "-")}`}
              >
                {lang}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <Badge className="mb-3 bg-primary/10 text-primary border-primary/20">Features</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Everything you need, nothing you don't</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              No complex flow builders. No per-conversation charges. Just a smart AI chatbot that knows your business.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Zap, title: "60-Second Setup", desc: "Paste one line of code. Your chatbot is live instantly — no developer, no configuration, no downtime." },
              { icon: Cpu, title: "Powered by Afro AI Agent 4", desc: "Our African-tuned AI stack built on leading frontier language models — understands context, follow-ups, and complex queries." },
              { icon: Globe, title: "Speaks Every Language", desc: "Automatically replies in Swahili, French, Arabic, English, Portuguese — any language your visitors write in." },
              { icon: Shield, title: "Your Knowledge Base", desc: "Feed it your FAQs, services, policies, and products. The AI only answers from your approved content." },
              { icon: BarChart3, title: "Conversation Analytics", desc: "See what visitors are asking, conversation volumes, and trends to improve your service over time." },
              { icon: Sparkles, title: "White-Label Ready", desc: "Remove all Afro AI branding. Your chatbot appears as your own — perfect for agencies serving clients." },
              { icon: MessageSquare, title: "Conversation History", desc: "Review every conversation your chatbot has had. Search, filter, and export for quality assurance." },
              { icon: CheckCircle2, title: "Install Verification", desc: "One-click check to confirm your chatbot is live on your website. No guessing — instant confirmation." },
              { icon: TrendingUp, title: "Never Misses a Lead", desc: "Captures visitor details, handles enquiries at 3am, and keeps your business open around the clock." },
            ].map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-5">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <Icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-muted/20 border-y border-border/30">
        <div className="max-w-4xl mx-auto text-center">
          <Badge className="mb-3 bg-primary/10 text-primary border-primary/20">How It Works</Badge>
          <h2 className="text-3xl font-bold mb-12">Live in 3 steps</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "1", title: "Create Your Chatbot", desc: "Sign up, give your chatbot a name and brand color, and paste in your knowledge base — FAQs, services, pricing, anything." },
              { step: "2", title: "Copy One Line of Code", desc: "We give you a single <script> tag. Paste it into your website's HTML — WordPress, Wix, custom code, anything works." },
              { step: "3", title: "Go Live Instantly", desc: "Your chatbot appears on your website and starts answering visitor questions 24/7 using only your approved content." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="relative">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground text-lg font-bold flex items-center justify-center mx-auto mb-4 shadow-lg">
                  {step}
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NEW: Vertical use cases (deep) */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <Badge className="mb-3 bg-primary/10 text-primary border-primary/20">Built for your industry</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">A chatbot tuned for what you actually do</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Pre-built starting points for the businesses we see most. Customise in minutes.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: ShoppingBag, title: "E-commerce", desc: "Answers product, shipping, return, sizing & payment questions. Captures abandoned-cart leads at 2am." },
              { icon: GraduationCap, title: "Schools & Universities", desc: "Handles admissions enquiries, fees, deadlines, course details — in 5+ local languages, 24/7." },
              { icon: Stethoscope, title: "Clinics & Hospitals", desc: "Answers FAQs, doctor availability, opening hours, and routes urgent cases to a human instantly." },
              { icon: Home, title: "Real Estate", desc: "Qualifies leads — budget, location, bedrooms — and books property viewings before your agent calls back." },
              { icon: Banknote, title: "SACCOs & Microfinance", desc: "Loan eligibility checks, balance enquiries, branch info, account-opening guidance — without queues." },
              { icon: Hotel, title: "Hotels & Travel", desc: "Booking enquiries, rates, amenities, directions, check-in times — answered in the guest's language." },
              { icon: Landmark, title: "Government Portals", desc: "Citizen FAQs about services, fees, documents needed, office locations — without expanding headcount." },
              { icon: Building2, title: "Professional Services", desc: "Answers client questions about your services, pricing tiers, availability, and books discovery calls." },
              { icon: MessageSquare, title: "WhatsApp-first SMBs", desc: "Replace the staff member you pay to reply to messages. Coming soon: native WhatsApp routing." },
            ].map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-5">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <Icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* NEW: ROI calculator */}
      <RoiCalculator />

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <Badge className="mb-3 bg-primary/10 text-primary border-primary/20">Pricing</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Simple, flat monthly pricing</h2>
            <p className="text-muted-foreground">No per-conversation charges. No surprise bills. Pay once, use all month.</p>
            {/* Billing toggle */}
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setBillingAnnual(false)}
                className={`text-sm font-medium transition-colors ${!billingAnnual ? "text-foreground" : "text-muted-foreground"}`}
                data-testid="toggle-monthly"
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingAnnual(!billingAnnual)}
                className={`relative w-11 h-6 rounded-full transition-colors ${billingAnnual ? "bg-primary" : "bg-muted"}`}
                data-testid="toggle-billing"
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${billingAnnual ? "translate-x-5" : ""}`} />
              </button>
              <button
                onClick={() => setBillingAnnual(true)}
                className={`text-sm font-medium transition-colors ${billingAnnual ? "text-foreground" : "text-muted-foreground"}`}
                data-testid="toggle-annual"
              >
                Annual <span className="text-green-500 text-xs font-bold ml-1">Save 20%</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-start">
            {PLANS.map((plan) => (
              <Card
                key={plan.name}
                className={`border-2 ${plan.color} relative overflow-hidden ${plan.badge === "Most Popular" ? "shadow-lg shadow-primary/10" : ""}`}
              >
                {plan.badge && (
                  <div className={`absolute top-0 right-0 text-[10px] font-bold px-3 py-1 rounded-bl-lg ${
                    plan.badge === "Most Popular" ? "bg-primary text-primary-foreground" : "bg-amber-500 text-white"
                  }`}>
                    {plan.badge}
                  </div>
                )}
                <CardContent className="p-6">
                  <p className="font-bold text-lg mb-1">{plan.name}</p>
                  <p className="text-xs text-muted-foreground mb-4">{plan.desc}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-extrabold">${price(plan.price)}</span>
                    <span className="text-muted-foreground text-sm">/month</span>
                    {billingAnnual && (
                      <p className="text-xs text-green-500 mt-0.5">Billed annually · save ${(plan.price - price(plan.price)) * 12}/yr</p>
                    )}
                  </div>
                  <Button
                    className={`w-full mb-6 ${plan.ctaVariant === "default" ? "bg-primary text-primary-foreground" : ""}`}
                    variant={plan.ctaVariant}
                    onClick={() => navigate(`/chatbot-checkout?plan=${plan.name.toLowerCase()}&billing=${billingAnnual ? "annual" : "monthly"}`)}
                    data-testid={`button-plan-${plan.name.toLowerCase()}`}
                  >
                    {plan.cta} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                  <div className="space-y-2">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-start gap-2 text-xs">
                        <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </div>
                    ))}
                    {plan.notIncluded.map((f) => (
                      <div key={f} className="flex items-start gap-2 text-xs text-muted-foreground/60">
                        <X className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8">
            All plans include a <span className="text-foreground font-medium">14-day free trial</span> · No credit card required · Cancel anytime ·
            Payments via M-Pesa, Airtel Money, Visa, Mastercard, bank transfer
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section id="compare" className="py-20 px-4 bg-muted/20 border-y border-border/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <Badge className="mb-3 bg-primary/10 text-primary border-primary/20">Comparison</Badge>
            <h2 className="text-3xl font-bold mb-3">How we compare to the alternatives</h2>
            <p className="text-muted-foreground">Same AI quality as Western platforms — half the price, built for Africa</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left p-4 font-semibold">Platform</th>
                  <th className="text-left p-4 font-semibold">Monthly Price</th>
                  <th className="text-center p-4 font-semibold">Per-reply charges?</th>
                  <th className="text-left p-4 font-semibold">White-label</th>
                </tr>
              </thead>
              <tbody>
                {COMPETITORS.map((c, i) => (
                  <tr
                    key={c.name}
                    className={`border-b border-border/30 last:border-0 ${c.afroAi ? "bg-primary/5" : ""}`}
                  >
                    <td className="p-4 font-medium">
                      {c.afroAi ? (
                        <span className="flex items-center gap-2">
                          <Star className="w-4 h-4 text-primary fill-primary" />
                          {c.name}
                          <Badge className="text-[9px] bg-primary/20 text-primary border-primary/20 px-1.5 py-0">YOU</Badge>
                        </span>
                      ) : c.name}
                    </td>
                    <td className={`p-4 ${c.afroAi ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      {c.price}
                    </td>
                    <td className="p-4 text-center">
                      {c.perConvo
                        ? <X className="w-4 h-4 text-red-500 mx-auto" />
                        : <Check className="w-4 h-4 text-green-500 mx-auto" />}
                    </td>
                    <td className={`p-4 ${c.afroAi ? "text-green-500 font-medium" : "text-muted-foreground"}`}>
                      {typeof c.whiteLabel === "boolean"
                        ? (c.whiteLabel ? "Included" : "Not available")
                        : c.whiteLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            ✓ = No per-reply charges · Prices sourced from official competitor pricing pages, March 2025
          </p>
        </div>
      </section>

      {/* Testimonial placeholder */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <Badge className="mb-3 bg-primary/10 text-primary border-primary/20">Reviews</Badge>
            <h2 className="text-3xl font-bold">What our customers say</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Amara Osei",
                role: "Digital Director, Ghana Tourism Board",
                quote: "We deployed the chatbot on our tourism portal in under an hour. It now handles 500+ visitor queries a month in English and French — without a single staff member.",
                stars: 5,
              },
              {
                name: "Fatuma Hassan",
                role: "Founder, Nairobi E-commerce Store",
                quote: "My customers used to wait hours for replies. Now the chatbot answers product questions instantly, even at 2am. Sales have genuinely gone up.",
                stars: 5,
              },
              {
                name: "Chidi Eze",
                role: "Agency Owner, Lagos",
                quote: "I resell chatbots to my clients using the Agency plan. The white-label feature means they see my brand, not Afro AI. It's become a real revenue stream.",
                stars: 5,
              },
            ].map(({ name, role, quote, stars }) => (
              <Card key={name} className="border-border/50">
                <CardContent className="p-5">
                  <div className="flex gap-0.5 mb-3">
                    {Array.from({ length: stars }).map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">"{quote}"</p>
                  <div>
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="text-xs text-muted-foreground">{role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4 bg-muted/20 border-y border-border/30">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <Badge className="mb-3 bg-primary/10 text-primary border-primary/20">FAQ</Badge>
            <h2 className="text-3xl font-bold">Frequently asked questions</h2>
          </div>
          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <div key={i} className="border border-border/50 rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  data-testid={`faq-toggle-${i}`}
                >
                  <span className="font-medium text-sm">{faq.q}</span>
                  {openFaq === i
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border/30 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-amber-500/5 to-primary/10 rounded-3xl pointer-events-none" />
            <div className="relative border border-primary/20 rounded-3xl p-12">
              <Bot className="w-12 h-12 text-primary mx-auto mb-4" />
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to put AI to work<br />on your website?
              </h2>
              <p className="text-muted-foreground mb-8">
                Start your 14-day free trial today. No credit card. No setup fees.<br />
                Live in under 60 seconds.
              </p>
              <Button
                size="lg"
                onClick={() => navigate("/chatbot-checkout?plan=starter")}
                className="bg-primary text-primary-foreground gap-2 text-base px-10"
                data-testid="button-final-cta"
              >
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                Accepts M-Pesa · Airtel Money · Visa · Mastercard · Bank Transfer
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* NEW: Final guarantee strip */}
      <section className="py-6 px-4 bg-muted/20 border-y border-border/30">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { icon: Shield, label: "Your data stays yours", desc: "Encrypted. Never used to train models." },
            { icon: CheckCircle2, label: "Cancel anytime", desc: "No contracts, no lock-in." },
            { icon: Zap, label: "60-second install", desc: "One line of code, any website." },
            { icon: Globe, label: "Pay how Africa pays", desc: "M-Pesa · MoMo · Airtel · Card" },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <Icon className="w-5 h-5 text-primary" />
              <p className="text-xs font-semibold">{label}</p>
              <p className="text-[10px] text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live demo chat widget — visitors can talk to a working bot before signing up */}
      <LiveDemoChat />

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© 2025 Afro AI · KEYO TECHNOLOGIES · Reg. No. 80030812159711 · Uganda</p>
          <div className="flex gap-4">
            <Link href="/privacy"><span className="hover:text-foreground cursor-pointer transition-colors">Privacy</span></Link>
            <Link href="/terms"><span className="hover:text-foreground cursor-pointer transition-colors">Terms</span></Link>
            <Link href="/contact"><span className="hover:text-foreground cursor-pointer transition-colors">Contact</span></Link>
            <Link href="/"><span className="hover:text-foreground cursor-pointer transition-colors">Back to Platform</span></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
