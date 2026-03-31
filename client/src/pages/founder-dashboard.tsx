import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Folder,
  Globe,
  MessageSquare,
  MessagesSquare,
  Crown,
  TrendingUp,
  Activity,
  ExternalLink,
  Ban,
  CheckCircle,
  DollarSign,
  Coins,
  ShoppingBag,
  AlertTriangle,
  BarChart3,
  CreditCard,
  Gift,
  Receipt,
  CircleCheck,
  CircleX,
  Clock,
  PhoneCall,
  Bot,
  Store,
  FileText,
  Mail,
  HardDrive,
  Zap,
  ClipboardList,
  UserCheck,
  Trash2,
  RefreshCw,
} from "lucide-react";

interface PlatformStats {
  totalUsers: number;
  totalProjects: number;
  totalPublishedApps: number;
  totalConversations: number;
  totalMessages: number;
  suspendedApps: number;
  totalDomainOrders: number;
  planBreakdown: { starter: number; pro: number; business: number; payg: number; other: number };
  estimatedMRR: number;
  totalPaygBalanceCents: number;
  totalPaygSpentCents: number;
  // USSD
  totalUssdSubscriptions: number;
  activeUssdSubscriptions: number;
  ussdPlanBreakdown: { starter: number; growth: number; enterprise: number };
  // Chatbot
  totalChatbots: number;
  activeChatbots: number;
  totalChatbotConversations: number;
  // Marketplace
  totalMarketplaceListings: number;
  totalMarketplaceDownloads: number;
  // Blog
  totalBlogPosts: number;
  publishedBlogPosts: number;
  // Email
  totalEmailSubscribers: number;
  activeEmailSubscribers: number;
  totalEmailCampaigns: number;
  // Files
  totalUserFiles: number;
  totalZipExports: number;
  // Webhooks
  totalWebhooks: number;
  activeWebhooks: number;
  // Forms
  totalForms: number;
  totalFormSubmissions: number;
  // Recent lists
  recentUsers: any[];
  recentProjects: any[];
  recentPublishedApps: any[];
  recentDomainOrders: any[];
  recentUssdSubs: any[];
  recentChatbots: any[];
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <Card data-testid={`stat-card-${label.toLowerCase().replace(/\s/g, "-")}`} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold leading-tight">{value}</p>
            <p className="text-xs text-muted-foreground leading-snug mt-0.5">{label}</p>
            {sub && <p className="text-xs text-primary mt-1 font-medium">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{children}</p>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-muted text-muted-foreground",
  pro: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  business: "bg-primary/10 text-primary border-primary/30",
  payg: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
};

export default function FounderDashboardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isFounder = (user as any)?.isFounder === true;
  const { toast } = useToast();

