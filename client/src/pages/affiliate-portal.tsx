import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MousePointerClick,
  Users,
  BadgeCheck,
  Wallet,
  Copy,
  Check,
  Gift,
  Clock,
} from "lucide-react";

interface AffiliatePortalData {
  affiliate: {
    fullName: string;
    referralCode: string;
    referralLink: string;
    clicks: number;
    referralCount: number;
    convertedCount: number;
    totalEarnedCents: number;
    totalPaidCents: number;
    pendingCents: number;
    createdAt: string;
  };
  referrals: Array<{
    id: number;
    referredEmail: string | null;
    status: string;
    firstPaidAt: string | null;
    createdAt: string;
  }>;
  commissions: Array<{
    id: number;
    amountCents: number;
    baseAmountCents: number;
    commissionPercent: number;
    currency: string;
    periodMonth: string;
    status: string;
    createdAt: string;
  }>;
}

function money(cents: number, currency = "USD") {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function StatCard({
  icon,
  label,
  value,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-bold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AffiliatePortalPage() {
  const [, params] = useRoute("/affiliate/portal/:token");
  const token = params?.token;
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = useQuery<AffiliatePortalData>({
    queryKey: ["/api/affiliate/portal", token],
    enabled: !!token,
    retry: false,
  });

  const copyLink = () => {
    if (!data?.affiliate.referralLink) return;
    navigator.clipboard.writeText(data.affiliate.referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <Gift className="w-6 h-6 text-destructive" />
            </div>
            <h1 className="text-lg font-semibold" data-testid="text-portal-error">
              Dashboard not found
            </h1>
            <p className="text-sm text-muted-foreground">
              This affiliate dashboard link is invalid or your application hasn't
              been approved yet. Please use the link from your approval email.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const a = data.affiliate;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Gift className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-affiliate-name">
              {a.fullName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Affiliate Dashboard · 10% commission on every paying referral
            </p>
          </div>
        </div>

        {/* Referral link */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Your referral link</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-2">
            <code
              className="flex-1 bg-muted rounded-md px-3 py-2 text-sm font-mono text-primary break-all"
              data-testid="text-referral-link"
            >
              {a.referralLink}
            </code>
            <Button onClick={copyLink} data-testid="button-copy-link" className="gap-2">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<MousePointerClick className="w-5 h-5" />}
            label="Link clicks"
            value={a.clicks}
            testId="stat-clicks"
          />
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Sign-ups"
            value={a.referralCount}
            testId="stat-referrals"
          />
          <StatCard
            icon={<BadgeCheck className="w-5 h-5" />}
            label="Paying customers"
            value={a.convertedCount}
            testId="stat-conversions"
          />
          <StatCard
            icon={<Wallet className="w-5 h-5" />}
            label="Total earned"
            value={money(a.totalEarnedCents)}
            testId="stat-earned"
          />
        </div>

        {/* Earnings summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Pending payout"
            value={money(a.pendingCents)}
            testId="stat-pending"
          />
          <StatCard
            icon={<Check className="w-5 h-5" />}
            label="Paid out"
            value={money(a.totalPaidCents)}
            testId="stat-paid"
          />
          <StatCard
            icon={<Gift className="w-5 h-5" />}
            label="Referral code"
            value={a.referralCode}
            testId="stat-code"
          />
        </div>

        {/* Referrals */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Your referrals ({data.referrals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.referrals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No referrals yet. Share your link to start earning.
              </p>
            ) : (
              <div className="space-y-2">
                {data.referrals.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 py-2 border-b last:border-0"
                    data-testid={`row-referral-${r.id}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm truncate">
                        {r.referredEmail || "New user"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Joined {new Date(r.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={r.status === "converted" ? "default" : "secondary"}
                      className="text-xs flex-shrink-0"
                    >
                      {r.status === "converted" ? "Paying" : "Signed up"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commissions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Commission history ({data.commissions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.commissions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No commissions yet. You earn 10% when a referral makes a payment.
              </p>
            ) : (
              <div className="space-y-2">
                {data.commissions.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 py-2 border-b last:border-0"
                    data-testid={`row-commission-${c.id}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {money(c.amountCents, c.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.commissionPercent}% of {money(c.baseAmountCents, c.currency)} ·{" "}
                        {c.periodMonth}
                      </p>
                    </div>
                    <Badge
                      variant={c.status === "paid" ? "default" : "secondary"}
                      className="text-xs flex-shrink-0"
                    >
                      {c.status === "paid" ? "Paid" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pt-2">
          Afro AI · KEYO TECHNOLOGIES · This is your private dashboard — keep the link to yourself.
        </p>
      </div>
    </div>
  );
}
