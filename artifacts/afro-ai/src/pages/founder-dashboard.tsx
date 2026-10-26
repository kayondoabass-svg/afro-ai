import { useEffect, useState, type ReactNode } from "react";
import { formatPaymentAmount, paymentTotalsByCurrency } from "@/lib/payment-currency";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { FounderOperations, safeFounderAppHref, type SectionId } from "@/components/founder/FounderOperations";
import { FounderAlertCenter } from "@/components/founder/FounderAlertCenter";
import FounderProgrammes from "@/components/programmes/FounderProgrammes";
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
  Trash2,
  RefreshCw,
  Network,
  Smartphone,
  Copy,
  PartyPopper,
  Hourglass,
  Download,
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

function StatCard({ icon: Icon, label, value, sub, color, onClick }: {
  icon: any; label: string; value: string | number; sub?: string; color: string; onClick?: () => void;
}) {
  return (
    <Card data-testid={`stat-card-${label.toLowerCase().replace(/\s/g, "-")}`} className={`transition-shadow ${onClick ? "hover:shadow-md focus-within:ring-2 focus-within:ring-ring" : ""}`}>
      <CardContent className="p-4">
        <button type="button" onClick={onClick} disabled={!onClick} aria-label={onClick ? `View ${label} records` : undefined} className={`flex w-full items-start gap-3 text-left ${onClick ? "rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : "cursor-default"}`}>
          <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold leading-tight">{value}</p>
            <p className="text-xs text-muted-foreground leading-snug mt-0.5">{label}</p>
            {sub && <p className="text-xs text-primary mt-1 font-medium">{sub}</p>}
          </div>
        </button>
      </CardContent>
    </Card>
  );
}

