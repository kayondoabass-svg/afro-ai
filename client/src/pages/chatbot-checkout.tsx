import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import {
  Check, Bot, ArrowRight, Lock, Shield, Loader2, Star,
  CreditCard, Phone, Globe, ChevronLeft,
} from "lucide-react";

const PLANS: Record<string, {
  name: string; price: number; annualPrice: number; repliesPerMonth: number;
  botsLimit: number; features: string[]; badge: string | null; color: string;
}> = {
  starter: {
    name: "Starter", price: 19, annualPrice: 15, repliesPerMonth: 1000, botsLimit: 1, badge: null,
    color: "text-blue-400",
    features: ["1 AI chatbot", "1,000 AI replies/month", "Custom knowledge base", "Brand color & greeting", "1-line embed code", "14-day free trial"],
  },
  business: {
    name: "Business", price: 49, annualPrice: 39, repliesPerMonth: 5000, botsLimit: 5, badge: "Most Popular",
    color: "text-primary",
    features: ["5 AI chatbots", "5,000 AI replies/month", "Custom knowledge base per bot", "White-label (no Afro AI branding)", "Install verification tool", "Priority support"],
  },
  agency: {
    name: "Agency", price: 99, annualPrice: 79, repliesPerMonth: 20000, botsLimit: -1, badge: "Best Value",
    color: "text-amber-400",
    features: ["Unlimited AI chatbots", "20,000 AI replies/month", "Full white-label", "API access", "Dedicated account manager", "Phone & email support"],
  },
};

const COUNTRIES = [
  { code: "UG", name: "Uganda" }, { code: "KE", name: "Kenya" }, { code: "TZ", name: "Tanzania" },
  { code: "RW", name: "Rwanda" }, { code: "NG", name: "Nigeria" }, { code: "GH", name: "Ghana" },
  { code: "ZA", name: "South Africa" }, { code: "EG", name: "Egypt" }, { code: "ET", name: "Ethiopia" },
  { code: "CI", name: "Côte d'Ivoire" }, { code: "SN", name: "Senegal" }, { code: "CM", name: "Cameroon" },
  { code: "GB", name: "United Kingdom" }, { code: "US", name: "United States" }, { code: "FR", name: "France" },
  { code: "DE", name: "Germany" }, { code: "ZM", name: "Zambia" }, { code: "MW", name: "Malawi" },
  { code: "MZ", name: "Mozambique" }, { code: "BW", name: "Botswana" },
];

