import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Globe,
  Award,
  Crown,
  Handshake,
  CheckCircle2,
  TrendingUp,
  Users,
  DollarSign,
  Shield,
  Sparkles,
  ArrowRight,
  Building2,
} from "lucide-react";

const TIERS = [
  {
    name: "Authorized Partner",
    icon: Handshake,
    commission: "20%",
    color: "from-slate-500/20 to-slate-700/20 border-slate-500/30",
    badgeColor: "bg-slate-500/10 text-slate-400 border-slate-500/30",
    requirements: ["Sign partner agreement", "5+ paid customers in 6 months", "Verified business registration"],
    perks: ["Listed in partner directory", "Official Afro AI Partner badge", "Marketing asset library access", "Quarterly training webinars"],
  },
  {
    name: "Premium Partner",
    icon: Award,
    commission: "30%",
    color: "from-blue-500/20 to-cyan-500/20 border-blue-500/40",
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    requirements: ["25+ active customers", "1+ certified staff member", "Annual performance review"],
    perks: ["All Authorized perks", "Lead routing from your country", "Co-marketing opportunities", "Priority support channel", "Higher commission tier"],
    highlight: true,
  },
  {
    name: "Premier Partner",
    icon: Crown,
    commission: "40%",
    color: "from-amber-500/20 to-orange-500/20 border-amber-500/40",
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    requirements: ["100+ active customers", "3+ certified staff", "Demonstrated market leadership"],
    perks: ["All Premium perks", "Country exclusivity option", "White-label rights", "Dedicated account manager", "Co-branded landing pages", "Featured at events"],
  },
];

const COUNTRIES = [
  { code: "UG", name: "Uganda" }, { code: "KE", name: "Kenya" }, { code: "TZ", name: "Tanzania" },
  { code: "RW", name: "Rwanda" }, { code: "NG", name: "Nigeria" }, { code: "GH", name: "Ghana" },
  { code: "ZA", name: "South Africa" }, { code: "ET", name: "Ethiopia" }, { code: "EG", name: "Egypt" },
  { code: "MA", name: "Morocco" }, { code: "SN", name: "Senegal" }, { code: "CI", name: "Côte d'Ivoire" },
  { code: "CM", name: "Cameroon" }, { code: "ZM", name: "Zambia" }, { code: "ZW", name: "Zimbabwe" },
  { code: "BW", name: "Botswana" }, { code: "MZ", name: "Mozambique" }, { code: "CD", name: "DR Congo" },
  { code: "OTHER", name: "Other" },
];

const BENEFITS = [
  { icon: DollarSign, title: "Recurring Revenue", desc: "Earn 20-40% commission on every customer's monthly subscription, for as long as they stay." },
  { icon: Globe, title: "Country Exclusivity", desc: "Premier partners get exclusive rights to their country — protected territory, no competition." },
  { icon: TrendingUp, title: "Lead Pipeline", desc: "We auto-route inbound prospects from your country directly to your inbox. Free leads." },
  { icon: Shield, title: "Trusted Brand", desc: "Co-branded as 'Official Afro AI Partner in [Your Country]' with verified badge and listing." },
  { icon: Users, title: "Sales Enablement", desc: "Pitch decks, demo videos, case studies, comparison sheets — everything you need to close." },
  { icon: Sparkles, title: "First-mover Advantage", desc: "Africa-first AI infrastructure. Be the established player in your market before competitors arrive." },
];

