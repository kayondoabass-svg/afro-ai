import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  Zap,
  BarChart3,
  Receipt,
  Download,
  Crown,
  Sparkles,
  TrendingUp,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "wouter";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

interface UsageStats {
  totalGenerations: number;
  totalTokens: number;
  dailyUsage: { date: string; generations: number; tokens: number }[];
}

interface Payment {
  id: number;
  plan: string;
  amount: string;
  currency: string;
  paymentMethod: string | null;
  confirmationCode: string | null;
  status: string;
  merchantReference: string;
  createdAt: string;
}

interface ReceiptData {
  receipt: {
    id: number;
    date: string;
    plan: string;
    amount: string;
    currency: string;
    paymentMethod: string | null;
    confirmationCode: string | null;
    status: string;
    merchantReference: string;
    customerName: string;
    customerEmail: string;
    business: string;
    registrationNo: string;
    platform: string;
  };
}

const PLAN_DETAILS: Record<string, { name: string; price: string; features: string[] }> = {
  starter: {
    name: "Starter",
    price: "Free",
    features: ["GPT-4.1 Nano", "16K tokens", "Basic code generation"],
  },
  pro: {
    name: "Pro",
    price: "$9/mo",
    features: ["GPT-4.1 Mini", "32K tokens", "Advanced designs", "Priority support"],
  },
  business: {
    name: "Business",
    price: "$29/mo",
    features: ["GPT-4.1", "32K tokens", "Premium quality", "Priority support", "Custom branding"],
  },
};

