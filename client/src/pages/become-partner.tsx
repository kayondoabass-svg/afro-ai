import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Award, Building2, Check, Crown, DollarSign, Globe, Handshake, ShieldCheck, Sparkles, TrendingUp, Users, Wallet } from "lucide-react";

const COUNTRIES = [
  ["UG", "Uganda"], ["KE", "Kenya"], ["TZ", "Tanzania"], ["RW", "Rwanda"], ["NG", "Nigeria"], ["GH", "Ghana"],
  ["ZA", "South Africa"], ["ET", "Ethiopia"], ["EG", "Egypt"], ["MA", "Morocco"], ["SN", "Senegal"],
  ["CI", "Côte d'Ivoire"], ["CM", "Cameroon"], ["ZM", "Zambia"], ["ZW", "Zimbabwe"], ["BW", "Botswana"],
  ["MZ", "Mozambique"], ["CD", "DR Congo"], ["OTHER", "Other"],
];
const TIERS = [
  {
    name: "Authorized Partner", commission: "20%", icon: Handshake,
    requirements: ["Sign partner agreement", "5+ paid customers in 6 months", "Verified business registration"],
    perks: ["Listed in partner directory", "Official Afro AI Partner badge", "Marketing asset library access", "Quarterly training webinars"],
  },
  {
    name: "Premium Partner", commission: "30%", icon: Award, highlighted: true,
    requirements: ["25+ active customers", "1+ certified staff member", "Annual performance review"],
    perks: ["All Authorized perks", "Lead routing from your country", "Co-marketing opportunities", "Priority support channel", "Higher commission tier"],
  },
  {
    name: "Premier Partner", commission: "40%", icon: Crown,
    requirements: ["100+ active customers", "3+ certified staff", "Demonstrated market leadership"],
    perks: ["All Premium perks", "Country exclusivity option", "White-label rights", "Dedicated account manager", "Co-branded landing pages", "Featured at events"],
  },
];
const BENEFITS = [
  { icon: DollarSign, title: "Recurring Revenue", description: "Earn 20–40% commission on every customer's monthly subscription, for as long as they stay." },
  { icon: Globe, title: "Country Exclusivity", description: "Premier partners may qualify for exclusive country rights, subject to agreement and approval." },
  { icon: TrendingUp, title: "Lead Pipeline", description: "Inbound prospects from your country can be routed to your team where the programme supports it." },
  { icon: ShieldCheck, title: "Trusted Brand", description: "Eligible partners can be presented as an official Afro AI partner with a verified listing." },
  { icon: Users, title: "Sales Enablement", description: "Access sales materials such as pitch decks, demo videos, case studies and comparison sheets." },
  { icon: Sparkles, title: "First-mover Advantage", description: "Build a local presence for Afro AI's Africa-first AI infrastructure as the programme grows." },
];
const INITIAL = {
  companyName: "", contactName: "", email: "", phone: "", country: "", countryName: "", city: "", website: "",
  currentCustomers: 0, teamSize: 1, yearsInBusiness: 0, servicesOffered: "", whyPartner: "",
  desiredTier: "authorized", registrationNumber: "", registrationCountry: "", payoutMethod: "",
};
function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Please try again.";
  const match = message.match(/^\d+:\s*(\{[\s\S]*\})$/);
  if (match) {
    try { return JSON.parse(match[1]).message || message; } catch { return message; }
  }
  return message;
}

