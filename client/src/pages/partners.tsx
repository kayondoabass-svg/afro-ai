import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, MessageSquare, Globe, Shield, CheckCircle2, ArrowRight, Smartphone, Bot, Building2, Network } from "lucide-react";
import { Link } from "wouter";

const TELCOS = [
  { name: "MTN", countries: "UG, GH, NG, CI, CM, ZA + 14 more", status: "Aggregator-ready", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
  { name: "Airtel Africa", countries: "KE, UG, TZ, RW, NG, ZM + 8 more", status: "Aggregator-ready", color: "bg-red-500/10 text-red-400 border-red-500/30" },
  { name: "Safaricom", countries: "Kenya", status: "Aggregator-ready", color: "bg-green-500/10 text-green-400 border-green-500/30" },
  { name: "Vodacom", countries: "TZ, MZ, DRC", status: "Aggregator-ready", color: "bg-red-500/10 text-red-400 border-red-500/30" },
  { name: "Orange", countries: "CI, SN, ML, BF + 16 more", status: "Aggregator-ready", color: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
];

const PRODUCTS = [
  { icon: Smartphone, title: "USSD Builder", desc: "AI-powered USSD apps that work on any phone, no internet required. *123#-style menus driven by GPT-4.1.", url: "/ussd-builder" },
  { icon: Bot, title: "AI Chatbot", desc: "Trainable widget chat for African business websites. Auto-scans the site, white-label, programmatic API.", url: "/chatbot-api" },
  { icon: Mail, title: "Email API", desc: "Transactional email at half the price of Resend or SendGrid, optimized for African senders.", url: "/developer-email" },
];

const COMPLIANCE = [
  "ISO 27001-aligned data handling",
  "AWS-hosted (us-east-1, EU data residency on request)",
  "DKIM, SPF, DMARC fully verified",
  "Pesapal-licensed payment processor (regulated in 8 African markets)",
  "GDPR-compliant data export & deletion",
  "Founders are full-time on platform",
];

export default function PartnersPage() {
  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        {/* Hero */}
        <div className="text-center space-y-4">
          <Badge variant="outline" className="mx-auto">
            <Network className="w-3 h-3 mr-1" /> Telco & Aggregator Partnerships
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold font-serif" data-testid="text-partners-title">
            Built for Africa's mobile networks
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Afro AI is the AI-native infrastructure layer for African telecommunications.
            We build USSD, SMS, email and chatbot products on top of mobile-network APIs
            and we are actively seeking direct partnerships with operators and aggregators across the continent.
          </p>
        </div>

        {/* Telco grid */}
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-center">Operators we support today</h2>
          <p className="text-sm text-muted-foreground text-center">
            Currently delivered via licensed aggregators (Africa's Talking, Hubtel, Beem, Termii). Direct VAS partnerships in progress.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-3">
            {TELCOS.map((t) => (
              <Card key={t.name} className={`border ${t.color.replace("text-", "").replace("bg-", "").includes("border-") ? t.color : "border-border"}`} data-testid={`card-telco-${t.name.toLowerCase().replace(/\s/g, "-")}`}>
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-bold text-sm">{t.name}</h3>
                  <p className="text-xs text-muted-foreground leading-snug">{t.countries}</p>
                  <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* What we offer telcos */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-center">What a partnership unlocks</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="hover-elevate">
              <CardContent className="p-5 space-y-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold">For operators (MTN / Airtel / Safaricom)</h3>
                <ul className="text-xs text-muted-foreground space-y-1.5 mt-2">
                  <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" /> Direct USSD short-code allocation, revenue-share billing</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" /> AI-native VAS layer for your B2B/SME customers</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" /> White-label deployment under your brand</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" /> Co-marketing & developer enablement</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardContent className="p-5 space-y-2">
                <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                  <Network className="w-5 h-5 text-yellow-400" />
                </div>
                <h3 className="font-semibold">For aggregators (Africa's Talking, Hubtel, Beem)</h3>
                <ul className="text-xs text-muted-foreground space-y-1.5 mt-2">
                  <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" /> Pre-integrated AI layer drives session volume on your network</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" /> SaaS-style customer acquisition for your USSD/SMS infrastructure</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" /> Joint go-to-market with shared customers</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" /> Wholesale rates passed through to end-user pricing</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardContent className="p-5 space-y-2">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="font-semibold">For regulators & ministries</h3>
                <ul className="text-xs text-muted-foreground space-y-1.5 mt-2">
                  <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" /> Citizen-services USSD apps reaching feature-phone users</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" /> Local data residency, audit trails, KYC compliance</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" /> Multilingual AI (Swahili, Luganda, Yoruba, French + more)</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Products partners can resell */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-center">Products you can resell or white-label</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {PRODUCTS.map((p) => (
              <Link key={p.title} href={p.url} className="block">
                <Card className="hover-elevate h-full">
                  <CardContent className="p-5 space-y-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <p.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-semibold">{p.title}</h3>
                    <p className="text-sm text-muted-foreground">{p.desc}</p>
                    <div className="flex items-center text-xs text-primary font-medium">View product <ArrowRight className="w-3 h-3 ml-1" /></div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Compliance */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-center">Compliance & technical readiness</h2>
          <Card>
            <CardContent className="p-6">
              <div className="grid md:grid-cols-2 gap-3">
                {COMPLIANCE.map((c) => (
                  <div key={c} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{c}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-8 text-center space-y-4">
            <h2 className="text-2xl font-bold">Talk to our partnership team</h2>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              We respond to partnership inquiries within 48 hours. For VAS / aggregator integrations,
              please include your country, expected session volume, and integration timeline.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <a href="mailto:partnerships@afroaigroup.com">
                <Button size="lg" className="gap-2" data-testid="button-partner-email">
                  <Mail className="w-4 h-4" /> partnerships@afroaigroup.com
                </Button>
              </a>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="gap-2" data-testid="button-partner-contact">
                  <MessageSquare className="w-4 h-4" /> Contact form
                </Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Founder & CEO: <strong className="text-foreground">Kayondo Abass</strong> · Kampala, Uganda · Available for in-person meetings across East Africa
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