function UsageChart({ dailyUsage }: { dailyUsage: { date: string; generations: number; tokens: number }[] }) {
  if (dailyUsage.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm" data-testid="text-no-usage">
        No usage data yet. Start building to see your activity!
      </div>
    );
  }

  const maxGen = Math.max(...dailyUsage.map((d) => d.generations), 1);

  return (
    <div className="flex items-end gap-1 h-32" data-testid="chart-usage">
      {dailyUsage.slice(-14).map((day, i) => {
        const height = Math.max((day.generations / maxGen) * 100, 4);
        const dateLabel = new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-popover border rounded-md px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
              <div className="font-medium">{dateLabel}</div>
              <div>{day.generations} generations</div>
              <div>{day.tokens.toLocaleString()} tokens</div>
            </div>
            <div
              className="w-full bg-primary/80 rounded-t-sm transition-all hover:bg-primary min-w-[6px]"
              style={{ height: `${height}%` }}
              data-testid={`bar-usage-${i}`}
            />
            <span className="text-[9px] text-muted-foreground truncate w-full text-center">
              {new Date(day.date).getDate()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <Badge className="bg-green-500/10 text-green-500 border-green-500/20" data-testid={`badge-status-${status}`}>
        <CheckCircle className="w-3 h-3 mr-1" />
        Completed
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" data-testid={`badge-status-${status}`}>
        <XCircle className="w-3 h-3 mr-1" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" data-testid={`badge-status-${status}`}>
      <Clock className="w-3 h-3 mr-1" />
      Pending
    </Badge>
  );
}

function ReceiptModal({ paymentId, open, onClose }: { paymentId: number | null; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery<ReceiptData>({
    queryKey: ["/api/payments", paymentId, "receipt"],
    queryFn: async () => {
      const res = await fetch(`/api/payments/${paymentId}/receipt`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load receipt");
      return res.json();
    },
    enabled: !!paymentId && open,
  });

  const handlePrint = () => {
    window.print();
  };

  const r = data?.receipt;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md print:max-w-none print:shadow-none" data-testid="dialog-receipt">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            Payment Receipt
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : r ? (
          <div className="space-y-6" id="receipt-content">
            <div className="flex items-center gap-3 pb-4 border-b">
              <img src={afroLogo} alt="Afro AI" className="w-10 h-10 object-contain" />
              <div>
                <h3 className="font-bold text-lg">Afro AI</h3>
                <p className="text-xs text-muted-foreground">{r.business} — Reg. {r.registrationNo}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Receipt No.</p>
                <p className="font-medium" data-testid="text-receipt-id">#{r.id}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Date</p>
                <p className="font-medium" data-testid="text-receipt-date">
                  {new Date(r.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Customer</p>
                <p className="font-medium" data-testid="text-receipt-name">{r.customerName}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Email</p>
                <p className="font-medium truncate" data-testid="text-receipt-email">{r.customerEmail}</p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium capitalize" data-testid="text-receipt-plan">{r.plan} Plan</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-bold text-lg" data-testid="text-receipt-amount">
                  {r.currency} {parseFloat(r.amount).toLocaleString()}
                </span>
              </div>
              {r.paymentMethod && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment Method</span>
                  <span className="font-medium" data-testid="text-receipt-method">{r.paymentMethod}</span>
                </div>
              )}
              {r.confirmationCode && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Confirmation Code</span>
                  <span className="font-mono text-xs" data-testid="text-receipt-confirmation">{r.confirmationCode}</span>
                </div>
              )}
              <div className="flex justify-between text-sm pt-2 border-t">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={r.status} />
              </div>
            </div>

            <div className="text-center text-xs text-muted-foreground">
              <p>{r.platform}</p>
              <p className="mt-1">Thank you for choosing Afro AI!</p>
            </div>

            <Button variant="outline" className="w-full" onClick={handlePrint} data-testid="button-print-receipt">
              <Download className="w-4 h-4 mr-2" />
              Print / Save Receipt
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Receipt not found.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function BillingPage() {
  const { user } = useAuth();
  const [receiptPaymentId, setReceiptPaymentId] = useState<number | null>(null);
  const currentPlan = (user as any)?.plan || "starter";
  const planInfo = PLAN_DETAILS[currentPlan] || PLAN_DETAILS.starter;

  const { data: usageData, isLoading: usageLoading } = useQuery<UsageStats>({
    queryKey: ["/api/usage"],
  });

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["/api/payments"],
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold font-serif flex items-center gap-2" data-testid="text-billing-title">
            <CreditCard className="w-6 h-6 text-primary" />
            Billing & Usage
          </h1>
          <p className="text-sm text-muted-foreground">Manage your subscription, track AI usage, and view payment history.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-1" data-testid="card-current-plan">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Crown className="w-4 h-4" />
                Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold" data-testid="text-plan-name">{planInfo.name}</h2>
                  <Badge variant={currentPlan === "starter" ? "secondary" : "default"} className="capitalize" data-testid="badge-plan">
                    {currentPlan}
                  </Badge>
                </div>
                <p className="text-lg text-primary font-semibold" data-testid="text-plan-price">{planInfo.price}</p>
              </div>
              <div className="space-y-2">
                {planInfo.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="w-3 h-3 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              {currentPlan === "starter" && (
                <Link href="/pricing">
                  <Button className="w-full" data-testid="button-upgrade">
                    <ArrowUpRight className="w-4 h-4 mr-1" />
                    Upgrade Plan
                  </Button>
                </Link>
              )}
              {currentPlan !== "starter" && (
                <Link href="/pricing">
                  <Button variant="outline" className="w-full" data-testid="button-manage-plan">
                    Manage Plan
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2" data-testid="card-usage-overview">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                AI Usage (Last 30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usageLoading ? (
                <div className="space-y-3">
                  <div className="flex gap-4">
                    <Skeleton className="h-16 flex-1" />
                    <Skeleton className="h-16 flex-1" />
                  </div>
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Zap className="w-3 h-3" />
                        Total Generations
                      </div>
                      <p className="text-2xl font-bold" data-testid="text-total-generations">
                        {usageData?.totalGenerations?.toLocaleString() || "0"}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <TrendingUp className="w-3 h-3" />
                        Tokens Used
                      </div>
                      <p className="text-2xl font-bold" data-testid="text-total-tokens">
                        {usageData?.totalTokens?.toLocaleString() || "0"}
                      </p>
                    </div>
                  </div>
                  <UsageChart dailyUsage={usageData?.dailyUsage || []} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-payment-history">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Payment History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paymentsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !paymentsData || paymentsData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-payments">
                <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No payments yet.</p>
                <p className="text-xs mt-1">Your payment history will appear here after your first subscription.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-left">
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Plan</th>
                      <th className="pb-3 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Method</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsData.map((payment) => (
                      <tr key={payment.id} className="border-b last:border-0" data-testid={`row-payment-${payment.id}`}>
                        <td className="py-3">
                          {new Date(payment.createdAt).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-3">
                          <Badge variant="outline" className="capitalize">{payment.plan}</Badge>
                        </td>
                        <td className="py-3 font-medium">
                          {payment.currency} {parseFloat(payment.amount).toLocaleString()}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {payment.paymentMethod || "—"}
                        </td>
                        <td className="py-3">
                          <StatusBadge status={payment.status} />
                        </td>
                        <td className="py-3 text-right">
                          {payment.status === "completed" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setReceiptPaymentId(payment.id)}
                              data-testid={`button-receipt-${payment.id}`}
                            >
                              <Receipt className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <ReceiptModal
          paymentId={receiptPaymentId}
          open={receiptPaymentId !== null}
          onClose={() => setReceiptPaymentId(null)}
        />
      </div>
    </div>
  );
}
