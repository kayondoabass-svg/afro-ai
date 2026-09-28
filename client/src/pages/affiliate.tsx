import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users, DollarSign, Gift, Check,
  Globe, Shield
} from "lucide-react";

export default function AffiliatePage() {
  const { toast } = useToast();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", country: "", promotionMethod: "", socialMedia: "" });
  const [submitted, setSubmitted] = useState(false);

  const applyMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/affiliate/apply", form).then(r => r.json()),
    onSuccess: (data) => {
      if (data.success) {
        setSubmitted(true);
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      let msg = err.message || "Something went wrong";
      const json = msg.match(/^\d+:\s*(\{[\s\S]*\})$/);
      if (json) {
        try { msg = JSON.parse(json[1]).message || msg; } catch { /* keep original error */ }
      }
      toast({ title: "Application not submitted", description: msg, variant: "destructive" });
    }
  });

  return (
    <div className="flex-1 overflow-auto min-h-0 bg-background">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-background via-primary/5 to-background border-b py-16 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-2">
            <Gift className="w-4 h-4" />
            Affiliate Program
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight" data-testid="text-affiliate-title">
            Earn with Afro AI
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Join our affiliate program and earn <span className="text-primary font-semibold">10% commission</span> on every paying customer you refer. Built for Africa, growing globally.
          </p>
        </div>
      </section>

      {/* Stats / Benefits */}
      <section className="py-12 px-4 border-b">
          <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: DollarSign, label: "Commission Rate", value: "10%", desc: "Per paying referral" },
            { icon: Users, label: "Cookie Duration", value: "30 days", desc: "Tracking window" },
            { icon: Shield, label: "Application", value: "Review", desc: "Approval required before referral tracking" },
          ].map((stat) => (
            <Card key={stat.label} className="text-center">
              <CardContent className="pt-5 pb-4">
                <stat.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-xl font-bold">{stat.value}</p>
                <p className="text-xs font-medium">{stat.label}</p>
                <p className="text-xs text-muted-foreground">{stat.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-12 px-4 border-b">
        <div className="max-w-4xl mx-auto space-y-8">
          <h2 className="text-2xl font-bold text-center">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Gift, step: "1", title: "Apply Below", desc: "Submit your details for review. If approved, you will receive your affiliate link and portal access by email." },
              { icon: Globe, step: "2", title: "Share Your Link", desc: "Once approved, share your link on social media, YouTube, WhatsApp groups, or your website." },
              { icon: DollarSign, step: "3", title: "Earn Commission", desc: "When someone signs up and pays for a plan through your link, you earn 10% of their payment." },
            ].map((step) => (
              <div key={step.step} className="text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center mx-auto">
                  <span className="text-primary font-bold text-lg">{step.step}</span>
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Signup Form */}
      <section className="py-12 px-4">
        <div className="max-w-lg mx-auto">
           {!submitted ? (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div className="text-center space-y-1 mb-4">
                  <h2 className="text-xl font-bold">Join the Affiliate Program</h2>
                   <p className="text-sm text-muted-foreground">Submit your details for review. Your link becomes active only after approval.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Full Name *</label>
                  <Input placeholder="Your full name" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} data-testid="input-affiliate-name" />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Email Address *</label>
                  <Input type="email" placeholder="your@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} data-testid="input-affiliate-email" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Phone</label>
                    <Input placeholder="+256 700 000000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} data-testid="input-affiliate-phone" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Country</label>
                    <Input placeholder="Uganda" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} data-testid="input-affiliate-country" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Social Media / Website</label>
                  <Input placeholder="Instagram, YouTube, TikTok, or website URL" value={form.socialMedia} onChange={e => setForm(f => ({ ...f, socialMedia: e.target.value }))} data-testid="input-affiliate-social" />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">How will you promote Afro AI?</label>
                  <Textarea placeholder="Tell us your plan — social media, content, WhatsApp groups, events..." value={form.promotionMethod} onChange={e => setForm(f => ({ ...f, promotionMethod: e.target.value }))} className="resize-none" rows={3} data-testid="input-affiliate-promotion" />
                </div>

                <Button
                  className="w-full"
                  onClick={() => applyMutation.mutate()}
                  disabled={!form.fullName || !form.email || applyMutation.isPending}
                  data-testid="button-affiliate-submit"
                >
                   {applyMutation.isPending ? "Submitting..." : "Submit Application"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                   By applying, you agree to our affiliate terms. Payouts are handled manually after review; submitting does not activate a referral link.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6 space-y-6 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-primary" />
                </div>
                <div>
                   <h2 className="text-xl font-bold mb-1">Application received</h2>
                   <p className="text-sm text-muted-foreground">Your application is pending review. If approved, we will email your affiliate link and portal access. Please do not share a referral link until then.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