export default function BecomePartnerPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState(INITIAL);
  const apply = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/reseller/apply", form);
      return response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      if (data?.success) setSubmitted(true);
      else toast({ title: "Application not submitted", description: data?.message || "Please try again.", variant: "destructive" });
    },
    onError: (error) => toast({ title: "Application not submitted", description: errorMessage(error), variant: "destructive" }),
  });
  const update = <K extends keyof typeof INITIAL>(key: K, value: (typeof INITIAL)[K]) => setForm((current) => ({ ...current, [key]: value }));

  return <main className="flex-1 min-h-0 overflow-auto">
    <section className="border-b bg-gradient-to-br from-primary/[0.09] via-background to-background">
      <div className="mx-auto max-w-6xl px-4 sm:px-8 py-14 sm:py-20">
        <Badge variant="outline" className="gap-2 border-primary/30 bg-background/50 text-primary"><Globe className="h-4 w-4" /> Business partner programme</Badge>
        <div className="mt-7 grid lg:grid-cols-[1fr_0.55fr] gap-10 items-end">
          <div><h1 className="max-w-3xl text-4xl sm:text-6xl font-semibold leading-[1.05] tracking-tight">Bring Afro AI to the businesses you know.</h1><p className="mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground">A local partnership for teams ready to introduce practical AI products, guide customers and grow a trusted market.</p><div className="mt-7 flex flex-wrap gap-3"><a href="#apply" className="inline-flex items-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Apply to partner <ArrowRight className="ml-2 h-4 w-4" /></a><Link href="/partners/directory" className="inline-flex items-center rounded-md border bg-background px-5 py-3 text-sm font-medium">View partner directory</Link></div></div>
          <aside className="border-l-2 border-primary pl-5 py-1"><p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Partner tiers</p><p className="mt-3 text-2xl font-semibold">20% · 30% · 40%</p><p className="mt-1 text-sm text-muted-foreground">Founder-assigned fixed rates</p><p className="mt-4 text-xs text-muted-foreground">Applicants may express a preference. The founder verifies registration and deliberately assigns the final tier.</p></aside>
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-6xl px-4 sm:px-8 py-8 grid md:grid-cols-3 gap-3">
      <Feature icon={<Handshake />} title="Local expertise" text="Represent the product with knowledge of your market and customers." />
      <Feature icon={<ShieldCheck />} title="Verified programme" text="Business registration details are reviewed before approval." />
      <Feature icon={<Wallet />} title="Manual payouts" text="Choose bank or mobile money. All payments are made manually by the founder." />
    </section>
    <section className="mx-auto max-w-6xl px-4 sm:px-8 py-10 border-t">
      <div className="mb-6"><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Partner support</p><h2 className="mt-2 text-2xl font-semibold">Why partner with Afro AI?</h2><p className="mt-2 text-sm text-muted-foreground">The programme combines recurring economics with local market support.</p></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {BENEFITS.map(({ icon: Icon, title, description }) => <Card key={title}><CardContent className="p-4"><div className="flex items-center gap-2 text-primary"><Icon className="h-4 w-4" /><h3 className="text-sm font-semibold text-foreground">{title}</h3></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p></CardContent></Card>)}
      </div>
    </section>
    <section className="mx-auto max-w-6xl px-4 sm:px-8 py-10 border-t">
      <div className="mb-6"><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Tier guide</p><h2 className="mt-2 text-2xl font-semibold">Three partnership tiers</h2><p className="mt-2 text-sm text-muted-foreground">Applicants may request a tier preference; the founder verifies eligibility and assigns the final tier.</p></div>
      <div className="grid lg:grid-cols-3 gap-4">
        {TIERS.map(({ name, commission, icon: Icon, requirements, perks, highlighted }) => <Card key={name} className={highlighted ? "border-primary/40 bg-primary/[0.035]" : ""}>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><div><h3 className="font-semibold">{name}</h3><p className="text-2xl font-semibold">{commission}<span className="ml-1 text-xs font-normal text-muted-foreground">commission</span></p></div></div>
            <div><p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Requirements</p><ul className="mt-2 space-y-1.5 text-xs">{requirements.map((requirement) => <li key={requirement} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{requirement}</li>)}</ul></div>
            <div><p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Programme perks</p><ul className="mt-2 space-y-1.5 text-xs">{perks.map((perk) => <li key={perk} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{perk}</li>)}</ul></div>
          </CardContent>
        </Card>)}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Tier eligibility, rates and benefits are subject to review, the partner agreement and programme terms. A requested tier does not guarantee approval or assignment.</p>
    </section>
    <section className="mx-auto max-w-6xl px-4 sm:px-8 py-9 border-t">
      <div className="grid md:grid-cols-[0.7fr_1.3fr] gap-8">
        <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Programme flow</p><h2 className="mt-3 text-3xl font-semibold">A partnership with clear checks.</h2></div>
        <div className="divide-y">{[
          ["01", "Apply with your company details", "Registration information helps the team confirm a legitimate business."],
          ["02", "Afro AI reviews and verifies", "The founder reviews the application and assigns the appropriate fixed commission tier."],
          ["03", "Build your market", "Approved business partners get a workspace for customer, lead, team and commission operations."],
        ].map(([number, title, description]) => <div key={number} className="grid grid-cols-[3rem_1fr] gap-3 py-4"><span className="font-mono text-sm text-primary">{number}</span><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div>)}</div>
      </div>
    </section>
    <section id="apply" className="mx-auto max-w-6xl px-4 sm:px-8 py-10 scroll-mt-16">
      {!submitted ? <Card className="overflow-hidden"><CardContent className="p-0"><div className="grid lg:grid-cols-[0.65fr_1.35fr]">
        <div className="bg-primary/[0.07] p-6 sm:p-9"><Building2 className="h-7 w-7 text-primary" /><p className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-primary">Partner application</p><h2 className="mt-2 text-2xl font-semibold">Tell us about your business.</h2><p className="mt-3 text-sm text-muted-foreground">A complete profile helps the team review your local capabilities and registration.</p><div className="mt-7 rounded-lg border border-primary/20 bg-background/60 p-4 text-xs leading-relaxed text-muted-foreground">Do not submit account numbers, bank passwords, mobile money PINs or one-time codes. Payment details are confirmed privately before the founder pays manually.</div></div>
        <form className="p-5 sm:p-8 space-y-5" onSubmit={(event) => { event.preventDefault(); apply.mutate(); }}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Company name *"><Input required value={form.companyName} onChange={(event) => update("companyName", event.target.value)} /></Field>
            <Field label="Contact name *"><Input required autoComplete="name" value={form.contactName} onChange={(event) => update("contactName", event.target.value)} /></Field>
            <Field label="Business email *"><Input required type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></Field>
            <Field label="Phone"><Input autoComplete="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+256…" /></Field>
            <Field label="Country *"><select required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.country} onChange={(event) => { const chosen = COUNTRIES.find(([code]) => code === event.target.value); update("country", event.target.value); update("countryName", chosen?.[1] || event.target.value); if (!form.registrationCountry) update("registrationCountry", chosen?.[1] || ""); }}><option value="">Choose country</option>{COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field>
            <Field label="City"><Input value={form.city} onChange={(event) => update("city", event.target.value)} /></Field>
            <Field label="Business registration number *"><Input required value={form.registrationNumber} onChange={(event) => update("registrationNumber", event.target.value)} autoComplete="off" /></Field>
            <Field label="Registration country *"><Input required value={form.registrationCountry} onChange={(event) => update("registrationCountry", event.target.value)} placeholder="Country where the business is registered" /></Field>
            <Field label="Website"><Input type="url" value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="https://" /></Field>
            <Field label="Team size"><Input type="number" min="1" value={form.teamSize} onChange={(event) => update("teamSize", Number(event.target.value) || 1)} /></Field>
            <Field label="Current customers"><Input type="number" min="0" value={form.currentCustomers} onChange={(event) => update("currentCustomers", Number(event.target.value) || 0)} /></Field>
            <Field label="Years in business"><Input type="number" min="0" value={form.yearsInBusiness} onChange={(event) => update("yearsInBusiness", Number(event.target.value) || 0)} /></Field>
            <Field label="Preferred payout method *"><select required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.payoutMethod} onChange={(event) => update("payoutMethod", event.target.value)}><option value="">Choose method</option><option value="bank">Bank</option><option value="mobile_money">Mobile money</option></select></Field>
            <Field label="Requested tier (preference only)"><select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.desiredTier} onChange={(event) => update("desiredTier", event.target.value)}><option value="authorized">Authorized — 20%</option><option value="premium">Premium — 30%</option><option value="premier">Premier — 40%</option></select></Field>
          </div>
          <Field label="Services offered"><Textarea rows={3} value={form.servicesOffered} onChange={(event) => update("servicesOffered", event.target.value)} placeholder="Implementation, training, consulting…" /></Field>
          <Field label="Why do you want to partner with Afro AI?"><Textarea rows={3} value={form.whyPartner} onChange={(event) => update("whyPartner", event.target.value)} placeholder="Tell us about your market, customers and approach." /></Field>
          <Button className="w-full" type="submit" disabled={!form.companyName.trim() || !form.contactName.trim() || !form.email.trim() || !form.country || !form.registrationNumber.trim() || !form.registrationCountry.trim() || !form.payoutMethod || apply.isPending}>{apply.isPending ? "Submitting application…" : "Submit for review"} <ArrowRight className="ml-2 h-4 w-4" /></Button>
          <p className="text-center text-xs text-muted-foreground">Successful applications are under review and trigger a founder email workflow. Tier assignment and business verification happen during review; no referral link is active before approval.</p>
        </form>
      </div></CardContent></Card> : <Card className="mx-auto max-w-2xl border-primary/30 bg-primary/[0.04]"><CardContent className="p-8 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary"><Check className="h-7 w-7" /></span><h2 className="mt-5 text-2xl font-semibold">Application received</h2><p className="mt-3 text-sm text-muted-foreground">Your business application is under review. The founder is notified through the application email workflow. Verification and tier assignment happen before approval.</p><Button asChild variant="outline" className="mt-6"><Link href="/programme-portal">Open your applicant workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>}
    </section>
    <footer className="border-t px-4 sm:px-8 py-6 text-center text-xs text-muted-foreground">Already applied? <Link href="/programme-portal" className="text-primary underline underline-offset-4">Open your programme workspace</Link></footer>
  </main>;
}
function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-primary [&>svg]:h-4 [&>svg]:w-4"><span>{icon}</span><h3 className="text-sm font-semibold text-foreground">{title}</h3></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text}</p></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium">{label}{children}</label>;
}