export default function BecomePartnerPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    country: "",
    countryName: "",
    city: "",
    website: "",
    currentCustomers: 0,
    teamSize: 1,
    yearsInBusiness: 0,
    servicesOffered: "",
    whyPartner: "",
    desiredTier: "authorized",
  });

  const apply = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reseller/apply", form).then(r => r.json()),
    onSuccess: (data: any) => {
      if (data.success) {
        setSubmitted(true);
        toast({ title: "Application received!", description: "We'll review and respond within 3 business days." });
      } else {
        toast({ title: "Error", description: data.message || "Something went wrong", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not submit", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName || !form.contactName || !form.email || !form.country) {
      toast({ title: "Missing fields", description: "Please fill required fields", variant: "destructive" });
      return;
    }
    apply.mutate();
  };

  if (submitted) {
    return (
      <div className="flex-1 overflow-auto min-h-0">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold font-serif" data-testid="text-application-success">Application received</h1>
          <p className="text-muted-foreground">
            Thanks {form.contactName}! Our partnerships team will review your application for {form.country} and respond within 3 business days at <strong>{form.email}</strong>.
          </p>
          <p className="text-sm text-muted-foreground">
            In the meantime, learn more about Afro AI's products on our <Link href="/" className="text-primary underline">homepage</Link>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
        {/* Hero */}
        <section className="text-center space-y-5">
          <Badge variant="outline" className="mx-auto">
            <Globe className="w-3 h-3 mr-1" /> Country Partner Program
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold font-serif" data-testid="text-hero-title">
            Become an authorized Afro AI partner in your country
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Join a select network of licensed companies reselling Africa's AI infrastructure.
            Earn up to <strong className="text-foreground">40% recurring commission</strong>, get exclusive country rights,
            and become the trusted local face of Afro AI.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a href="#apply">
              <Button size="lg" data-testid="button-scroll-apply">
                Apply now <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </a>
            <Link href="/partners/directory">
              <Button size="lg" variant="outline" data-testid="button-view-directory">View partner directory</Button>
            </Link>
          </div>
        </section>

        {/* Benefits */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl md:text-3xl font-bold">Why partner with Afro AI?</h2>
            <p className="text-muted-foreground">Real economics, real territory, real support.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {BENEFITS.map(b => {
              const Icon = b.icon;
              return (
                <Card key={b.title} className="hover-elevate" data-testid={`card-benefit-${b.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  <CardContent className="p-5 space-y-2">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-semibold">{b.title}</h3>
                    <p className="text-sm text-muted-foreground">{b.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Tiers */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl md:text-3xl font-bold">Three partnership tiers</h2>
            <p className="text-muted-foreground">Start where you are. Grow at your pace.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TIERS.map(tier => {
              const Icon = tier.icon;
              return (
                <Card
                  key={tier.name}
                  className={`bg-gradient-to-br ${tier.color} ${tier.highlight ? "ring-2 ring-blue-500/40 md:scale-105" : ""}`}
                  data-testid={`card-tier-${tier.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <CardContent className="p-6 space-y-4">
                    {tier.highlight && (
                      <Badge className="bg-blue-500 text-white mb-2">Most popular</Badge>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-background/40 flex items-center justify-center">
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{tier.name}</h3>
                        <p className="text-3xl font-extrabold mt-1">
                          {tier.commission}
                          <span className="text-sm font-normal text-muted-foreground"> recurring</span>
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Requirements</p>
                      <ul className="space-y-1.5 text-sm">
                        {tier.requirements.map(r => (
                          <li key={r} className="flex gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" /> {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Perks</p>
                      <ul className="space-y-1.5 text-sm">
                        {tier.perks.map(p => (
                          <li key={p} className="flex gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" /> {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Application Form */}
        <section id="apply" className="scroll-mt-20">
          <Card className="bg-card/60 backdrop-blur">
            <CardContent className="p-6 md:p-10">
              <div className="text-center space-y-2 mb-8">
                <Building2 className="w-10 h-10 mx-auto text-primary" />
                <h2 className="text-2xl md:text-3xl font-bold">Apply to become a partner</h2>
                <p className="text-muted-foreground text-sm">We review every application carefully. Response within 3 business days.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="companyName">Company name *</Label>
                    <Input id="companyName" data-testid="input-company-name" value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} required />
                  </div>
                  <div>
                    <Label htmlFor="contactName">Your full name *</Label>
                    <Input id="contactName" data-testid="input-contact-name" value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} required />
                  </div>
                  <div>
                    <Label htmlFor="email">Business email *</Label>
                    <Input id="email" type="email" data-testid="input-email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone (with country code)</Label>
                    <Input id="phone" data-testid="input-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+256..." />
                  </div>
                  <div>
                    <Label htmlFor="country">Country *</Label>
                    <Select
                      value={form.country}
                      onValueChange={(v) => {
                        const c = COUNTRIES.find(x => x.code === v);
                        setForm({ ...form, country: v, countryName: c?.name || v });
                      }}
                    >
                      <SelectTrigger id="country" data-testid="select-country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map(c => (
                          <SelectItem key={c.code} value={c.code} data-testid={`option-country-${c.code}`}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input id="city" data-testid="input-city" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" data-testid="input-website" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://" />
                  </div>
                  <div>
                    <Label htmlFor="teamSize">Team size</Label>
                    <Input id="teamSize" type="number" min="1" data-testid="input-team-size" value={form.teamSize} onChange={e => setForm({ ...form, teamSize: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div>
                    <Label htmlFor="currentCustomers">Current customers (any service)</Label>
                    <Input id="currentCustomers" type="number" min="0" data-testid="input-current-customers" value={form.currentCustomers} onChange={e => setForm({ ...form, currentCustomers: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label htmlFor="yearsInBusiness">Years in business</Label>
                    <Input id="yearsInBusiness" type="number" min="0" data-testid="input-years-business" value={form.yearsInBusiness} onChange={e => setForm({ ...form, yearsInBusiness: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="desiredTier">Desired tier</Label>
                  <Select value={form.desiredTier} onValueChange={(v) => setForm({ ...form, desiredTier: v })}>
                    <SelectTrigger id="desiredTier" data-testid="select-tier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="authorized" data-testid="option-tier-authorized">Authorized (20% commission — start here)</SelectItem>
                      <SelectItem value="premium" data-testid="option-tier-premium">Premium (30% — established business)</SelectItem>
                      <SelectItem value="premier" data-testid="option-tier-premier">Premier (40% — country exclusivity)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="servicesOffered">What services does your company currently offer?</Label>
                  <Textarea id="servicesOffered" rows={3} data-testid="input-services" value={form.servicesOffered} onChange={e => setForm({ ...form, servicesOffered: e.target.value })} placeholder="e.g. CRM implementation, web development, training..." />
                </div>

                <div>
                  <Label htmlFor="whyPartner">Why do you want to partner with Afro AI?</Label>
                  <Textarea id="whyPartner" rows={4} data-testid="input-why-partner" value={form.whyPartner} onChange={e => setForm({ ...form, whyPartner: e.target.value })} placeholder="Tell us about your market, customers, and vision..." />
                </div>

                <Button type="submit" size="lg" className="w-full" disabled={apply.isPending} data-testid="button-submit-application">
                  {apply.isPending ? "Submitting…" : "Submit application"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
