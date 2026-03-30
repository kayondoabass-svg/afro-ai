import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import afroLogo from "@assets/IMG_5719_1771852498362.png";
import {
  Smartphone, Zap, Globe, Code2, Check, ChevronDown, ChevronUp,
  MessageSquare, Building, GraduationCap, Stethoscope, Landmark,
  ShoppingCart, ArrowRight, Star, Users, TrendingUp, Shield, X,
  PhoneCall, Wifi, BarChart3, Cpu
} from "lucide-react";

const USSD_PLANS = [
  {
    id: "ussd-starter",
    name: "Starter",
    usd: 29,
    description: "Perfect for NGOs, schools, and small businesses",
    color: "from-blue-500 to-blue-600",
    features: [
      "1 USSD application",
      "5,000 sessions / month",
      "AI-powered menu builder",
      "Basic analytics dashboard",
      "Africa's Talking integration guide",
      "Email support",
    ],
  },
  {
    id: "ussd-growth",
    name: "Growth",
    usd: 79,
    description: "For growing enterprises and government agencies",
    color: "from-amber-500 to-orange-500",
    popular: true,
    features: [
      "5 USSD applications",
      "50,000 sessions / month",
      "AI intent detection (natural language)",
      "Multi-language: Luganda, Swahili, Hausa",
      "SMS auto-response integration",
      "Africa's Talking + Pegasus / Yo! Uganda",
      "Priority support",
      "Session savings analytics",
    ],
  },
  {
    id: "ussd-enterprise",
    name: "Enterprise",
    usd: 199,
    description: "For banks, telecoms, and large-scale deployments",
    color: "from-purple-500 to-purple-700",
    features: [
      "Unlimited USSD applications",
      "Unlimited sessions",
      "Full AI intent + NLP engine",
      "White-label option",
      "Custom shortcode setup assistance",
      "All African languages supported",
      "Dedicated account manager",
      "SLA guarantee",
      "API & webhook integrations",
    ],
  },
];

const REGIONAL_PRICES: Record<string, { label: string; symbol: string; rate: number; flag: string; countries: string[] }> = {
  east: { label: "East Africa", symbol: "UGX", rate: 3800, flag: "🇺🇬🇰🇪🇹🇿", countries: ["Uganda", "Kenya", "Tanzania", "Rwanda"] },
  west: { label: "West Africa", symbol: "NGN", rate: 1550, flag: "🇳🇬🇬🇭", countries: ["Nigeria", "Ghana", "Senegal", "Côte d'Ivoire"] },
  north: { label: "North Africa", symbol: "EGP", rate: 48, flag: "🇪🇬🇲🇦🇹🇳", countries: ["Egypt", "Morocco", "Tunisia", "Algeria"] },
  south: { label: "South Africa", symbol: "ZAR", rate: 18.5, flag: "🇿🇦🇿🇲🇿🇼", countries: ["South Africa", "Zambia", "Zimbabwe"] },
  central: { label: "Central Africa", symbol: "FCFA", rate: 610, flag: "🇨🇲🇨🇬🇬🇦", countries: ["Cameroon", "Congo", "Gabon", "DRC"] },
};

const FAQS = [
  {
    q: "What is a USSD application?",
    a: "USSD (Unstructured Supplementary Service Data) lets users interact with services by dialing a shortcode like *123# on any mobile phone — no smartphone, no internet, no app download needed. It works on every phone in Africa.",
  },
  {
    q: "How do I get a shortcode for my USSD app?",
    a: "After subscribing, we guide you step-by-step to apply for a shared or dedicated shortcode through Africa's Talking (regional) or Pegasus/Yo! Uganda (Uganda-specific). The setup guide is included in your dashboard.",
  },
  {
    q: "Do I need to know how to code?",
    a: "No. Our AI generates the complete Python/Flask USSD handler code from your description. You describe what you want — menus, languages, flows — and we produce production-ready code.",
  },
  {
    q: "Which countries and telecoms are supported?",
    a: "All 54 African countries via Africa's Talking (MTN, Airtel, Safaricom, Tigo, Vodacom, etc). In Uganda, we also support Yo! Uganda and Pegasus for deep MTN/Airtel Uganda integrations.",
  },
  {
    q: "Can the AI understand local African languages?",
    a: "Yes. The Growth and Enterprise plans include AI that understands Luganda, Acholi, Swahili, Hausa, Amharic, Yoruba, and Zulu. A user can type in their language and the AI routes them correctly.",
  },
  {
    q: "How does the session savings work?",
    a: "Traditional USSD menus often require 5-6 steps to complete a task. Our AI intent engine understands the user's goal in one sentence and jumps them straight to the right step — reducing session depth by ~50% and saving airtime costs.",
  },
  {
    q: "Can I white-label this for my clients?",
    a: "Yes, on the Enterprise plan. You can brand the USSD experience and the admin dashboard under your own company name — ideal for agencies and system integrators selling to banks or government.",
  },
];