export default function ChatbotCheckoutPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const planKey = (params.get("plan") || "starter").replace("chatbot-", "");
  const billing = params.get("billing") || "monthly";

  const plan = PLANS[planKey] || PLANS.starter;
  const price = billing === "annual" ? plan.annualPrice : plan.price;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [paying, setPaying] = useState(false);

  // If not logged in, save plan to localStorage and redirect to login
  useEffect(() => {
    if (!authLoading && !user) {
      localStorage.setItem("chatbot_checkout_plan", planKey);
      localStorage.setItem("chatbot_checkout_billing", billing);
      navigate("/login");
    }
  }, [user, authLoading]);

  // After login, restore plan from localStorage and clear it
  useEffect(() => {
    if (user) {
      const savedPlan = localStorage.getItem("chatbot_checkout_plan");
      if (savedPlan) {
        localStorage.removeItem("chatbot_checkout_plan");
        localStorage.removeItem("chatbot_checkout_billing");
      }
    }
  }, [user]);

  const handlePay = async () => {
    if (!firstName.trim() || !country) {
      toast({ title: "Missing details", description: "Please enter your name and select your country.", variant: "destructive" });
      return;
    }
    setPaying(true);
    try {
      const res = await apiRequest("POST", "/api/subscribe", {
        plan: `chatbot-${planKey}`,
        countryCode: country || undefined,
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phoneNumber: phone.trim() || undefined,
      });
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        throw new Error("No payment URL received");
      }
    } catch (err: any) {
      toast({ title: "Payment failed", description: err.message || "Could not initiate payment. Please try again.", variant: "destructive" });
      setPaying(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/chatbot-api">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-to-pricing">
              <ChevronLeft className="w-4 h-4" /> Back to Pricing
            </button>
          </Link>
          <span className="font-bold text-primary text-sm">Afro AI Chatbot</span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3 h-3" /> Secure checkout
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid md:grid-cols-5 gap-8 items-start">

          {/* Left: Order summary */}
          <div className="md:col-span-2 space-y-4">
            <div>
              <h2 className="text-lg font-bold mb-1">Order Summary</h2>
              <p className="text-xs text-muted-foreground">Review your plan before paying</p>
            </div>

            <Card className={`border-2 ${planKey === "business" ? "border-primary" : planKey === "agency" ? "border-amber-500/40" : "border-border"}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-primary" />
                      <span className="font-bold">{plan.name} Plan</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Afro AI Chatbot</p>
                  </div>
                  {plan.badge && (
                    <Badge className={`text-[9px] ${planKey === "agency" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-primary/20 text-primary border-primary/30"}`}>
                      {plan.badge}
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5 mb-4">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-start gap-2 text-xs">
                      <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{f}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border/40 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {billing === "annual" ? "Annual billing" : "Monthly billing"}
                    </span>
                    <div className="text-right">
                      <span className="text-2xl font-extrabold">${price}</span>
                      <span className="text-muted-foreground text-xs">/mo</span>
                    </div>
                  </div>
                  {billing === "annual" && (
                    <p className="text-xs text-green-500 mt-0.5 text-right">
                      Save ${(plan.price - plan.annualPrice) * 12}/year vs monthly
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Trust signals */}
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-green-500 flex-shrink-0" /> 14-day free trial included</div>
              <div className="flex items-center gap-2"><CreditCard className="w-3.5 h-3.5 text-primary flex-shrink-0" /> M-Pesa · Airtel · Visa · Mastercard · Bank transfer</div>
              <div className="flex items-center gap-2"><Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" /> Cancel anytime — no long-term commitment</div>
            </div>

            <div className="flex gap-2">
              {["starter", "business", "agency"].filter(k => k !== planKey).map(k => (
                <button
                  key={k}
                  onClick={() => navigate(`/chatbot-checkout?plan=${k}&billing=${billing}`)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors underline"
                  data-testid={`link-switch-plan-${k}`}
                >
                  Switch to {PLANS[k].name} (${PLANS[k].price}/mo)
                </button>
              ))}
            </div>
          </div>

          {/* Right: Billing form */}
          <div className="md:col-span-3 space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Complete your order</h1>
              <p className="text-sm text-muted-foreground mt-1">You'll be redirected to Pesapal to complete payment securely</p>
            </div>

            <Card>
              <CardContent className="p-6 space-y-4">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" /> Billing Details
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="firstName" className="text-xs mb-1 block">First Name *</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="John"
                      className="h-9 text-sm"
                      data-testid="input-first-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName" className="text-xs mb-1 block">Last Name</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="h-9 text-sm"
                      data-testid="input-last-name"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Country *</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger className="h-9 text-sm" data-testid="select-country">
                      <SelectValue placeholder="Select your country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(c => (
                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="phone" className="text-xs mb-1 block flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Phone (optional — for M-Pesa/Airtel)
                  </Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+256 700 000 000"
                    className="h-9 text-sm"
                    data-testid="input-phone"
                  />
                </div>

                <div className="pt-2 border-t border-border/40 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-medium">Afro AI Chatbot {plan.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Billing</span>
                    <span className="font-medium capitalize">{billing}</span>
                  </div>
                  <div className="flex items-center justify-between font-bold">
                    <span>Total due today</span>
                    <span className="text-lg">${price}/mo</span>
                  </div>
                </div>

                <Button
                  className="w-full bg-primary text-primary-foreground gap-2 h-11 text-base"
                  onClick={handlePay}
                  disabled={paying}
                  data-testid="button-pay-pesapal"
                >
                  {paying
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to Pesapal…</>
                    : <><CreditCard className="w-4 h-4" /> Pay ${price} with Pesapal <ArrowRight className="w-4 h-4" /></>}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  By continuing, you agree to our{" "}
                  <Link href="/terms"><span className="underline cursor-pointer">Terms of Service</span></Link>{" "}
                  and{" "}
                  <Link href="/privacy"><span className="underline cursor-pointer">Privacy Policy</span></Link>.
                  Payments are processed by Pesapal.
                </p>
              </CardContent>
            </Card>

            {/* Payment methods */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">Accepted payment methods</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {["M-Pesa", "Airtel Money", "MTN MoMo", "Visa", "Mastercard", "Bank Transfer"].map(m => (
                  <span key={m} className="text-xs border border-border/50 rounded-md px-2.5 py-1 bg-muted/30">{m}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