function AfricasTalkingPanel() {
  const { toast } = useToast();
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState("Hello from Afro AI");

  const { data: status, isLoading, refetch } = useQuery<{
    configured: boolean;
    mode: "sandbox" | "live" | "unconfigured";
    balance?: number | null;
    currency?: string | null;
    raw?: string;
    error?: string;
  }>({ queryKey: ["/api/founder/at/status"] });

  const sendTest = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/founder/at/test-sms", { to: testTo, message: testMsg });
      return res.json();
    },
    onSuccess: (data: any) => {
      const r = data.recipients?.[0];
      toast({
        title: "Test SMS submitted",
        description: r ? `${r.status} — cost ${r.cost}` : data.summary || "Sent",
      });
      refetch();
    },
    onError: (e: any) => toast({ title: "Test SMS failed", description: e.message, variant: "destructive" }),
  });

  const modeColor =
    status?.mode === "live" ? "text-green-400" :
    status?.mode === "sandbox" ? "text-yellow-400" :
    "text-muted-foreground";

  return (
    <div className="rounded border border-border/50 bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className={`w-4 h-4 ${modeColor}`} />
          <span className="font-medium text-sm">Africa's Talking</span>
          {isLoading ? (
            <Badge variant="outline" className="text-[10px]">Checking…</Badge>
          ) : status?.configured ? (
            <Badge variant="outline" className={`text-[10px] ${status.mode === "live" ? "border-green-500/40 text-green-400" : "border-yellow-500/40 text-yellow-400"}`}>
              {status.mode === "live" ? "Live" : "Sandbox"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] border-red-500/40 text-red-400">Not configured</Badge>
          )}
        </div>
        <div className="text-right">
          {status?.configured && status.balance !== null && status.balance !== undefined ? (
            <div className="text-sm" data-testid="text-at-balance">
              <span className="font-bold text-primary">{status.currency} {status.balance.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground ml-1">balance</span>
            </div>
          ) : status?.error ? (
            <button onClick={() => refetch()} className="text-[11px] text-red-400 hover:text-red-300 underline" data-testid="button-at-retry">
              Balance unavailable — retry
            </button>
          ) : null}
        </div>
      </div>

      {status?.configured && (
        <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-2 items-end pt-1 border-t border-border/30">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">To (with country code)</label>
            <Input
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              placeholder="+256700000000"
              className="h-8 text-xs"
              data-testid="input-at-test-to"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Message</label>
            <Input
              value={testMsg}
              onChange={e => setTestMsg(e.target.value)}
              className="h-8 text-xs"
              data-testid="input-at-test-msg"
            />
          </div>
          <Button
            size="sm"
            onClick={() => sendTest.mutate()}
            disabled={!testTo || !testMsg || sendTest.isPending}
            data-testid="button-at-test-send"
          >
            {sendTest.isPending ? "Sending…" : "Send test SMS"}
          </Button>
        </div>
      )}
      {status?.mode === "sandbox" && (
        <p className="text-[10px] text-muted-foreground">
          Sandbox mode — messages won't actually deliver. Switch <code>AFRICASTALKING_USERNAME</code> to your live username when ready.
        </p>
      )}
      {status?.error && (
        <p className="text-[10px] text-red-400/80 break-words">
          {status.error.length > 200 ? status.error.slice(0, 200) + "…" : status.error}
        </p>
      )}
    </div>
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
  const installStats = useQuery<{ total: number }>({
    queryKey: ["/api/admin/app-installs"],
    enabled: isFounder,
    refetchInterval: 60_000,
  });
  const { toast } = useToast();

  const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({});
  const [creditAmount, setCreditAmount] = useState<Record<string, string>>({});
  const [founderSection, setFounderSection] = useState<SectionId | null>(null);
  const [founderStatus, setFounderStatus] = useState("");
  const [founderOwner, setFounderOwner] = useState("");
  const [founderId, setFounderId] = useState("");
  const openFounderRecords = (section: SectionId, status = "", id = "", owner = "") => {
    setFounderStatus(status);
    setFounderId(id);
    setFounderOwner(owner);
    setFounderSection(section);
    window.setTimeout(() => document.getElementById("founder-records")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 50);
  };

  const { data: stats, isLoading, isError: statsError } = useQuery<PlatformStats & { unavailableSections?: string[] }>({
    queryKey: ["/api/admin/stats"],
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

  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [sentEmails, setSentEmails] = useState<Record<string, boolean>>({});

  const sendPaymentEmailMutation = useMutation({
    mutationFn: async ({ id, type }: { id: number; type: "congrats" | "nudge" }) => {
      const res = await apiRequest("POST", `/api/admin/payments/${id}/email`, { type });
      return res.json();
    },
    onSuccess: (data: any, vars) => {
      setSentEmails((prev) => ({ ...prev, [`${vars.id}-${vars.type}`]: true }));
      toast({ title: "Email sent", description: `Delivered to ${data.to}` });
    },
    onError: (err: any) => {
      toast({ title: "Could not send email", description: err.message, variant: "destructive" });
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

  const unavailable = (key: string) => statsError || Boolean(stats?.unavailableSections?.some(section => section.toLowerCase().includes(key.toLowerCase())));
  const metric = (key: string, value: number | undefined | null) => unavailable(key) || value == null ? "—" : value;
  const pb = unavailable("users") ? null : stats?.planBreakdown;
  const mrrDisplay = unavailable("payments") || stats?.estimatedMRR == null ? "—" : `$${stats.estimatedMRR.toFixed(2)}`;
  const paygSpent = unavailable("payments") || stats?.totalPaygSpentCents == null ? "—" : `$${(stats.totalPaygSpentCents / 100).toFixed(2)}`;
  const paygBalance = unavailable("payments") || stats?.totalPaygBalanceCents == null ? "—" : `$${(stats.totalPaygBalanceCents / 100).toFixed(2)}`;

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

        <FounderOperations isFounder={isFounder} initialSection={founderSection} initialStatus={founderStatus} initialId={founderId} initialOwner={founderOwner} onClearSection={() => { setFounderSection(null); setFounderStatus(""); setFounderId(""); setFounderOwner(""); }} />
        <FounderAlertCenter isFounder={isFounder} />

        {/* Core Platform Stats */}
        <div className="space-y-3">
          <SectionLabel>Core Platform</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Users} label="Total Users" value={metric("users", stats?.totalUsers)} color="bg-blue-500/10 text-blue-500" onClick={() => openFounderRecords("users")} />
            <StatCard icon={Folder} label="Projects" value={metric("projects", stats?.totalProjects)} color="bg-primary/10 text-primary" onClick={() => openFounderRecords("projects")} />
            <StatCard icon={Globe} label="Published Apps" value={metric("apps", stats?.totalPublishedApps)} color="bg-green-500/10 text-green-500" onClick={() => openFounderRecords("apps")} />
            <StatCard icon={AlertTriangle} label="Suspended Apps" value={metric("apps", stats?.suspendedApps)} color="bg-red-500/10 text-red-500" onClick={() => openFounderRecords("apps", "suspended")} />
            <StatCard icon={Download} label="App Downloads" value={installStats.data?.total ?? "—"} color="bg-primary/10 text-primary" onClick={() => document.getElementById("installation-explanation")?.scrollIntoView?.({ behavior: "smooth", block: "center" })} />
          </div>
          <p id="installation-explanation" tabIndex={-1} className="scroll-mt-24 text-xs text-muted-foreground">
            {installStats.isError ? "Download count is temporarily unavailable. " : ""}
            Downloads counts browser-reported installations and first detected installed-app launches since tracking began, not button clicks or unique people.
          </p>
        </div>

        {/* AI & Revenue Stats */}
        <div className="space-y-3">
          <SectionLabel>AI Activity & Revenue</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={MessagesSquare} label="Conversations" value={metric("ai-usage", stats?.totalConversations)} color="bg-purple-500/10 text-purple-500" onClick={() => openFounderRecords("ai-usage")} />
            <StatCard icon={MessageSquare} label="AI Messages" value={metric("ai-usage", stats?.totalMessages)} color="bg-orange-500/10 text-orange-500" onClick={() => openFounderRecords("ai-usage")} />
            <StatCard icon={DollarSign} label="Est. Monthly Revenue" value={mrrDisplay} color="bg-green-500/10 text-green-500" onClick={() => openFounderRecords("payments")} />
            <StatCard icon={ShoppingBag} label="Domain Orders" value={metric("domains", stats?.totalDomainOrders)} color="bg-indigo-500/10 text-indigo-500" onClick={() => openFounderRecords("domains")} />
          </div>
        </div>

        {/* Features Stats */}
        <div className="space-y-3">
          <SectionLabel>Platform Features</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={PhoneCall} label="USSD Subscriptions" value={metric("ussd", stats?.activeUssdSubscriptions)} sub={unavailable("ussd") ? "Unavailable" : `${stats?.totalUssdSubscriptions ?? "—"} total`} color="bg-amber-500/10 text-amber-500" onClick={() => openFounderRecords("ussd")} />
            <StatCard icon={Bot} label="AI Chatbots" value={metric("chatbots", stats?.activeChatbots)} sub={unavailable("chatbots") ? "Unavailable" : `${stats?.totalChatbotConversations ?? "—"} conversations`} color="bg-cyan-500/10 text-cyan-500" onClick={() => openFounderRecords("chatbots")} />
            <StatCard icon={Store} label="Marketplace Listings" value={metric("marketplace", stats?.totalMarketplaceListings)} sub={unavailable("marketplace") ? "Unavailable" : `${stats?.totalMarketplaceDownloads ?? "—"} clones`} color="bg-violet-500/10 text-violet-500" onClick={() => openFounderRecords("marketplace")} />
            <StatCard icon={FileText} label="Blog Posts" value={metric("blog", stats?.publishedBlogPosts)} sub={unavailable("blog") ? "Unavailable" : `${stats?.totalBlogPosts ?? "—"} total`} color="bg-rose-500/10 text-rose-500" onClick={() => openFounderRecords("blog")} />
          </div>
        </div>

        {/* Communication & Data */}
        <div className="space-y-3">
          <SectionLabel>Communication & Data</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Mail} label="Email Subscribers" value={metric("subscribers", stats?.activeEmailSubscribers)} sub={unavailable("subscribers") ? "Unavailable" : `${stats?.totalEmailCampaigns ?? "—"} campaigns`} color="bg-sky-500/10 text-sky-500" onClick={() => openFounderRecords("subscribers")} />
            <StatCard icon={HardDrive} label="Uploaded Files" value={metric("files", stats?.totalUserFiles)} sub={unavailable("files") ? "Unavailable" : `${stats?.totalZipExports ?? "—"} ZIP exports`} color="bg-teal-500/10 text-teal-500" onClick={() => openFounderRecords("files")} />
            <StatCard icon={ClipboardList} label="Forms" value={metric("forms", stats?.totalForms)} sub={unavailable("forms") ? "Unavailable" : `${stats?.totalFormSubmissions ?? "—"} submissions`} color="bg-lime-500/10 text-lime-500" onClick={() => openFounderRecords("forms")} />
            <StatCard icon={Zap} label="Webhooks" value={metric("webhooks", stats?.activeWebhooks)} sub={unavailable("webhooks") ? "Unavailable" : `${stats?.totalWebhooks ?? "—"} total`} color="bg-yellow-500/10 text-yellow-500" onClick={() => openFounderRecords("webhooks")} />
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
                  { label: "Starter (Free)", value: pb?.starter ?? "—", color: "text-muted-foreground", bg: "bg-muted/50" },
                  { label: "Pro ($15/mo)", value: pb?.pro ?? "—", color: "text-blue-400", bg: "bg-blue-500/10" },
                  { label: "Business ($29.90/mo)", value: pb?.business ?? "—", color: "text-primary", bg: "bg-primary/10" },
                  { label: "Pay As You Go", value: pb?.payg ?? "—", color: "text-yellow-400", bg: "bg-yellow-500/10" },
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
                <button type="button" onClick={() => openFounderRecords("payments")} className="flex w-full justify-between items-center py-2 border-b border-border/50 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="text-sm text-muted-foreground">Est. Monthly Revenue (MRR)</span>
                  <span className="font-bold text-green-400" data-testid="text-mrr">{mrrDisplay}</span>
                </button>
                <button type="button" onClick={() => openFounderRecords("payments")} className="flex w-full justify-between items-center py-2 border-b border-border/50 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="text-sm text-muted-foreground">Total PAYG Spent (all users)</span>
                  <span className="font-bold text-primary" data-testid="text-payg-spent">{paygSpent}</span>
                </button>
                <button type="button" onClick={() => openFounderRecords("payments")} className="flex w-full justify-between items-center py-2 border-b border-border/50 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="text-sm text-muted-foreground">Total PAYG Balance (remaining)</span>
                  <span className="font-bold" data-testid="text-payg-balance">{paygBalance}</span>
                </button>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">Platform Ratios</span>
                  <span className="font-bold text-green-400">
                    {!unavailable("projects") && !unavailable("apps") && stats && stats.totalProjects > 0
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
                <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={() => openFounderRecords("ussd")}>View all records</Button>
                <Badge variant="secondary" className="text-xs">{metric("ussd", stats?.activeUssdSubscriptions)} active</Badge>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border/50 border-b">
                {[
                  { label: "Starter", value: metric("ussd", stats?.ussdPlanBreakdown?.starter), color: "text-muted-foreground", price: "$29" },
                  { label: "Growth", value: metric("ussd", stats?.ussdPlanBreakdown?.growth), color: "text-blue-400", price: "$79" },
                  { label: "Enterprise", value: metric("ussd", stats?.ussdPlanBreakdown?.enterprise), color: "text-amber-400", price: "$199" },
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
                <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={() => openFounderRecords("chatbots")}>View all records</Button>
                <Badge variant="secondary" className="text-xs">{metric("chatbots", stats?.activeChatbots)} active</Badge>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border/50 border-b">
                {[
                  { label: "Total Bots", value: metric("chatbots", stats?.totalChatbots), color: "text-cyan-400" },
                  { label: "Active Bots", value: metric("chatbots", stats?.activeChatbots), color: "text-green-400" },
                  { label: "Conversations", value: metric("chatbots", stats?.totalChatbotConversations), color: "text-purple-400" },
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
                  { icon: Store, label: "Marketplace", value: metric("marketplace", stats?.totalMarketplaceListings), sub: unavailable("marketplace") ? "Unavailable" : `${stats?.totalMarketplaceDownloads ?? "—"} clones`, color: "text-violet-400 bg-violet-500/10" },
                  { icon: FileText, label: "Blog Posts", value: metric("blog", stats?.publishedBlogPosts), sub: unavailable("blog") ? "Unavailable" : `${stats?.totalBlogPosts ?? "—"} total`, color: "text-rose-400 bg-rose-500/10" },
                  { icon: Mail, label: "Email Subs", value: metric("subscribers", stats?.activeEmailSubscribers), sub: unavailable("email") || unavailable("subscribers") ? "Unavailable" : `${stats?.totalEmailCampaigns ?? "—"} campaigns`, color: "text-sky-400 bg-sky-500/10" },
                  { icon: HardDrive, label: "Files", value: metric("files", stats?.totalUserFiles), sub: unavailable("files") ? "Unavailable" : `${stats?.totalZipExports ?? "—"} ZIP exports`, color: "text-teal-400 bg-teal-500/10" },
                  { icon: ClipboardList, label: "Forms", value: metric("forms", stats?.totalForms), sub: unavailable("forms") ? "Unavailable" : `${stats?.totalFormSubmissions ?? "—"} submissions`, color: "text-lime-400 bg-lime-500/10" },
                  { icon: Zap, label: "Webhooks", value: metric("webhooks", stats?.activeWebhooks), sub: unavailable("webhooks") ? "Unavailable" : `${stats?.totalWebhooks ?? "—"} registered`, color: "text-yellow-400 bg-yellow-500/10" },
                  { icon: ShoppingBag, label: "Domains", value: metric("domains", stats?.totalDomainOrders), sub: "registered", color: "text-indigo-400 bg-indigo-500/10" },
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
                <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={() => openFounderRecords("users")}>View all records</Button>
                <Badge variant="secondary" className="text-xs">{metric("users", stats?.totalUsers)}</Badge>
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
                          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => openFounderRecords("users", "", String(u.id))} aria-label={`View user record ${u.id}`}>Details</Button>
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
                <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={() => openFounderRecords("apps")}>View all records</Button>
                <Badge variant="secondary" className="text-xs">{metric("apps", stats?.totalPublishedApps)}</Badge>
                {!unavailable("apps") && (stats?.suspendedApps ?? 0) > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5">{metric("apps", stats?.suspendedApps)} suspended</Badge>
                )}
              </div>
              <ScrollArea className="h-[400px]">
                <div className="p-2 space-y-1">
                  {stats?.recentPublishedApps && stats.recentPublishedApps.length > 0 ? (
                    stats.recentPublishedApps.map((a: any) => {
                      const liveHref = safeFounderAppHref(a);
                      return (
                      <div key={a.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`admin-app-${a.id}`}>
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${a.appStatus === "suspended" ? "bg-red-500/10" : "bg-green-500/10"}`}>
                          <Globe className={`w-3.5 h-3.5 ${a.appStatus === "suspended" ? "text-red-500" : "text-green-500"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-medium truncate">{a.title}</p>
                            {a.appStatus === "suspended" && (
                              <Badge variant="destructive" className="text-[10px] px-1 py-0">Suspended</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{a.subdomain}.afroaigroup.com</p>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => openFounderRecords("apps", "", String(a.id))} aria-label={`View app record ${a.id}`}>Details</Button>
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
                          {liveHref && <a href={liveHref} target="_blank" rel="noopener noreferrer" aria-label={`Open live site for ${a.title || a.subdomain}`} className="text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>}
                        </div>
                      </div>
                    );})
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
                <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={() => openFounderRecords("domains")}>View all records</Button>
                <Badge variant="secondary" className="text-xs">{metric("domains", stats?.totalDomainOrders)}</Badge>
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
                          <p className="text-xs font-medium truncate">{d.domainName}</p>
                          <p className="text-[10px] text-muted-foreground">{typeof d.pricePaid === "number" ? `$${(d.pricePaid / 100).toFixed(2)}` : "Price unavailable"} · {new Date(d.createdAt).toLocaleDateString()}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] px-1.5 flex-shrink-0 ${
                          d.status === "active" ? "text-green-400 border-green-500/30" :
                          d.status === "pending_payment" ? "text-yellow-400 border-yellow-500/30" : ""
                        }`}>
                          {d.status === "pending_payment" ? "Pending payment" : d.status}
                        </Badge>
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => openFounderRecords("domains", "", String(d.id))} aria-label={`View domain order ${d.id}`}>Details</Button>
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

        <FounderProgrammes />

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
                  totals: paymentTotalsByCurrency(allPayments, "completed"),
                  color: "text-green-400",
                  icon: CircleCheck,
                },
                {
                  label: "Pending",
                  count: allPayments.filter(p => p.status === "pending").length,
                  totals: paymentTotalsByCurrency(allPayments, "pending"),
                  color: "text-yellow-400",
                  icon: Clock,
                },
                {
                  label: "Failed",
                  count: allPayments.filter(p => p.status === "failed").length,
                  totals: paymentTotalsByCurrency(allPayments, "failed"),
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
                  {s.totals.map(total => <p key={total} className="text-xs text-muted-foreground break-words">{total}</p>)}
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
                      <div
                        key={p.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                        data-testid={`payment-row-${p.id}`}
                        onClick={() => setSelectedPayment(p)}
                      >
                        {statusIcon}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{p.plan}</span>
                            <Badge variant="outline" className={`text-xs ${statusColor}`}>{p.status}</Badge>
                            {p.paymentMethod && <span className="text-xs text-muted-foreground hidden sm:block">{p.paymentMethod}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Mail className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-xs text-foreground/80 truncate" data-testid={`payment-email-${p.id}`}>
                              {p.userEmail || "No email on file"}
                              {(p.userFirstName || p.userLastName)
                                ? ` · ${[p.userFirstName, p.userLastName].filter(Boolean).join(" ")}`
                                : ""}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span>Payment #{p.id}</span>
                            {p.userId !== undefined && <span>User {p.userId}</span>}
                            {p.merchantReference && <span className="max-w-40 truncate" title={p.merchantReference}>Ref {p.merchantReference}</span>}
                            {p.purchaseDetails?.packageName && <span>{p.purchaseDetails.packageName}</span>}
                            {p.purchaseDetails?.domainName && <span>{p.purchaseDetails.domainName}</span>}
                            {p.purchaseDetails?.quantity !== undefined && <span>{p.purchaseDetails.quantity} units{p.purchaseDetails.billingPeriod ? ` · ${p.purchaseDetails.billingPeriod}` : ""}</span>}
                            {p.fulfilmentStatus && <span>Fulfilment: {p.fulfilmentStatus}</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-green-400">{formatPaymentAmount(p.amount, p.currency)}</p>
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
                          onClick={(e) => { e.stopPropagation(); if (confirm("Delete this payment record?")) deletePaymentMutation.mutate(p.id); }}
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

        {/* Customer Follow-Up panel */}
        <Sheet open={!!selectedPayment} onOpenChange={(open) => { if (!open) setSelectedPayment(null); }}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto" data-testid="sheet-payment-detail">
            {selectedPayment && (() => {
              const p = selectedPayment;
              const fullName = [p.userFirstName, p.userLastName].filter(Boolean).join(" ").trim();
              const initials = (fullName || p.userEmail || "?").slice(0, 2).toUpperCase();
              const statusColor = p.status === "completed"
                ? "bg-green-500/10 text-green-400 border-green-500/20"
                : p.status === "failed"
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
              const recommend = p.status === "completed" ? "congrats" : "nudge";
              const noEmail = !p.userEmail;
              const sendingType = sendPaymentEmailMutation.isPending
                ? (sendPaymentEmailMutation.variables as any)?.type
                : null;
              const congratsSent = sentEmails[`${p.id}-congrats`];
              const nudgeSent = sentEmails[`${p.id}-nudge`];
              const copyEmail = () => {
                if (p.userEmail) {
                  navigator.clipboard.writeText(p.userEmail);
                  toast({ title: "Email copied" });
                }
              };
              const detail = (label: string, value: ReactNode, testid: string) => (
                <div className="flex items-start justify-between gap-3 py-2 border-b border-border/40">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-xs font-medium text-right break-all" data-testid={testid}>{value}</span>
                </div>
              );
              return (
                <>
                  <SheetHeader className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <SheetTitle className="truncate" data-testid="text-customer-name">{fullName || "Unknown customer"}</SheetTitle>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-muted-foreground truncate" data-testid="text-customer-email">{p.userEmail || "No email on file"}</span>
                          {p.userEmail && (
                            <button onClick={copyEmail} className="text-muted-foreground hover:text-foreground flex-shrink-0" data-testid="button-copy-email" title="Copy email">
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <SheetDescription className="sr-only">Customer payment details and follow-up email actions</SheetDescription>
                  </SheetHeader>

                  <div className="mt-4">
                    {detail("Status", <Badge variant="outline" className={`text-xs ${statusColor}`}>{p.status}</Badge>, "detail-status")}
                    {detail("Plan", p.plan, "detail-plan")}
                    {detail("Package", p.purchaseDetails?.packageName || "—", "detail-package")}
                    {detail("Amount", formatPaymentAmount(p.amount, p.currency), "detail-amount")}
                    {detail("Payment method", p.paymentMethod || "—", "detail-method")}
                    {detail("Payment ID", <span className="font-mono">{p.id}</span>, "detail-payment-id")}
                    {detail("User ID", <span className="font-mono">{p.userId ?? "—"}</span>, "detail-user-id")}
                    {detail("Date", p.createdAt ? new Date(p.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—", "detail-date")}
                    {p.completedAt && detail("Completed", new Date(p.completedAt).toLocaleString("en-GB"), "detail-completed-date")}
                    {detail("Reference", <span className="font-mono">{p.merchantReference || "—"}</span>, "detail-order-id")}
                    {detail("Pesapal ref", <span className="font-mono">{p.pesapalTrackingId || "—"}</span>, "detail-pesapal-ref")}
                    {p.purchaseDetails?.category && detail("Category", p.purchaseDetails.category, "detail-category")}
                    {p.purchaseDetails?.quantity !== undefined && detail("Quantity / period", `${p.purchaseDetails.quantity}${p.purchaseDetails.billingPeriod ? ` · ${p.purchaseDetails.billingPeriod}` : ""}`, "detail-quantity")}
                    {p.purchaseDetails?.credits !== undefined && detail("Credits", p.purchaseDetails.credits.toLocaleString(), "detail-credits")}
                    {p.purchaseDetails?.domainName && detail("Domain", p.purchaseDetails.domainName, "detail-domain")}
                    {p.purchaseDetails?.registrationYears !== undefined && detail("Registration years", p.purchaseDetails.registrationYears, "detail-registration-years")}
                    {p.purchaseDetails?.domainOrderId !== undefined && detail("Domain order ID", p.purchaseDetails.domainOrderId, "detail-domain-order")}
                    {p.purchaseDetails?.projectId !== undefined && detail("Project ID", p.purchaseDetails.projectId, "detail-project-id")}
                    {p.fulfilmentStatus && detail("Fulfilment", <span className="capitalize">{p.fulfilmentStatus}</span>, "detail-fulfilment")}
                    {p.confirmationCode && detail("Confirmation", <span className="font-mono">{p.confirmationCode}</span>, "detail-confirmation")}
                  </div>

                  <div className="mt-6 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Send follow-up email</p>
                    {noEmail && (
                      <p className="text-xs text-amber-400">This customer has no email address on file, so emails cannot be sent.</p>
                    )}
                    <Button
                      className="w-full justify-start gap-2 bg-green-600 hover:bg-green-700 text-white"
                      disabled={noEmail || sendPaymentEmailMutation.isPending || congratsSent}
                      onClick={() => sendPaymentEmailMutation.mutate({ id: p.id, type: "congrats" })}
                      data-testid="button-send-congrats"
                    >
                      <PartyPopper className="w-4 h-4" />
                      {congratsSent ? "Congratulations sent" : sendingType === "congrats" ? "Sending…" : "Send Congratulations"}
                      {recommend === "congrats" && !congratsSent && (
                        <Badge variant="outline" className="ml-auto text-[10px] bg-white/15 text-white border-white/25">Recommended</Badge>
                      )}
                    </Button>
                    <Button
                      className="w-full justify-start gap-2 bg-amber-500 hover:bg-amber-600 text-black"
                      disabled={noEmail || sendPaymentEmailMutation.isPending || nudgeSent}
                      onClick={() => sendPaymentEmailMutation.mutate({ id: p.id, type: "nudge" })}
                      data-testid="button-send-nudge"
                    >
                      <Hourglass className="w-4 h-4" />
                      {nudgeSent ? "Nudge sent" : sendingType === "nudge" ? "Sending…" : "Send Try Again Nudge"}
                      {recommend === "nudge" && !nudgeSent && (
                        <Badge variant="outline" className="ml-auto text-[10px] bg-black/15 text-black border-black/25">Recommended</Badge>
                      )}
                    </Button>
                  </div>
                </>
              );
            })()}
          </SheetContent>
        </Sheet>

        {/* Platform ratios */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Platform Ratios</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-xs font-medium">Avg Msg/Conv</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-avg-messages">
                  {!unavailable("ai-usage") && stats && stats.totalConversations > 0 ? (stats.totalMessages / stats.totalConversations).toFixed(1) : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium">Avg Projects/User</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-avg-projects">
                  {!unavailable("users") && !unavailable("projects") && stats && stats.totalUsers > 0 ? (stats.totalProjects / stats.totalUsers).toFixed(1) : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-xs font-medium">Publish Rate</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-publish-rate">
                  {!unavailable("projects") && !unavailable("apps") && stats && stats.totalProjects > 0 ? ((stats.totalPublishedApps / stats.totalProjects) * 100).toFixed(0) + "%" : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs font-medium">Paying Users</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-paying-users">
                  {pb ? pb.pro + pb.business + pb.payg : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pb && !unavailable("users") && stats && stats.totalUsers > 0
                    ? (((pb.pro + pb.business + pb.payg) / stats.totalUsers) * 100).toFixed(0) + "% conversion"
                    : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Telco / Aggregator config */}
        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="w-4 h-4 text-green-400" />
              Telco & Aggregator Config
            </CardTitle>
            <CardDescription className="text-xs">
              Status of carrier integrations powering USSD, SMS and the public partner page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <AfricasTalkingPanel />
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-yellow-400" />
                  <span className="font-medium">Hubtel / Termii / Beem</span>
                  <Badge variant="outline" className="text-[10px]">Compatible</Badge>
                </div>
                <span className="text-xs text-muted-foreground">Same webhook protocol — paste gateway URL</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">MTN VAS / Safaricom Daraja (direct)</span>
                  <Badge variant="outline" className="text-[10px]">Pending partnership</Badge>
                </div>
                <span className="text-xs text-muted-foreground">Apply once aggregator MRR ≥ $5K</span>
              </div>
            </div>

            <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-2 border border-border/50">
              <p className="font-semibold text-foreground">Optional: enable outbound SMS via Africa's Talking</p>
              <p className="text-muted-foreground">Add these secrets to enable platform-level SMS sending (OTPs, low-balance SMS alerts, etc.):</p>
              <ul className="text-muted-foreground space-y-0.5 font-mono">
                <li>• <code className="text-foreground">AFRICAS_TALKING_USERNAME</code></li>
                <li>• <code className="text-foreground">AFRICAS_TALKING_API_KEY</code></li>
              </ul>
              <p className="text-muted-foreground">Until these are set, SMS endpoints return 503 — webhook USSD continues to work without them.</p>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <a href="/partners" target="_blank">
                <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-view-partners-page">
                  <ExternalLink className="w-3.5 h-3.5" /> View public partners page
                </Button>
              </a>
              <a href="https://account.africastalking.com" target="_blank" rel="noopener">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> Africa's Talking dashboard
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Admin command centre + Team management links */}
        <div className="text-center pb-4 flex flex-wrap items-center justify-center gap-3">
          <a href="/team">
            <Button variant="outline" className="gap-2" data-testid="button-team-management">
              <Users className="w-4 h-4 text-primary" />
              Team Management
            </Button>
          </a>
          <a href="/admin-command">
            <Button variant="outline" className="gap-2" data-testid="button-admin-command">
              <Crown className="w-4 h-4 text-primary" />
              Open AI Admin Command Centre
            </Button>
          </a>
          <Button asChild variant="outline" className="gap-2" data-testid="button-keyo-studio">
            <a href="/admin-command/keyo-studio">
              <HardDrive className="w-4 h-4 text-primary" />
              KEYO Studio
            </a>
          </Button>
        </div>

      </div>
    </div>
  );
}