function PricingModal({
  plan,
  onClose,
  localCurrency,
  countryCode,
}: {
  plan: (typeof USSD_PLANS)[0];
  onClose: () => void;
  localCurrency: { symbol: string; amount: number; code: string } | null;
  countryCode: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState((user as any)?.firstName || "");
  const [lastName, setLastName] = useState((user as any)?.lastName || "");

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ussd/subscribe", {
        plan: plan.id,
        countryCode,
        firstName,
        lastName,
        phoneNumber: phone,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    },
    onError: (error: any) => {
      toast({ title: "Payment Error", description: error.message || "Failed to initiate payment.", variant: "destructive" });
    },
  });

  const loginUrl = `/api/login?redirect=/ussd`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-md">
        <div className={`bg-gradient-to-r ${plan.color} rounded-t-2xl p-6 text-white`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm opacity-80">USSD Builder — {plan.name}</p>
              <p className="text-3xl font-bold mt-1">${plan.usd}<span className="text-lg font-normal">/mo</span></p>
              {localCurrency && (
                <p className="text-sm opacity-90 mt-0.5">{localCurrency.code} {localCurrency.amount.toLocaleString()}/mo</p>
              )}
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white" data-testid="button-close-modal"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {!user ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">Sign in to subscribe to the USSD Builder</p>
              <a href={loginUrl}>
                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="button-sign-in-ussd">
                  Sign In with Google
                </Button>
              </a>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">First Name</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" data-testid="input-first-name" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Last Name</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" data-testid="input-last-name" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Phone Number (optional)</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256 7XX XXX XXX" data-testid="input-phone" />
              </div>
              <Button
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                onClick={() => subscribeMutation.mutate()}
                disabled={subscribeMutation.isPending}
                data-testid="button-pay-ussd"
              >
                {subscribeMutation.isPending ? "Redirecting to Pesapal..." : `Pay with Mobile Money / Card`}
              </Button>
              <p className="text-xs text-center text-muted-foreground">Secured by Pesapal · Mobile Money, Visa, Mastercard accepted</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UssdBuilderPage() {
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const paymentResult = params.get("payment");

  const [activeRegion, setActiveRegion] = useState("east");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<(typeof USSD_PLANS)[0] | null>(null);
  const [countryCode, setCountryCode] = useState("UG");
  const [detectedCurrency, setDetectedCurrency] = useState<{ code: string; symbol: string; rate: number } | null>(null);

  const [calcUsers, setCalcUsers] = useState(2000);
  const [calcSessions, setCalcSessions] = useState(4);

  const loginUrl = "/api/login?redirect=/ussd";

  useEffect(() => {
    if (paymentResult === "success") {
      toast({ title: "Payment Successful!", description: "Your USSD Builder subscription is now active. Welcome aboard!" });
    }
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((data) => {
        if (data.country_code) setCountryCode(data.country_code);
        const regionMap: Record<string, string> = { UG: "east", KE: "east", TZ: "east", RW: "east", NG: "west", GH: "west", SN: "west", EG: "north", MA: "north", ZA: "south", ZM: "south", CM: "central", CG: "central" };
        if (regionMap[data.country_code]) setActiveRegion(regionMap[data.country_code]);
        const currencyMap: Record<string, { code: string; symbol: string; rate: number }> = {
          UG: { code: "UGX", symbol: "USh", rate: 3800 }, KE: { code: "KES", symbol: "KSh", rate: 153 }, TZ: { code: "TZS", symbol: "TSh", rate: 2600 },
          NG: { code: "NGN", symbol: "₦", rate: 1550 }, GH: { code: "GHS", symbol: "GH₵", rate: 15 }, EG: { code: "EGP", symbol: "E£", rate: 48 },
          ZA: { code: "ZAR", symbol: "R", rate: 18.5 }, CM: { code: "XAF", symbol: "FCFA", rate: 610 }, RW: { code: "RWF", symbol: "RF", rate: 1300 },
        };
        if (currencyMap[data.country_code]) setDetectedCurrency(currencyMap[data.country_code]);
      })
      .catch(() => {});
  }, []);

  const region = REGIONAL_PRICES[activeRegion];

  const formatLocal = (usd: number) => {
    if (!detectedCurrency) return `$${usd}`;
    const local = Math.round(usd * detectedCurrency.rate);
    return `${detectedCurrency.symbol} ${local.toLocaleString()}`;
  };

  const localAmount = (usd: number) => detectedCurrency ? { code: detectedCurrency.code, symbol: detectedCurrency.symbol, amount: Math.round(usd * detectedCurrency.rate) } : null;

  const traditional = calcUsers * calcSessions * 45 + 500000;
  const afroAI = calcUsers * (calcSessions * 0.5) * 45 + 500000;
  const savings = traditional - afroAI;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── NAV ── */}
      <nav className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2" data-testid="link-nav-logo">
            <img src={afroLogo} alt="Afro AI" className="h-8 w-8 object-contain" />
            <span className="font-bold text-lg">Afro AI</span>
          </a>
          <div className="flex items-center gap-3">
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">Pricing</a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">How It Works</a>
            <a href={loginUrl}>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="button-nav-get-started">
                Get Started
              </Button>
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden py-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-background to-orange-500/5 pointer-events-none" />
        <div className="absolute top-20 right-10 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-5xl mx-auto text-center relative">
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 mb-4">
            🌍 Born in Africa · Built for Africa
          </Badge>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight mb-6 leading-tight">
            Build AI-Powered<br />
            <span className="text-amber-400">USSD Apps</span> for Africa
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Create intelligent USSD menus that understand natural language — in Luganda, Swahili, Hausa, and more. Powered by Gemini AI. Deploy on Africa's Talking, Pegasus, or Yo! Uganda.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            <a href="#pricing">
              <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-base px-8" data-testid="button-hero-get-started">
                Start Building <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </a>
            <a href="#how-it-works">
              <Button size="lg" variant="outline" className="text-base px-8" data-testid="button-hero-learn-more">
                See How It Works
              </Button>
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { label: "USSD Market Size", value: "$9.91B", icon: TrendingUp },
              { label: "Active USSD Users (Uganda)", value: "20M+", icon: Users },
              { label: "Still Use USSD in Africa", value: "70%", icon: Smartphone },
              { label: "Session Cost Saved", value: "~50%", icon: Zap },
            ].map((stat) => (
              <div key={stat.label} className="bg-muted/50 rounded-xl p-4 border">
                <stat.icon className="w-5 h-5 text-amber-400 mb-2 mx-auto" />
                <div className="text-2xl font-bold text-amber-400">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY USSD ── */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Why USSD Still Rules Africa</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">While apps require smartphones and data, USSD works on every phone — from Kampala to a village in Karamoja.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { icon: PhoneCall, title: "Works on Any Phone", desc: "No smartphone. No internet. No data bundle. Just dial *123# and interact. Perfect for rural Africa where feature phones dominate." },
              { icon: Wifi, title: "Zero Data Required", desc: "USSD runs over the telecom network directly. Users don't need WiFi or mobile data, making it truly inclusive for all income levels." },
              { icon: Users, title: "Reaches Everyone", desc: "15–20 million active mobile money users in Uganda alone. Across Africa: over 500 million USSD users — your largest potential market." },
            ].map((item) => (
              <div key={item.title} className="bg-background border rounded-xl p-6">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center mb-4">
                  <item.icon className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">How It Works</h2>
            <p className="text-muted-foreground">From idea to deployed USSD app in under 30 minutes</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { step: "01", icon: MessageSquare, title: "Describe Your App", desc: "Tell the AI what your USSD app should do. 'I want a buyer/seller marketplace with electronics and food categories in Luganda.'" },
              { step: "02", icon: Cpu, title: "AI Builds the Code", desc: "Afro AI generates a complete Python/Flask USSD handler with menus, AI intent detection, and multi-language support — ready to deploy." },
              { step: "03", icon: Smartphone, title: "Deploy & Go Live", desc: "Upload to Africa's Talking, Yo! Uganda, or Pegasus. Your users dial your shortcode and your AI-powered USSD experience is live." },
            ].map((step, i) => (
              <div key={step.step} className="relative text-center">
                {i < 2 && <div className="hidden sm:block absolute top-10 left-full w-full h-0.5 bg-gradient-to-r from-amber-500/50 to-transparent -translate-x-1/2 z-0" />}
                <div className="relative z-10 w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/25">
                  <step.icon className="w-8 h-8 text-black" />
                </div>
                <div className="text-xs font-bold text-amber-400 mb-2">STEP {step.step}</div>
                <h3 className="font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>

          {/* Architecture diagram */}
          <div className="mt-14 bg-muted/50 border rounded-2xl p-6 font-mono text-sm">
            <p className="text-amber-400 font-bold mb-4 font-sans text-base">AI-on-USSD Architecture (Smart Proxy)</p>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs sm:text-sm">
              <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded">User dials *123#</span>
              <span>→</span>
              <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded">Telecom (MTN/Airtel)</span>
              <span>→</span>
              <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded">Africa's Talking / Pegasus</span>
              <span>→</span>
              <span className="bg-amber-500/20 text-amber-400 px-2 py-1 rounded">Your Flask Server on Afro AI</span>
              <span>→</span>
              <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded">Gemini AI (Intent Engine)</span>
              <span>→</span>
              <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded">Smart Menu Response</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── USE CASES ── */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">What You Can Build & Sell</h2>
            <p className="text-muted-foreground">Real products for the African market — each a standalone revenue stream</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: ShoppingCart, color: "text-blue-400", bg: "bg-blue-500/10", title: "B2B Trade Platform", desc: "Buyers find suppliers. Sellers list products. All via USSD. Target: commodity traders, construction companies, agribusiness." },
              { icon: GraduationCap, color: "text-green-400", bg: "bg-green-500/10", title: "School Results & AI Teacher", desc: "Parents dial to get student results, AI-generated lesson plans, and daily quizzes via SMS. Target: primary and secondary schools." },
              { icon: Landmark, color: "text-amber-400", bg: "bg-amber-500/10", title: "URA Tax Assistant", desc: "Citizens ask tax questions in Luganda or English. AI explains URA forms and directs them correctly. Target: URA, Ministry of Finance." },
              { icon: Stethoscope, color: "text-red-400", bg: "bg-red-500/10", title: "Health Clinic Appointments", desc: "Patients book clinic appointments, receive reminders, get dosage info via USSD. No smartphone required. Target: clinics and hospitals." },
              { icon: Building, color: "text-purple-400", bg: "bg-purple-500/10", title: "Bank & MFI Services", desc: "Balance checks, mini-statements, loan applications — all USSD-powered with AI for natural language queries. Target: banks and MFIs." },
              { icon: Globe, color: "text-cyan-400", bg: "bg-cyan-500/10", title: "Government USSD Super App", desc: "One shortcode for multiple government services: NIRA, KCCA, URA, voter registration. Target: government ministries and agencies." },
            ].map((item) => (
              <div key={item.title} className="bg-background border rounded-xl p-5 hover:border-amber-500/50 transition-colors">
                <div className={`w-10 h-10 rounded-lg ${item.bg} flex items-center justify-center mb-3`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SAVINGS CALCULATOR ── */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">USSD Savings Calculator</h2>
            <p className="text-muted-foreground">See how much your clients save with AI-optimised sessions (Uganda market, 2026 rates)</p>
          </div>
          <div className="bg-muted/50 border rounded-2xl p-6 sm:p-8">
            <div className="grid sm:grid-cols-2 gap-8 mb-8">
              <div>
                <Label className="text-sm font-medium mb-3 block">Number of Users: <span className="text-amber-400 font-bold">{calcUsers.toLocaleString()}</span></Label>
                <Slider min={100} max={50000} step={100} value={[calcUsers]} onValueChange={([v]) => setCalcUsers(v)} className="mb-2" data-testid="slider-calc-users" />
                <div className="flex justify-between text-xs text-muted-foreground"><span>100</span><span>50,000</span></div>
              </div>
              <div>
                <Label className="text-sm font-medium mb-3 block">Sessions per User/Month: <span className="text-amber-400 font-bold">{calcSessions}</span></Label>
                <Slider min={1} max={20} step={1} value={[calcSessions]} onValueChange={([v]) => setCalcSessions(v)} className="mb-2" data-testid="slider-calc-sessions" />
                <div className="flex justify-between text-xs text-muted-foreground"><span>1</span><span>20</span></div>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Traditional Cost/Month</p>
                <p className="text-xl font-bold text-red-400" data-testid="text-traditional-cost">UGX {traditional.toLocaleString()}</p>
              </div>
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">With Afro AI/Month</p>
                <p className="text-xl font-bold text-green-400" data-testid="text-afroai-cost">UGX {afroAI.toLocaleString()}</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Yearly Savings</p>
                <p className="text-xl font-bold text-amber-400" data-testid="text-yearly-savings">UGX {(savings * 12).toLocaleString()}</p>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground">Based on UGX 45/session cost · UGX 500,000/mo aggregator fee · 50% AI session reduction</p>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-16 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">African Market Pricing</h2>
            <p className="text-muted-foreground">Pay in your local currency · Mobile Money, Visa, Mastercard accepted</p>
            {detectedCurrency && (
              <Badge className="mt-3 bg-green-500/20 text-green-400 border-green-500/30">
                ✓ Showing prices in {detectedCurrency.code} for your region
              </Badge>
            )}
          </div>

          {/* Region tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {Object.entries(REGIONAL_PRICES).map(([key, r]) => (
              <button
                key={key}
                onClick={() => setActiveRegion(key)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${activeRegion === key ? "bg-amber-500 text-black border-amber-500" : "border-border text-muted-foreground hover:border-amber-500/50"}`}
                data-testid={`button-region-${key}`}
              >
                {r.flag} {r.label}
              </button>
            ))}
          </div>
          <div className="text-center mb-6 text-sm text-muted-foreground">
            {region.flag} {region.label} — {region.countries.join(", ")}
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {USSD_PLANS.map((plan) => {
              const local = localAmount(plan.usd);
              const regionLocal = Math.round(plan.usd * region.rate);
              return (
                <div key={plan.id} className={`relative bg-background border rounded-2xl p-6 flex flex-col ${plan.popular ? "border-amber-500 shadow-lg shadow-amber-500/10" : "border-border"}`} data-testid={`card-ussd-plan-${plan.id}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-amber-500 text-black font-bold px-3">Most Popular</Badge>
                    </div>
                  )}
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-4`}>
                    <Smartphone className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mb-4">{plan.description}</p>
                  <div className="mb-1">
                    <span className="text-3xl font-black">${plan.usd}</span>
                    <span className="text-muted-foreground text-sm">/month</span>
                  </div>
                  {detectedCurrency ? (
                    <p className="text-sm text-amber-400 font-medium mb-2">{detectedCurrency.symbol} {(Math.round(plan.usd * detectedCurrency.rate)).toLocaleString()}/mo</p>
                  ) : (
                    <p className="text-sm text-amber-400 font-medium mb-2">{region.symbol} {regionLocal.toLocaleString()}/mo</p>
                  )}
                  <div className="flex-1 space-y-2 my-4">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    className={`w-full font-semibold mt-4 ${plan.popular ? "bg-amber-500 hover:bg-amber-600 text-black" : ""}`}
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => setSelectedPlan(plan)}
                    data-testid={`button-select-plan-${plan.id}`}
                  >
                    Get {plan.name} Plan
                  </Button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            All plans include: Code generation, deployment guide, and access to Afro AI Builder dashboard. Cancel anytime.
          </p>
        </div>
      </section>

      {/* ── TESTIMONIALS / SOCIAL PROOF ── */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">Why Businesses Choose Afro AI USSD</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { icon: Zap, title: "50% Fewer Sessions", desc: "AI intent matching understands what the user wants in one sentence, skipping 3–4 menu steps. That's real airtime savings for your users." },
              { icon: Globe, title: "All 54 African Countries", desc: "Deploy on Africa's Talking for continent-wide coverage, or Yo! Uganda / Pegasus for Uganda-specific deep integrations with MTN and Airtel." },
              { icon: Shield, title: "Production-Ready Code", desc: "The AI generates clean, tested Python/Flask code following USSD industry standards — not prototypes. Ready to upload to your gateway immediately." },
              { icon: MessageSquare, title: "Local Language Support", desc: "A farmer in Karamoja types in Acholi. A market vendor in Lagos types in Yoruba. Your USSD app understands them both." },
              { icon: BarChart3, title: "Session Analytics", desc: "Track how users navigate your menus, where they drop off, and which intents are most common — so you can continuously improve." },
              { icon: Star, title: "Born in Africa", desc: "Built by Africans for African market realities — variable networks, multi-language users, mobile money-first economies, and SME budgets." },
            ].map((item) => (
              <div key={item.title} className="border rounded-xl p-5 bg-background">
                <item.icon className="w-6 h-6 text-amber-400 mb-3" />
                <h3 className="font-semibold text-sm mb-2">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border rounded-xl bg-background overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-5 text-left font-medium text-sm"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  data-testid={`button-faq-${i}`}
                >
                  {faq.q}
                  {openFaq === i ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-background border border-amber-500/30 rounded-3xl p-10">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Ready to Build for Africa?</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Join the USSD revolution. Build AI-powered apps that reach every African — smartphone or not.
              The Africa We Want starts with accessible technology.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a href="#pricing">
                <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-base px-10" data-testid="button-cta-start">
                  Start Building — From $29/mo
                </Button>
              </a>
            </div>
            <p className="text-xs text-muted-foreground mt-4">Mobile Money · Visa · Mastercard · Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t py-12 px-4 bg-muted/20">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-8">
            <div className="col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <img src={afroLogo} alt="Afro AI" className="h-8 w-8 object-contain" />
                <span className="font-bold">Afro AI</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">Built for Africa, by Africans.<br />The Africa We Want.</p>
              <p className="text-xs text-muted-foreground mt-2">KEYO TECHNOLOGIES<br />Reg. No. 80030812159711</p>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Product</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <a href="/api/login" className="block hover:text-primary transition-colors">AI Website Builder</a>
                <a href="/ussd" className="block hover:text-primary transition-colors font-medium text-amber-400">USSD Builder</a>
                <a href="/chatbot-api" className="block hover:text-primary transition-colors">Chatbot API</a>
                <a href="/templates" className="block hover:text-primary transition-colors">Templates</a>
                <a href="/domains" className="block hover:text-primary transition-colors">Domain Store</a>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Company</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <a href="/about" className="block hover:text-primary transition-colors">About Us</a>
                <a href="/blog" className="block hover:text-primary transition-colors">Blog</a>
                <a href="mailto:support@afroaigroup.com" className="block hover:text-primary transition-colors">Support</a>
                <a href="/pricing" className="block hover:text-primary transition-colors">Pricing</a>
                <a href="/affiliate" className="block hover:text-primary transition-colors">Affiliate Program</a>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Legal</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <a href="/privacy" className="block hover:text-primary transition-colors">Privacy Policy</a>
                <a href="/terms" className="block hover:text-primary transition-colors">Terms of Service</a>
                <a href="/refund-policy" className="block hover:text-primary transition-colors">Refund Policy</a>
              </div>
            </div>
          </div>
          <div className="border-t pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} KEYO TECHNOLOGIES. Afro AI USSD Builder — Built for Africa, by Africans.</p>
          </div>
        </div>
      </footer>

      {/* ── PRICING MODAL ── */}
      {selectedPlan && (
        <PricingModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          localCurrency={localAmount(selectedPlan.usd)}
          countryCode={countryCode}
        />
      )}
    </div>
  );
}
