import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign, Users, Inbox, Award, Copy, Check, Download,
  TrendingUp, Globe, Crown, Handshake, FileText, Clock, CheckCircle2,
} from "lucide-react";
import type { Partner, PartnerCustomer, PartnerCommission, PartnerLead, PartnerPayout } from "@shared/schema";

const TIER_ICON: Record<string, any> = { authorized: Handshake, premium: Award, premier: Crown };
const TIER_COLOR: Record<string, string> = {
  authorized: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  premium: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  premier: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

interface PortalData {
  partner: Partner;
  customers: PartnerCustomer[];
  commissions: PartnerCommission[];
  leads: PartnerLead[];
  payouts: PartnerPayout[];
  stats: {
    totalCustomers: number;
    activeCustomers: number;
    pendingCommissionCents: number;
    paidCommissionCents: number;
    leadsThisMonth: number;
    conversionRate: number;
  };
}

const ASSETS = [
  { name: "Afro AI logo pack (PNG, SVG)", desc: "Light & dark variants", category: "Branding" },
  { name: "Official Partner badge", desc: "Authorized / Premium / Premier", category: "Branding" },
  { name: "Sales pitch deck (English)", desc: "20 slides, fully editable", category: "Sales" },
  { name: "Sales pitch deck (French)", desc: "20 slides, fully editable", category: "Sales" },
  { name: "Product comparison sheet", desc: "vs Zoho, HubSpot, Twilio", category: "Sales" },
  { name: "Customer case studies", desc: "5 detailed ROI stories", category: "Marketing" },
  { name: "Demo video walkthrough", desc: "8-minute product overview", category: "Marketing" },
  { name: "Email templates", desc: "Outreach, follow-up, onboarding", category: "Marketing" },
  { name: "Implementation playbook", desc: "Step-by-step deployment guide", category: "Technical" },
  { name: "API documentation PDF", desc: "Offline reference for clients", category: "Technical" },
];

export default function PartnerPortalPage() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<PortalData>({
    queryKey: ["/api/partner/me"],
  });

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto min-h-0 p-6 space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!data || !data.partner) {
    return (
      <div className="flex-1 overflow-auto min-h-0 p-6">
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <Globe className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <h2 className="text-xl font-semibold" data-testid="text-not-partner">You're not yet a partner</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              The Partner Portal is available to approved Afro AI country partners.
              Apply to join the program.
            </p>
            <Button onClick={() => window.location.href = "/become-partner"} data-testid="button-apply-now">
              Apply to become a partner
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { partner, customers, commissions, leads, payouts, stats } = data;
  const TierIcon = TIER_ICON[partner.tier] || Handshake;
  const referralLink = `https://afroaigroup.com?ref=${partner.slug}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast({ title: "Copied!", description: "Referral link copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
          <CardContent className="p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {partner.logoUrl ? (
                <img src={partner.logoUrl} alt={partner.companyName} className="w-16 h-16 rounded-xl object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl">
                  {partner.companyName.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="text-xl md:text-2xl font-bold" data-testid="text-partner-company">{partner.companyName}</h1>
                <p className="text-sm text-muted-foreground">Official Afro AI Partner — {partner.countryName}</p>
                <Badge variant="outline" className={`${TIER_COLOR[partner.tier]} mt-1`}>
                  <TierIcon className="w-3 h-3 mr-1" /> {partner.tier} • {partner.commissionPercent}% commission
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input value={referralLink} readOnly className="w-64 text-xs" data-testid="input-referral-link" />
              <Button onClick={copyLink} size="sm" variant="outline" data-testid="button-copy-link">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Customers" value={stats.totalCustomers.toString()} sub={`${stats.activeCustomers} active`} testid="stat-customers" />
          <StatCard icon={Clock} label="Pending commission" value={fmt(stats.pendingCommissionCents)} sub="awaiting payout" color="text-yellow-400" testid="stat-pending" />
          <StatCard icon={CheckCircle2} label="Lifetime earned" value={fmt(stats.paidCommissionCents)} sub="paid out" color="text-green-400" testid="stat-paid" />
          <StatCard icon={Inbox} label="Leads this month" value={stats.leadsThisMonth.toString()} sub={`${stats.conversionRate}% conversion`} testid="stat-leads" />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="customers">
          <TabsList>
            <TabsTrigger value="customers" data-testid="tab-customers"><Users className="w-3.5 h-3.5 mr-1" /> Customers</TabsTrigger>
            <TabsTrigger value="commissions" data-testid="tab-commissions"><DollarSign className="w-3.5 h-3.5 mr-1" /> Commissions</TabsTrigger>
            <TabsTrigger value="leads" data-testid="tab-leads"><Inbox className="w-3.5 h-3.5 mr-1" /> Leads</TabsTrigger>
            <TabsTrigger value="payouts" data-testid="tab-payouts"><TrendingUp className="w-3.5 h-3.5 mr-1" /> Payouts</TabsTrigger>
            <TabsTrigger value="assets" data-testid="tab-assets"><FileText className="w-3.5 h-3.5 mr-1" /> Marketing assets</TabsTrigger>
          </TabsList>

          <TabsContent value="customers">
            <Card>
              <CardHeader><CardTitle className="text-base">Customers attributed to you</CardTitle></CardHeader>
              <CardContent>
                {customers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-customers">No customers yet. Share your referral link to start earning.</p>
                ) : (
                  <div className="space-y-2">
                    {customers.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-card/40 border border-border/40" data-testid={`row-customer-${c.id}`}>
                        <div>
                          <p className="text-sm font-mono text-muted-foreground">{c.userId.slice(0, 12)}…</p>
                          <p className="text-xs text-muted-foreground">Attributed {new Date(c.attributedAt).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{fmt(c.lifetimeValueCents)}</p>
                          <Badge variant="outline" className="text-[10px]">{c.firstPaidAt ? "paying" : "free trial"}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="commissions">
            <Card>
              <CardHeader><CardTitle className="text-base">Commission ledger</CardTitle></CardHeader>
              <CardContent>
                {commissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-commissions">No commissions earned yet.</p>
                ) : (
                  <div className="space-y-2">
                    {commissions.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-card/40 border border-border/40" data-testid={`row-commission-${c.id}`}>
                        <div>
                          <p className="text-sm font-medium">{c.description || `${c.periodMonth} commission`}</p>
                          <p className="text-xs text-muted-foreground">Period: {c.periodMonth} • {c.commissionPercent}% of {fmt(c.baseAmountCents)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-400">+{fmt(c.amountCents)}</p>
                          <Badge variant="outline" className={
                            c.status === "paid" ? "bg-green-500/10 text-green-400 border-green-500/30 text-[10px]" :
                            c.status === "approved" ? "bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px]" :
                            "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[10px]"
                          }>{c.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads">
            <Card>
              <CardHeader><CardTitle className="text-base">Inbound leads from {partner.countryName}</CardTitle></CardHeader>
              <CardContent>
                {leads.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-leads">No leads yet. Inbound prospects from your country will appear here.</p>
                ) : (
                  <div className="space-y-2">
                    {leads.map(l => (
                      <div key={l.id} className="p-3 rounded-lg bg-card/40 border border-border/40 space-y-1" data-testid={`row-lead-${l.id}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{l.name}</p>
                          <Badge variant="outline" className="text-[10px]">{l.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{l.email} {l.phone ? `• ${l.phone}` : ""} {l.company ? `• ${l.company}` : ""}</p>
                        {l.message && <p className="text-xs text-muted-foreground line-clamp-2 pt-1">{l.message}</p>}
                        <p className="text-[10px] text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payouts">
            <Card>
              <CardHeader><CardTitle className="text-base">Payout history</CardTitle></CardHeader>
              <CardContent>
                {payouts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-payouts">No payouts yet. Payouts are processed monthly when balance exceeds $50.</p>
                ) : (
                  <div className="space-y-2">
                    {payouts.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-card/40 border border-border/40" data-testid={`row-payout-${p.id}`}>
                        <div>
                          <p className="text-sm font-medium">Payout via {p.method}</p>
                          <p className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}{p.reference ? ` • Ref: ${p.reference}` : ""}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">{fmt(p.amountCents)}</p>
                          <Badge variant="outline" className={
                            p.status === "paid" ? "bg-green-500/10 text-green-400 border-green-500/30 text-[10px]" :
                            "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[10px]"
                          }>{p.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assets">
            <Card>
              <CardHeader><CardTitle className="text-base">Marketing & sales asset library</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {ASSETS.map(a => (
                    <div key={a.name} className="flex items-center justify-between p-3 rounded-lg bg-card/40 border border-border/40 hover-elevate" data-testid={`row-asset-${a.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{a.desc}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="secondary" className="text-[10px]">{a.category}</Badge>
                        <Button size="sm" variant="ghost" onClick={() => toast({ title: "Coming soon", description: "Asset library is being prepared. Contact partners@afroaigroup.com for early access." })}>
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "text-foreground", testid }: any) {
  return (
    <Card data-testid={testid}>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        </div>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
