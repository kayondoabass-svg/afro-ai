import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageSquare,
  Phone,
  Smartphone,
  Banknote,
  Globe,
  Check,
  ArrowRight,
  Building2,
  Sparkles,
  Mail,
} from "lucide-react";
import { Link } from "wouter";
import { africanCountries, formatLocalPrice, formatUsdPrice } from "@shared/currencies";

type Status = "live" | "setup" | "coming";

const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
  live: { label: "Live now", cls: "border-green-500/40 text-green-400" },
  setup: { label: "Setup required", cls: "border-yellow-500/40 text-yellow-400" },
  coming: { label: "Coming soon", cls: "border-blue-500/40 text-blue-400" },
};

function useCountryDetection() {
  const [country, setCountry] = useState<string>(() => localStorage.getItem("afro-ai-country") || "UG");
  const [loading, setLoading] = useState(!localStorage.getItem("afro-ai-country"));

  useEffect(() => {
    if (localStorage.getItem("afro-ai-country")) return;
    (async () => {
      try {
        const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          const code = data.country_code;
          if (code && africanCountries.find((c) => c.isoCode === code)) {
            setCountry(code);
            localStorage.setItem("afro-ai-country", code);
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const selectCountry = (isoCode: string) => {
    setCountry(isoCode);
    localStorage.setItem("afro-ai-country", isoCode);
  };

  return { country, loading, selectCountry };
}

function Price({ usd, country, suffix }: { usd: number; country: string; suffix?: string }) {
  const local = country ? formatLocalPrice(usd, country) : null;
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-3xl font-bold" data-testid={`price-${usd}`}>{local || formatUsdPrice(usd)}</span>
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      {local && <span className="text-xs text-muted-foreground ml-1">({formatUsdPrice(usd)})</span>}
    </div>
  );
}

function ContactBtn({ service, label = "Talk to sales", testId }: { service: string; label?: string; testId: string }) {
  return (
    <Link href={`/contact?service=${service}`} className="block" data-testid={testId}>
      <Button className="w-full">
        {label}
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </Link>
  );
}

function ServiceSection({
  id,
  icon: Icon,
  iconColor,
  title,
  status,
  tagline,
  children,
}: {
  id: string;
  icon: any;
  iconColor: string;
  title: string;
  status: Status;
  tagline: string;
  children: React.ReactNode;
}) {
  const badge = STATUS_BADGE[status];
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-full ${iconColor} flex items-center justify-center shrink-0`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold">{title}</h2>
            <Badge variant="outline" className={badge.cls}>{badge.label}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">{tagline}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function BusinessServicesPage() {
  const { country, loading, selectCountry } = useCountryDetection();

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-4">
          <Badge variant="outline" className="mx-auto">
            <Building2 className="w-3 h-3 mr-1" />
            For Businesses
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold font-serif" data-testid="text-page-title">
            African Telecom Services<br />Built for Your Business
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Send SMS, run USSD apps, message on WhatsApp, distribute airtime, and collect Mobile Money — all through one
            dashboard. Built on Africa's Talking infrastructure across 8 core countries.
          </p>
          <div className="flex justify-center pt-2">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <Select value={country} onValueChange={selectCountry}>
                <SelectTrigger className="w-[260px]" data-testid="select-country">
                  <SelectValue placeholder={loading ? "Detecting..." : "See pricing in your currency"} />
                </SelectTrigger>
                <SelectContent>
                  {africanCountries.map((c) => (
                    <SelectItem key={c.isoCode} value={c.isoCode} data-testid={`option-country-${c.isoCode}`}>
                      {c.name} ({c.currencyCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Quick nav */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            { id: "sms", label: "Bulk SMS", icon: MessageSquare },
            { id: "ussd", label: "USSD", icon: Phone },
            { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
            { id: "airtime", label: "Airtime", icon: Smartphone },
            { id: "momo", label: "Mobile Money", icon: Banknote },
          ].map((n) => (
            <a key={n.id} href={`#${n.id}`} data-testid={`nav-${n.id}`}>
              <Card className="hover-elevate">
                <CardContent className="p-3 flex items-center gap-2 text-sm">
                  <n.icon className="w-4 h-4 text-primary" />
                  <span className="font-medium">{n.label}</span>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>

        {/* 1. Bulk SMS */}
        <ServiceSection
          id="sms"
          icon={MessageSquare}
          iconColor="bg-primary/10 text-primary"
          title="Bulk SMS"
          status="live"
          tagline="Reach every customer with one click. Marketing campaigns, OTPs, reminders, alerts."
        >
          <div className="grid md:grid-cols-3 gap-6">
            {/* Pay-as-you-go */}
            <Card className="hover-elevate">
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Pay As You Go</h3>
                  <p className="text-xs text-muted-foreground mt-1">No commitment. Top up as needed.</p>
                </div>
                <Price usd={0.04} country={country} suffix="/SMS" />
                <div className="space-y-2 text-sm">
                  {["No monthly fee", "Send to all 8 core countries", "Delivery reports", "Sender ID setup help"].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-primary" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="sms-payg" testId="cta-sms-payg" label="Get started" />
              </CardContent>
            </Card>

            {/* Business pack */}
            <Card className="hover-elevate ring-2 ring-primary relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground">Most popular</Badge>
              </div>
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Business Pack</h3>
                  <p className="text-xs text-muted-foreground mt-1">For growing teams sending 5K–25K/month.</p>
                </div>
                <Price usd={67} country={country} suffix="for 5,000 SMS" />
                <div className="space-y-2 text-sm">
                  {[
                    "5,000 SMS bundle (~$0.013/SMS)",
                    "Branded sender ID included",
                    "Bulk upload (CSV)",
                    "Scheduled campaigns",
                    "Analytics dashboard",
                    "Email + WhatsApp support",
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-primary" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="sms-business" testId="cta-sms-business" />
              </CardContent>
            </Card>

            {/* Enterprise */}
            <Card className="hover-elevate">
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Enterprise</h3>
                  <p className="text-xs text-muted-foreground mt-1">100K+ SMS/month with SLA.</p>
                </div>
                <Price usd={540} country={country} suffix="from /month" />
                <div className="space-y-2 text-sm">
                  {[
                    "Volume discount (~$0.005/SMS)",
                    "Multi-country sender IDs",
                    "API + Zapier integration",
                    "Dedicated account manager",
                    "99.5% uptime SLA",
                    "Custom invoicing (UGX/KES/NGN)",
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-primary" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="sms-enterprise" testId="cta-sms-enterprise" label="Request quote" />
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Per-SMS rates vary by country and network. Final pricing confirmed on quote.
          </p>
        </ServiceSection>

        {/* 2. USSD Builder */}
        <ServiceSection
          id="ussd"
          icon={Phone}
          iconColor="bg-green-500/10 text-green-400"
          title="USSD Builder"
          status="live"
          tagline="Build *123#-style menus that work on every phone — no app, no internet. Perfect for SACCOs, microfinance and rural reach."
        >
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="hover-elevate">
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Starter</h3>
                  <p className="text-xs text-muted-foreground mt-1">For pilots and small communities.</p>
                </div>
                <Price usd={40} country={country} suffix="/month" />
                <div className="space-y-2 text-sm">
                  {["1 USSD shortcode", "5,000 sessions/month", "Drag-and-drop builder", "Basic analytics"].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-green-400" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="ussd-starter" testId="cta-ussd-starter" label="Get started" />
              </CardContent>
            </Card>

            <Card className="hover-elevate ring-2 ring-green-500 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-green-600 text-white">Most popular</Badge>
              </div>
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Growth</h3>
                  <p className="text-xs text-muted-foreground mt-1">For SACCOs and active service businesses.</p>
                </div>
                <Price usd={135} country={country} suffix="/month" />
                <div className="space-y-2 text-sm">
                  {[
                    "3 USSD shortcodes",
                    "25,000 sessions/month",
                    "Mobile money integration",
                    "Webhooks to your system",
                    "Multi-language menus",
                    "Email + WhatsApp support",
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-green-400" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="ussd-growth" testId="cta-ussd-growth" />
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Enterprise</h3>
                  <p className="text-xs text-muted-foreground mt-1">Banks, MNOs, government.</p>
                </div>
                <Price usd={540} country={country} suffix="from /month" />
                <div className="space-y-2 text-sm">
                  {[
                    "Unlimited shortcodes & sessions",
                    "Dedicated infrastructure",
                    "On-prem deployment option",
                    "99.9% uptime SLA",
                    "24/7 phone support",
                    "Custom contracts",
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-green-400" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="ussd-enterprise" testId="cta-ussd-enterprise" label="Request quote" />
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Shortcode rental fees apply per country (paid to telco operator). Setup typically 5–14 business days.
          </p>
        </ServiceSection>

        {/* 3. WhatsApp Business */}
        <ServiceSection
          id="whatsapp"
          icon={MessageSquare}
          iconColor="bg-emerald-500/10 text-emerald-400"
          title="WhatsApp Business"
          status="setup"
          tagline="Verified business account, AI chatbot, broadcast to opted-in customers. Where Africa actually talks."
        >
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="hover-elevate">
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Setup</h3>
                  <p className="text-xs text-muted-foreground mt-1">One-time onboarding.</p>
                </div>
                <Price usd={135} country={country} suffix="one-time" />
                <div className="space-y-2 text-sm">
                  {[
                    "WhatsApp Business verification",
                    "Green tick application",
                    "Number provisioning",
                    "Welcome message & menu setup",
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="whatsapp-setup" testId="cta-wa-setup" label="Start setup" />
              </CardContent>
            </Card>

            <Card className="hover-elevate ring-2 ring-emerald-500 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-emerald-600 text-white">Most popular</Badge>
              </div>
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Business</h3>
                  <p className="text-xs text-muted-foreground mt-1">Run sales + support on WhatsApp.</p>
                </div>
                <Price usd={110} country={country} suffix="/month" />
                <div className="space-y-2 text-sm">
                  {[
                    "Up to 10,000 conversations",
                    "AI chatbot trained on your docs",
                    "Broadcast to opted-in customers",
                    "Team inbox (3 agents)",
                    "Order & catalog support",
                    "Conversation analytics",
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="whatsapp-business" testId="cta-wa-business" />
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Scale</h3>
                  <p className="text-xs text-muted-foreground mt-1">High-volume conversational commerce.</p>
                </div>
                <Price usd={400} country={country} suffix="from /month" />
                <div className="space-y-2 text-sm">
                  {[
                    "Unlimited conversations",
                    "Unlimited agents",
                    "Multi-language AI bot",
                    "CRM + Hubspot/Zoho sync",
                    "Payment links in chat",
                    "Priority support",
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="whatsapp-scale" testId="cta-wa-scale" label="Request quote" />
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Per-conversation Meta fees billed at cost (~$0.005–0.08 depending on country and message type).
          </p>
        </ServiceSection>

        {/* 4. Airtime API */}
        <ServiceSection
          id="airtime"
          icon={Smartphone}
          iconColor="bg-yellow-500/10 text-yellow-400"
          title="Airtime Distribution API"
          status="setup"
          tagline="Send airtime as rewards, refunds, or worker payouts via API. Perfect for survey apps, gig platforms, marketing rewards."
        >
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="hover-elevate">
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Standard</h3>
                  <p className="text-xs text-muted-foreground mt-1">Pay per transaction. No monthly fee.</p>
                </div>
                <Price usd={0.05} country={country} suffix="+ 5% per send" />
                <div className="space-y-2 text-sm">
                  {[
                    "All major MNOs across 8 countries",
                    "REST API + dashboard",
                    "Bulk CSV upload",
                    "Real-time delivery status",
                    "Failed-delivery auto-refund",
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-yellow-400" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="airtime-standard" testId="cta-airtime-std" label="Get API access" />
              </CardContent>
            </Card>

            <Card className="hover-elevate ring-2 ring-yellow-500 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-yellow-500 text-black">Volume</Badge>
              </div>
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">High Volume</h3>
                  <p className="text-xs text-muted-foreground mt-1">$10K+ in airtime per month.</p>
                </div>
                <Price usd={0.03} country={country} suffix="+ 2.5% per send" />
                <div className="space-y-2 text-sm">
                  {[
                    "Discounted commission",
                    "Bulk send (10,000+/batch)",
                    "Webhook notifications",
                    "Settlement in your currency",
                    "Dedicated account manager",
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-yellow-400" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="airtime-volume" testId="cta-airtime-vol" label="Request quote" />
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            You pre-fund a wallet, then send airtime via API. Wallet top-up via Mobile Money or bank transfer.
          </p>
        </ServiceSection>

        {/* 5. Mobile Money */}
        <ServiceSection
          id="momo"
          icon={Banknote}
          iconColor="bg-blue-500/10 text-blue-400"
          title="Mobile Money Collections & Payouts"
          status="setup"
          tagline="Accept M-Pesa, MTN MoMo, Airtel Money payments. Pay out salaries, refunds, supplier invoices via API."
        >
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="hover-elevate">
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Collections</h3>
                  <p className="text-xs text-muted-foreground mt-1">Accept payments from customers.</p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">2.5%</span>
                  <span className="text-sm text-muted-foreground">per transaction</span>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    "M-Pesa, MTN MoMo, Airtel Money",
                    "STK push & USSD prompts",
                    "Hosted checkout page",
                    "Webhook notifications",
                    "Settlement: T+1 business day",
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-400" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="momo-collect" testId="cta-momo-collect" label="Apply" />
              </CardContent>
            </Card>

            <Card className="hover-elevate ring-2 ring-blue-500 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-blue-600 text-white">Bundle</Badge>
              </div>
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Collect + Payout</h3>
                  <p className="text-xs text-muted-foreground mt-1">Full money-in / money-out.</p>
                </div>
                <Price usd={135} country={country} suffix="setup + 2% per txn" />
                <div className="space-y-2 text-sm">
                  {[
                    "Everything in Collections",
                    "Bulk payouts (payroll, refunds)",
                    "Cross-network transfers",
                    "Approval workflows",
                    "Reconciliation reports",
                    "Same-day settlement option",
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-400" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="momo-bundle" testId="cta-momo-bundle" label="Apply" />
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardContent className="p-6 space-y-5">
                <div>
                  <h3 className="font-semibold text-lg">Marketplace</h3>
                  <p className="text-xs text-muted-foreground mt-1">Multi-vendor split payments.</p>
                </div>
                <Price usd={540} country={country} suffix="setup + 1.5% per txn" />
                <div className="space-y-2 text-sm">
                  {[
                    "Split payments to vendors",
                    "Escrow holding",
                    "Automated commissions",
                    "KYC for sub-merchants",
                    "Custom integrations",
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-400" />{f}</div>
                  ))}
                </div>
                <ContactBtn service="momo-marketplace" testId="cta-momo-marketplace" label="Request quote" />
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Mobile Money requires per-country licensing approval (typically 2–6 weeks). We handle the paperwork with you.
          </p>
        </ServiceSection>

        {/* Why Afro AI */}
        <Card className="border-primary/30">
          <CardContent className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <Sparkles className="w-8 h-8 text-primary mx-auto" />
              <h2 className="text-2xl font-bold">Why businesses choose Afro AI</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                One contract. One invoice. One dashboard. One support team — instead of 5 different vendors.
              </p>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              {[
                { t: "Pay in your currency", d: "UGX, KES, NGN, GHS, RWF, TZS, ZAR — invoiced locally." },
                { t: "Mobile Money checkout", d: "Top-up your account with M-Pesa, MTN MoMo, Airtel Money." },
                { t: "Local support", d: "WhatsApp & email support in business hours, EAT timezone." },
                { t: "No vendor lock-in", d: "Export your contacts and history any time. Cancel any month." },
              ].map((b, i) => (
                <div key={i} className="space-y-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                  <h4 className="font-semibold">{b.t}</h4>
                  <p className="text-sm text-muted-foreground">{b.d}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5">
          <CardContent className="p-10 text-center space-y-4">
            <h2 className="text-3xl font-bold">Ready to get started?</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Tell us what you need. We'll send a custom quote within one business day.
            </p>
            <div className="flex gap-3 justify-center flex-wrap pt-2">
              <Link href="/contact?service=consultation" data-testid="cta-talk-sales">
                <Button size="lg">
                  <Mail className="w-4 h-4 mr-2" />
                  Talk to sales
                </Button>
              </Link>
              <Link href="/pricing" data-testid="cta-self-serve">
                <Button size="lg" variant="outline">
                  See self-serve plans
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