  const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({});
  const [creditAmount, setCreditAmount] = useState<Record<string, string>>({});

  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/stats"],
    enabled: isFounder,
  });

  const { data: affiliateApps } = useQuery<any[]>({
    queryKey: ["/api/affiliate/applications"],
    enabled: isFounder,
  });

  const { data: allPayments = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/payments"],
    enabled: isFounder,
    refetchInterval: 30000,
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/payments/reconcile");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: `Reconciliation complete`,
        description: `Checked ${data.checked} pending payment(s) — ${data.activated} activated, ${data.failed} failed.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Reconciliation failed", description: err.message, variant: "destructive" });
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/payments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      toast({ title: "Payment record deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const updateAffiliateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/affiliate/applications/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate/applications"] });
      toast({ title: "Status updated" });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      await apiRequest("POST", `/api/admin/published-apps/${id}/suspend`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "App suspended", description: "The app is now offline." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to suspend app", variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/published-apps/${id}/reactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "App reactivated", description: "The app is back online." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to reactivate app", variant: "destructive" });
    },
  });

  const setPlanMutation = useMutation({
    mutationFn: async ({ userId, plan }: { userId: string; plan: string }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/set-plan`, { plan });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Plan updated", description: `User plan changed to ${vars.plan}.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update plan", variant: "destructive" });
    },
  });

  const addCreditsMutation = useMutation({
    mutationFn: async ({ userId, dollars }: { userId: string; dollars: string }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/add-credits`, { dollars });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Credits added", description: `$${vars.dollars} PAYG credits added.` });
      setCreditAmount(prev => ({ ...prev, [vars.userId]: "" }));
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to add credits", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!isFounder) setLocation("/dashboard");
  }, [isFounder, setLocation]);

  if (!isFounder) return null;

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto min-h-0">
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1,2,3,4,5,6,7,8].map(i => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-14 w-full" /></CardContent></Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const pb = stats?.planBreakdown ?? { starter: 0, pro: 0, business: 0, payg: 0, other: 0 };
  const mrrDisplay = `$${(stats?.estimatedMRR ?? 0).toFixed(2)}`;
  const paygSpent = `$${((stats?.totalPaygSpentCents ?? 0) / 100).toFixed(2)}`;
  const paygBalance = `$${((stats?.totalPaygBalanceCents ?? 0) / 100).toFixed(2)}`;

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Crown className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-founder-title">Founder Dashboard</h1>
            <p className="text-sm text-muted-foreground">Complete platform overview — KEYO TECHNOLOGIES</p>
          </div>
        </div>

        {/* Core Platform Stats */}
        <div className="space-y-3">
          <SectionLabel>Core Platform</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Users} label="Total Users" value={stats?.totalUsers ?? 0} color="bg-blue-500/10 text-blue-500" />
            <StatCard icon={Folder} label="Projects" value={stats?.totalProjects ?? 0} color="bg-primary/10 text-primary" />
            <StatCard icon={Globe} label="Published Apps" value={stats?.totalPublishedApps ?? 0} color="bg-green-500/10 text-green-500" />
            <StatCard icon={AlertTriangle} label="Suspended Apps" value={stats?.suspendedApps ?? 0} color="bg-red-500/10 text-red-500" />
          </div>
        </div>

        {/* AI & Revenue Stats */}
        <div className="space-y-3">
          <SectionLabel>AI Activity & Revenue</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={MessagesSquare} label="Conversations" value={stats?.totalConversations ?? 0} color="bg-purple-500/10 text-purple-500" />
            <StatCard icon={MessageSquare} label="AI Messages" value={stats?.totalMessages ?? 0} color="bg-orange-500/10 text-orange-500" />
            <StatCard icon={DollarSign} label="Est. Monthly Revenue" value={mrrDisplay} color="bg-green-500/10 text-green-500" />
            <StatCard icon={ShoppingBag} label="Domain Orders" value={stats?.totalDomainOrders ?? 0} color="bg-indigo-500/10 text-indigo-500" />
          </div>
        </div>

        {/* Features Stats */}
        <div className="space-y-3">
          <SectionLabel>Platform Features</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={PhoneCall} label="USSD Subscriptions" value={stats?.activeUssdSubscriptions ?? 0} sub={`${stats?.totalUssdSubscriptions ?? 0} total`} color="bg-amber-500/10 text-amber-500" />
            <StatCard icon={Bot} label="AI Chatbots" value={stats?.activeChatbots ?? 0} sub={`${stats?.totalChatbotConversations ?? 0} conversations`} color="bg-cyan-500/10 text-cyan-500" />
            <StatCard icon={Store} label="Marketplace Listings" value={stats?.totalMarketplaceListings ?? 0} sub={`${stats?.totalMarketplaceDownloads ?? 0} clones`} color="bg-violet-500/10 text-violet-500" />
            <StatCard icon={FileText} label="Blog Posts" value={stats?.publishedBlogPosts ?? 0} sub={`${stats?.totalBlogPosts ?? 0} total`} color="bg-rose-500/10 text-rose-500" />
          </div>
        </div>

        {/* Communication & Data */}
        <div className="space-y-3">
          <SectionLabel>Communication & Data</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Mail} label="Email Subscribers" value={stats?.activeEmailSubscribers ?? 0} sub={`${stats?.totalEmailCampaigns ?? 0} campaigns`} color="bg-sky-500/10 text-sky-500" />
            <StatCard icon={HardDrive} label="Uploaded Files" value={stats?.totalUserFiles ?? 0} sub={`${stats?.totalZipExports ?? 0} ZIP exports`} color="bg-teal-500/10 text-teal-500" />
            <StatCard icon={ClipboardList} label="Forms" value={stats?.totalForms ?? 0} sub={`${stats?.totalFormSubmissions ?? 0} submissions`} color="bg-lime-500/10 text-lime-500" />
            <StatCard icon={Zap} label="Webhooks" value={stats?.activeWebhooks ?? 0} sub={`${stats?.totalWebhooks ?? 0} total`} color="bg-yellow-500/10 text-yellow-500" />
          </div>
        </div>

        {/* Plan breakdown + PAYG */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Plan Breakdown</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Starter (Free)", value: pb.starter, color: "text-muted-foreground", bg: "bg-muted/50" },
                  { label: "Pro ($15/mo)", value: pb.pro, color: "text-blue-400", bg: "bg-blue-500/10" },
                  { label: "Business ($29.90/mo)", value: pb.business, color: "text-primary", bg: "bg-primary/10" },
                  { label: "Pay As You Go", value: pb.payg, color: "text-yellow-400", bg: "bg-yellow-500/10" },
                ].map(p => (
                  <div key={p.label} className={`${p.bg} rounded-lg p-3`} data-testid={`plan-count-${p.label.split(" ")[0].toLowerCase()}`}>
                    <p className={`text-2xl font-bold ${p.color}`}>{p.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Coins className="w-4 h-4 text-yellow-400" />
                <h3 className="font-semibold text-sm">PAYG & Revenue</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Est. Monthly Revenue (MRR)</span>
                  <span className="font-bold text-green-400" data-testid="text-mrr">{mrrDisplay}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Total PAYG Spent (all users)</span>
                  <span className="font-bold text-primary" data-testid="text-payg-spent">{paygSpent}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Total PAYG Balance (remaining)</span>
                  <span className="font-bold" data-testid="text-payg-balance">{paygBalance}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">Platform Health</span>
                  <span className="font-bold text-green-400">
                    {stats && stats.totalProjects > 0
                      ? ((stats.totalPublishedApps / stats.totalProjects) * 100).toFixed(0) + "% publish rate"
                      : "—"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* USSD + Chatbot + Feature Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* USSD Subscriptions */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 p-4 border-b">
                <PhoneCall className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-sm">USSD Subscriptions</h3>
                <Badge variant="secondary" className="ml-auto text-xs">{stats?.activeUssdSubscriptions ?? 0} active</Badge>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border/50 border-b">
                {[
                  { label: "Starter", value: stats?.ussdPlanBreakdown?.starter ?? 0, color: "text-muted-foreground", price: "$29" },
                  { label: "Growth", value: stats?.ussdPlanBreakdown?.growth ?? 0, color: "text-blue-400", price: "$79" },
                  { label: "Enterprise", value: stats?.ussdPlanBreakdown?.enterprise ?? 0, color: "text-amber-400", price: "$199" },
                ].map(p => (
                  <div key={p.label} className="p-3 text-center">
                    <p className={`text-xl font-bold ${p.color}`}>{p.value}</p>
                    <p className="text-[10px] text-muted-foreground">{p.label}</p>
                    <p className="text-[10px] text-muted-foreground">{p.price}/mo</p>
                  </div>
                ))}
              </div>
              <ScrollArea className="h-[280px]">
                <div className="p-2 space-y-1">
                  {stats?.recentUssdSubs && stats.recentUssdSubs.length > 0 ? (
                    stats.recentUssdSubs.map((s: any) => (
                      <div key={s.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`ussd-sub-${s.id}`}>
                        <div className="w-7 h-7 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <PhoneCall className="w-3.5 h-3.5 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium capitalize">{s.plan} Plan</p>
                          <p className="text-[10px] text-muted-foreground">{s.userId?.slice(0, 12)}... · {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—"}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] px-1.5 flex-shrink-0 ${s.status === "active" ? "text-green-400 border-green-500/30" : "text-red-400 border-red-500/30"}`}>
                          {s.status}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No USSD subscriptions yet</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Chatbot API */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 p-4 border-b">
                <Bot className="w-4 h-4 text-cyan-500" />
                <h3 className="font-semibold text-sm">Chatbot API</h3>
                <Badge variant="secondary" className="ml-auto text-xs">{stats?.activeChatbots ?? 0} active</Badge>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border/50 border-b">
                {[
                  { label: "Total Bots", value: stats?.totalChatbots ?? 0, color: "text-cyan-400" },
                  { label: "Active Bots", value: stats?.activeChatbots ?? 0, color: "text-green-400" },
                  { label: "Conversations", value: stats?.totalChatbotConversations ?? 0, color: "text-purple-400" },
                ].map(p => (
                  <div key={p.label} className="p-3 text-center">
                    <p className={`text-xl font-bold ${p.color}`}>{p.value}</p>
                    <p className="text-[10px] text-muted-foreground">{p.label}</p>
                  </div>
                ))}
              </div>
              <ScrollArea className="h-[280px]">
                <div className="p-2 space-y-1">
                  {stats?.recentChatbots && stats.recentChatbots.length > 0 ? (
                    stats.recentChatbots.map((c: any) => (
                      <div key={c.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`chatbot-row-${c.id}`}>
                        <div className="w-7 h-7 rounded-md bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-3.5 h-3.5 text-cyan-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{c.websiteUrl || "No website"}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] px-1.5 flex-shrink-0 ${c.isActive ? "text-green-400 border-green-500/30" : "text-red-400 border-red-500/30"}`}>
                          {c.isActive ? "active" : "off"}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No chatbots created yet</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Feature Usage Grid */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 p-4 border-b">
                <Activity className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Feature Usage</h3>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                {[
                  { icon: Store, label: "Marketplace", value: stats?.totalMarketplaceListings ?? 0, sub: `${stats?.totalMarketplaceDownloads ?? 0} clones`, color: "text-violet-400 bg-violet-500/10" },
                  { icon: FileText, label: "Blog Posts", value: stats?.publishedBlogPosts ?? 0, sub: `${stats?.totalBlogPosts ?? 0} total`, color: "text-rose-400 bg-rose-500/10" },
                  { icon: Mail, label: "Email Subs", value: stats?.activeEmailSubscribers ?? 0, sub: `${stats?.totalEmailCampaigns ?? 0} campaigns`, color: "text-sky-400 bg-sky-500/10" },
                  { icon: HardDrive, label: "Files", value: stats?.totalUserFiles ?? 0, sub: `${stats?.totalZipExports ?? 0} ZIP exports`, color: "text-teal-400 bg-teal-500/10" },
                  { icon: ClipboardList, label: "Forms", value: stats?.totalForms ?? 0, sub: `${stats?.totalFormSubmissions ?? 0} submissions`, color: "text-lime-400 bg-lime-500/10" },
                  { icon: Zap, label: "Webhooks", value: stats?.activeWebhooks ?? 0, sub: `${stats?.totalWebhooks ?? 0} registered`, color: "text-yellow-400 bg-yellow-500/10" },
                  { icon: ShoppingBag, label: "Domains", value: stats?.totalDomainOrders ?? 0, sub: "registered", color: "text-indigo-400 bg-indigo-500/10" },
                  { icon: UserCheck, label: "Affiliates", value: affiliateApps?.filter((a: any) => a.status === "approved").length ?? 0, sub: `${affiliateApps?.length ?? 0} applied`, color: "text-primary bg-primary/10" },
                ].map(item => (
                  <div key={item.label} className={`rounded-lg p-3 ${item.color.split(" ")[1]}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <item.icon className={`w-3.5 h-3.5 ${item.color.split(" ")[0]}`} />
                      <span className="text-[10px] text-muted-foreground">{item.label}</span>
                    </div>
                    <p className={`text-xl font-bold ${item.color.split(" ")[0]}`}>{item.value}</p>
                    <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Users + Apps + Domains */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Users */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 p-4 border-b">
                <Users className="w-4 h-4 text-blue-500" />
                <h3 className="font-semibold text-sm">Users</h3>
                <Badge variant="secondary" className="ml-auto text-xs">{stats?.totalUsers ?? 0}</Badge>
              </div>
              <ScrollArea className="h-[400px]">
                <div className="p-2 space-y-1">
                  {stats?.recentUsers && stats.recentUsers.length > 0 ? (
                    stats.recentUsers.map((u: any) => (
                      <div key={u.id} className="p-2 rounded-md hover:bg-muted/50 transition-colors space-y-2" data-testid={`admin-user-${u.id}`}>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7">
                            <AvatarImage src={u.profileImageUrl || undefined} />
                            <AvatarFallback className="bg-blue-500/10 text-blue-500 text-xs">
                              {(u.firstName || "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{u.firstName} {u.lastName}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                          </div>
                          <Badge variant="outline" className={`text-[10px] px-1.5 flex-shrink-0 ${PLAN_COLORS[u.plan || "starter"]}`}>
                            {u.plan || "starter"}
                          </Badge>
                        </div>
                        {/* Admin actions */}
                        <div className="flex items-center gap-1 pl-9">
                          <Select
                            value={selectedPlan[u.id] || u.plan || "starter"}
                            onValueChange={(v) => setSelectedPlan(prev => ({ ...prev, [u.id]: v }))}
                          >
                            <SelectTrigger className="h-6 text-[10px] w-24 px-1.5" data-testid={`select-plan-${u.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="starter">Starter</SelectItem>
                              <SelectItem value="pro">Pro</SelectItem>
                              <SelectItem value="business">Business</SelectItem>
                              <SelectItem value="payg">PAYG</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2"
                            disabled={setPlanMutation.isPending}
                            onClick={() => setPlanMutation.mutate({ userId: u.id, plan: selectedPlan[u.id] || u.plan || "starter" })}
                            data-testid={`button-set-plan-${u.id}`}
                          >
                            Set
                          </Button>
                          <Input
                            type="number"
                            placeholder="$"
                            className="h-6 text-[10px] w-14 px-1.5"
                            value={creditAmount[u.id] || ""}
                            onChange={(e) => setCreditAmount(prev => ({ ...prev, [u.id]: e.target.value }))}
                            data-testid={`input-credits-${u.id}`}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2 text-yellow-400 border-yellow-500/30"
                            disabled={addCreditsMutation.isPending || !creditAmount[u.id]}
                            onClick={() => addCreditsMutation.mutate({ userId: u.id, dollars: creditAmount[u.id] })}
                            data-testid={`button-add-credits-${u.id}`}
                          >
                            +₵
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No users yet</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Published Apps */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 p-4 border-b">
                <Globe className="w-4 h-4 text-green-500" />
                <h3 className="font-semibold text-sm">Published Apps</h3>
                <Badge variant="secondary" className="ml-auto text-xs">{stats?.totalPublishedApps ?? 0}</Badge>
                {(stats?.suspendedApps ?? 0) > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5">{stats?.suspendedApps} suspended</Badge>
                )}
              </div>
              <ScrollArea className="h-[400px]">
                <div className="p-2 space-y-1">
                  {stats?.recentPublishedApps && stats.recentPublishedApps.length > 0 ? (
                    stats.recentPublishedApps.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`admin-app-${a.id}`}>
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${a.appStatus === "suspended" ? "bg-red-500/10" : "bg-green-500/10"}`}>
                          <Globe className={`w-3.5 h-3.5 ${a.appStatus === "suspended" ? "text-red-500" : "text-green-500"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-medium truncate">{a.title}</p>
                            {a.appStatus === "suspended" && (
                              <Badge variant="destructive" className="text-[10px] px-1 py-0">⏸</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{a.subdomain}.afroaigroup.com</p>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {a.appStatus === "suspended" ? (
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-green-500 hover:bg-green-500/10"
                              onClick={() => reactivateMutation.mutate(a.id)} disabled={reactivateMutation.isPending}
                              title="Reactivate" data-testid={`button-reactivate-${a.id}`}>
                              <CheckCircle className="w-3.5 h-3.5" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:bg-red-500/10"
                              onClick={() => suspendMutation.mutate({ id: a.id, reason: "Suspended by administrator" })}
                              disabled={suspendMutation.isPending} title="Suspend" data-testid={`button-suspend-${a.id}`}>
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <a href={`/site/${a.subdomain}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No published apps yet</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Domain Orders */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 p-4 border-b">
                <ShoppingBag className="w-4 h-4 text-indigo-500" />
                <h3 className="font-semibold text-sm">Domain Orders</h3>
                <Badge variant="secondary" className="ml-auto text-xs">{stats?.totalDomainOrders ?? 0}</Badge>
              </div>
              <ScrollArea className="h-[400px]">
                <div className="p-2 space-y-1">
                  {stats?.recentDomainOrders && stats.recentDomainOrders.length > 0 ? (
                    stats.recentDomainOrders.map((d: any) => (
                      <div key={d.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`admin-domain-${d.id}`}>
                        <div className="w-7 h-7 rounded-md bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                          <Globe className="w-3.5 h-3.5 text-indigo-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{d.domain}</p>
                          <p className="text-[10px] text-muted-foreground">${((d.amountUsd || 0)).toFixed(2)} · {new Date(d.createdAt).toLocaleDateString()}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] px-1.5 flex-shrink-0 ${
                          d.status === "active" ? "text-green-400 border-green-500/30" :
                          d.status === "pending" ? "text-yellow-400 border-yellow-500/30" : ""
                        }`}>
                          {d.status}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No domain orders yet</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Affiliate Applications */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-2 p-4 border-b">
              <Gift className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Affiliate Applications</h3>
              <Badge variant="secondary" className="ml-auto text-xs">{affiliateApps?.length ?? 0}</Badge>
            </div>
            <ScrollArea className="h-[300px]">
              <div className="p-2 space-y-1">
                {affiliateApps && affiliateApps.length > 0 ? (
                  affiliateApps.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`affiliate-app-${a.id}`}>
                      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Gift className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{a.fullName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{a.email} · <span className="text-primary font-mono">{a.referralCode}</span></p>
                        {a.country && <p className="text-[10px] text-muted-foreground">{a.country}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Badge variant="outline" className={`text-[10px] px-1.5 ${
                          a.status === "approved" ? "text-green-400 border-green-500/30" :
                          a.status === "rejected" ? "text-red-400 border-red-500/30" :
                          "text-yellow-400 border-yellow-500/30"
                        }`}>
                          {a.status}
                        </Badge>
                        {a.status === "pending" && (
                          <>
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-green-400 hover:text-green-300" onClick={() => updateAffiliateMutation.mutate({ id: a.id, status: "approved" })} data-testid={`button-approve-affiliate-${a.id}`}>
                              <CheckCircle className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-red-400 hover:text-red-300" onClick={() => updateAffiliateMutation.mutate({ id: a.id, status: "rejected" })} data-testid={`button-reject-affiliate-${a.id}`}>
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No affiliate applications yet</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Payment Activity Log (IPN Events) */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-2 p-4 border-b border-border/60">
              <Receipt className="w-4 h-4 text-green-400" />
              <h3 className="font-semibold text-sm">Payment Activity Log</h3>
              <Badge variant="secondary" className="ml-auto text-xs">{allPayments.length} records</Badge>
              <span className="text-xs text-muted-foreground hidden sm:block">Auto-refreshes every 30s</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => reconcileMutation.mutate()}
                disabled={reconcileMutation.isPending}
                data-testid="button-recheck-payments"
              >
                <RefreshCw className={`w-3 h-3 ${reconcileMutation.isPending ? "animate-spin" : ""}`} />
                {reconcileMutation.isPending ? "Checking…" : "Recheck"}
              </Button>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-3 divide-x divide-border/50 border-b border-border/60">
              {[
                {
                  label: "Successful",
                  count: allPayments.filter(p => p.status === "completed").length,
                  total: allPayments.filter(p => p.status === "completed").reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0),
                  color: "text-green-400",
                  icon: CircleCheck,
                },
                {
                  label: "Pending",
                  count: allPayments.filter(p => p.status === "pending").length,
                  total: allPayments.filter(p => p.status === "pending").reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0),
                  color: "text-yellow-400",
                  icon: Clock,
                },
                {
                  label: "Failed",
                  count: allPayments.filter(p => p.status === "failed").length,
                  total: allPayments.filter(p => p.status === "failed").reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0),
                  color: "text-red-400",
                  icon: CircleX,
                },
              ].map(s => (
                <div key={s.label} className="p-4 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                  </div>
                  <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
                  <p className="text-xs text-muted-foreground">${s.total.toFixed(2)} total</p>
                </div>
              ))}
            </div>

            <ScrollArea className="h-80">
              {allPayments.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {allPayments.map((p: any) => {
                    const statusIcon = p.status === "completed"
                      ? <CircleCheck className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                      : p.status === "failed"
                      ? <CircleX className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      : <Clock className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />;
                    const statusColor = p.status === "completed"
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : p.status === "failed"
                      ? "bg-red-500/10 text-red-400 border-red-500/20"
                      : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors" data-testid={`payment-row-${p.id}`}>
                        {statusIcon}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{p.plan}</span>
                            <Badge variant="outline" className={`text-xs ${statusColor}`}>{p.status}</Badge>
                            {p.paymentMethod && <span className="text-xs text-muted-foreground hidden sm:block">{p.paymentMethod}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground font-mono truncate">{p.merchantReference}</span>
                            {p.pesapalTrackingId && (
                              <span className="text-xs text-muted-foreground hidden md:block">· Pesapal: {p.pesapalTrackingId}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-green-400">${parseFloat(p.amount || 0).toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">{p.currency}</p>
                        </div>
                        <div className="text-right flex-shrink-0 hidden sm:block">
                          <p className="text-xs text-muted-foreground">
                            {p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {p.createdAt ? new Date(p.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 flex-shrink-0 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => { if (confirm("Delete this payment record?")) deletePaymentMutation.mutate(p.id); }}
                          disabled={deletePaymentMutation.isPending}
                          data-testid={`button-delete-payment-${p.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-muted-foreground">
                  <Receipt className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No payment records yet</p>
                  <p className="text-xs">Payments appear here instantly when Pesapal sends an IPN notification</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Platform Health */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Platform Health</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-xs font-medium">Avg Msg/Conv</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-avg-messages">
                  {stats && stats.totalConversations > 0 ? (stats.totalMessages / stats.totalConversations).toFixed(1) : "0"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium">Avg Projects/User</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-avg-projects">
                  {stats && stats.totalUsers > 0 ? (stats.totalProjects / stats.totalUsers).toFixed(1) : "0"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-xs font-medium">Publish Rate</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-publish-rate">
                  {stats && stats.totalProjects > 0 ? ((stats.totalPublishedApps / stats.totalProjects) * 100).toFixed(0) + "%" : "0%"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs font-medium">Paying Users</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-paying-users">
                  {pb.pro + pb.business + pb.payg}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats && stats.totalUsers > 0
                    ? (((pb.pro + pb.business + pb.payg) / stats.totalUsers) * 100).toFixed(0) + "% conversion"
                    : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Admin command centre link */}
        <div className="text-center pb-4">
          <a href="/admin-command">
            <Button variant="outline" className="gap-2" data-testid="button-admin-command">
              <Crown className="w-4 h-4 text-primary" />
              Open AI Admin Command Centre
            </Button>
          </a>
        </div>

      </div>
    </div>
  );
}
