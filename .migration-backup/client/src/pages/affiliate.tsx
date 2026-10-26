import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight, DollarSign, Gift, ShieldCheck, Wallet, Users } from "lucide-react";

type PayoutMethod = "bank" | "mobile_money";
const INITIAL_FORM = { fullName: "", email: "", phone: "", country: "", promotionMethod: "", socialMedia: "", payoutMethod: "" as PayoutMethod | "" };

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Please try again.";
  const match = message.match(/^\d+:\s*(\{[\s\S]*\})$/);
  if (match) {
    try { return JSON.parse(match[1]).message || message; } catch { return message; }
  }
  return message;
}

export default function AffiliatePage() {
  const { toast } = useToast();
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const apply = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/affiliate/apply", form);
      return response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      if (data?.success) setSubmitted(true);
      else toast({ title: "Application not submitted", description: data?.message || "Please try again.", variant: "destructive" });
    },
    onError: (error) => toast({ title: "Application not submitted", description: errorMessage(error), variant: "destructive" }),
  });
  const set = <K extends keyof typeof INITIAL_FORM>(key: K, value: (typeof INITIAL_FORM)[K]) => setForm((current) => ({ ...current, [key]: value }));

  return <main className="flex-1 min-h-0 overflow-auto">
    <section className="relative overflow-hidden border-b bg-gradient-to-br from-primary/[0.10] via-background to-background">
      <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full border border-primary/15" />
      <div className="pointer-events-none absolute -right-6 -top-14 h-52 w-52 rounded-full border border-primary/20" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-8 py-16 sm:py-24">
        <Badge variant="outline" className="mb-6 gap-2 border-primary/30 bg-background/60 px-3 py-1.5 text-primary"><Gift className="h-4 w-4" /> Afro AI Affiliate Programme</Badge>
        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-10 items-end">
          <div><h1 className="max-w-3xl text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.04]" data-testid="text-affiliate-title">Build your audience. <span className="text-primary">Share the upside.</span></h1><p className="mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground">Introduce useful AI tools to the people you know. Approved affiliates earn 10% commission on paying customers referred through their active link.</p><a href="#apply" className="inline-flex mt-8 items-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">Apply to join <ArrowRight className="ml-2 h-4 w-4" /></a></div>
          <div className="border-l-2 border-primary pl-5 py-2"><p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">A clear start</p><p className="mt-3 text-2xl font-semibold">10%</p><p className="text-sm text-muted-foreground">on each paying referral</p><p className="mt-5 text-sm leading-relaxed text-muted-foreground">Every application is reviewed. Your referral link is only issued after approval.</p></div>
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-6xl px-4 sm:px-8 py-8 grid sm:grid-cols-3 gap-3">
      {[
        { icon: DollarSign, label: "Commission rate", value: "10%", detail: "Per paying referral" },
        { icon: Users, label: "Tracking window", value: "30 days", detail: "Referral attribution window" },
        { icon: ShieldCheck, label: "Application", value: "Reviewed", detail: "Approval before link activation" },
      ].map((stat) => <Card key={stat.label}><CardContent className="p-4 flex items-center gap-3"><stat.icon className="h-5 w-5 shrink-0 text-primary" /><div><p className="text-lg font-semibold leading-none">{stat.value}</p><p className="mt-1 text-xs font-medium">{stat.label}</p><p className="text-[11px] text-muted-foreground">{stat.detail}</p></div></CardContent></Card>)}
    </section>
    <section className="mx-auto max-w-6xl px-4 sm:px-8 py-9 grid sm:grid-cols-3 gap-3">
      <Feature icon={<Users />} label="Your audience" detail="Promote through content, community or client work." />
      <Feature icon={<ShieldCheck />} label="Approval first" detail="No tracking link is active while your application is under review." />
      <Feature icon={<Wallet />} label="Manual payout" detail="Choose bank or mobile money. Afro AI pays manually after review." />
    </section>
    <section className="mx-auto max-w-6xl px-4 sm:px-8 py-8 border-t">
      <div className="grid md:grid-cols-[0.7fr_1.3fr] gap-8 lg:gap-16">
        <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Three steps</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">A programme with a human review.</h2><p className="mt-3 text-sm text-muted-foreground">Keep the process straightforward: apply, wait for a decision, then share an approved link.</p></div>
        <div className="divide-y">{[
          ["01", "Apply below", "Submit your details for review. If approved, you receive your affiliate link and portal access by email."],
          ["02", "Share your link", "Once approved, share your link on social media, YouTube, WhatsApp groups or your website. Referrals are tracked for 30 days."],
          ["03", "Earn commission", "When someone signs up and pays for a plan through your link, you earn 10% of their payment."],
        ].map(([number, title, detail]) => <div key={number} className="grid grid-cols-[3rem_1fr] gap-3 py-4"><span className="font-mono text-sm text-primary">{number}</span><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div></div>)}</div>
      </div>
    </section>
    <section id="apply" className="mx-auto max-w-6xl px-4 sm:px-8 py-12 scroll-mt-16">
      {!submitted ? <div className="grid lg:grid-cols-[0.75fr_1.25fr] border rounded-2xl overflow-hidden">
        <div className="bg-primary/[0.07] p-6 sm:p-9 flex flex-col justify-between"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Application</p><h2 className="mt-3 text-3xl font-semibold">Start a considered partnership.</h2><p className="mt-4 text-sm text-muted-foreground">Share enough context for our team to understand your audience and approach.</p></div><div className="mt-10 border-t border-primary/20 pt-4 text-sm"><p className="font-medium">Payout preference</p><p className="mt-1 text-xs text-muted-foreground">Select bank or mobile money. Account details are confirmed privately before manual payment.</p></div></div>
        <Card className="border-0 rounded-none"><CardContent className="p-5 sm:p-9"><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); apply.mutate(); }}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full name *"><Input required autoComplete="name" value={form.fullName} onChange={(event) => set("fullName", event.target.value)} data-testid="input-affiliate-name" /></Field>
            <Field label="Email address *"><Input required type="email" autoComplete="email" value={form.email} onChange={(event) => set("email", event.target.value)} data-testid="input-affiliate-email" /></Field>
            <Field label="Phone"><Input autoComplete="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} placeholder="+256 700 000000" /></Field>
            <Field label="Country"><Input autoComplete="country-name" value={form.country} onChange={(event) => set("country", event.target.value)} placeholder="Uganda" /></Field>
            <Field label="Social media or website"><Input value={form.socialMedia} onChange={(event) => set("socialMedia", event.target.value)} placeholder="Website, channel or profile" /></Field>
          <Field label="Preferred payout method *"><select data-testid="select-affiliate-payout-method" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required value={form.payoutMethod} onChange={(event) => set("payoutMethod", event.target.value as PayoutMethod | "")}><option value="">Choose method</option><option value="bank">Bank</option><option value="mobile_money">Mobile money</option></select></Field>
          </div>
          <Field label="How will you promote Afro AI?"><Textarea rows={4} className="resize-y" value={form.promotionMethod} onChange={(event) => set("promotionMethod", event.target.value)} placeholder="Tell us about your content, community or customer audience." /></Field>
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">Never enter bank account numbers, bank passwords, mobile money PINs or one-time codes here. Payment details are confirmed privately before the founder makes a manual payment.</div>
          <Button className="w-full" type="submit" disabled={!form.fullName.trim() || !form.email.trim() || !form.payoutMethod || apply.isPending} data-testid="button-affiliate-submit">{apply.isPending ? "Submitting application…" : "Submit for review"} <ArrowRight className="ml-2 h-4 w-4" /></Button>
          <p className="text-center text-xs text-muted-foreground">Successful submissions are under review. The founder is notified by email; no referral link is activated at submission.</p>
        </form></CardContent></Card>
      </div> : <Card className="mx-auto max-w-2xl border-primary/30 bg-primary/[0.04]"><CardContent className="p-7 sm:p-10 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary"><Check className="h-7 w-7" /></div><p className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-primary">Received</p><h2 className="mt-2 text-2xl font-semibold">Your application is under review.</h2><p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">A successful submission triggers the founder email workflow. You will receive a response after review. Your referral link remains inactive until approval.</p><Button variant="outline" className="mt-6" asChild><Link href="/programme-portal">Go to applicant workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>}
    </section>
    <footer className="border-t px-4 sm:px-8 py-6 text-center text-xs text-muted-foreground">Already applied? <Link href="/programme-portal" className="text-primary underline underline-offset-4">Open your programme workspace</Link></footer>
  </main>;
}

function Feature({ icon, label, detail }: { icon: ReactNode; label: string; detail: string }) {
  return <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}<p className="text-sm font-semibold text-foreground">{label}</p></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium">{label}{children}</label>;
}
