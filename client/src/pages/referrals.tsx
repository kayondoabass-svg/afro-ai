import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, Copy, Users, DollarSign, CreditCard, Check, Share2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function ReferralsPage() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<{
    referralCode: string;
    referralLink: string;
    totalReferrals: number;
    paidReferrals: number;
    totalEarnings: number;
    credit: number;
    referrals: Array<{
      id: number;
      referredId: string;
      status: string;
      commissionAmount: number;
      paidPlan: string | null;
      createdAt: string;
    }>;
  }>({
    queryKey: ["/api/referral"],
  });

  const copyLink = async () => {
    if (!data?.referralLink) return;
    try {
      await navigator.clipboard.writeText(data.referralLink);
      setCopied(true);
      toast({ title: "Copied!", description: "Referral link copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Please copy the link manually", variant: "destructive" });
    }
  };

  const shareLink = async () => {
    if (!data?.referralLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join Afro AI",
          text: "Build websites and apps with AI! Use my referral link to get started:",
          url: data.referralLink,
        });
      } catch {}
    } else {
      copyLink();
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-muted rounded-lg" />)}
        </div>
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  const planPrices: Record<string, number> = {
    pro: 900,
    business: 2900,
  };

  return (
    <div className="p-6 space-y-6 overflow-auto" data-testid="page-referrals">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold font-serif flex items-center gap-2" data-testid="text-referrals-title">
          <Gift className="w-6 h-6 text-primary" />
          Referral Program
        </h1>
        <p className="text-muted-foreground">
          Earn 5% commission when people you refer upgrade to a paid plan. Credits go towards your Afro AI subscription.
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium">Your Referral Link</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-background px-3 py-2 rounded-md text-sm border truncate" data-testid="text-referral-link">
                  {data?.referralLink || "Loading..."}
                </code>
              </div>
              <p className="text-xs text-muted-foreground">
                Your code: <span className="font-mono font-bold text-primary" data-testid="text-referral-code">{data?.referralCode}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={copyLink} variant="outline" size="sm" data-testid="button-copy-link">
                {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button onClick={shareLink} size="sm" data-testid="button-share-link">
                <Share2 className="w-4 h-4 mr-1" />
                Share
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-referrals">{data?.totalReferrals || 0}</p>
              <p className="text-sm text-muted-foreground">Total Referrals</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-paid-referrals">{data?.paidReferrals || 0}</p>
              <p className="text-sm text-muted-foreground">Paid Conversions</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-total-earnings">${((data?.totalEarnings || 0) / 100).toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">Total Earned</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-credit-balance">${((data?.credit || 0) / 100).toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">Plan Credit</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="space-y-2 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-lg font-bold text-primary">1</div>
              <h3 className="font-semibold">Share Your Link</h3>
              <p className="text-sm text-muted-foreground">Share your unique referral link with friends, family, or your community.</p>
            </div>
            <div className="space-y-2 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-lg font-bold text-primary">2</div>
              <h3 className="font-semibold">They Sign Up & Upgrade</h3>
              <p className="text-sm text-muted-foreground">When they sign up using your link and upgrade to Pro ($15) or Business ($29.90), you earn commission.</p>
            </div>
            <div className="space-y-2 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-lg font-bold text-primary">3</div>
              <h3 className="font-semibold">Earn 5% Credit</h3>
              <p className="text-sm text-muted-foreground">You receive 5% of their plan payment as credit towards your own Afro AI subscription.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.referrals || data.referrals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No referrals yet</p>
              <p className="text-sm">Share your link to start earning commission!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.referrals.map((ref) => (
                <div key={ref.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`row-referral-${ref.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {ref.referredId.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">User {ref.referredId.slice(0, 8)}...</p>
                      <p className="text-xs text-muted-foreground">
                        Joined {new Date(ref.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {ref.commissionAmount > 0 && (
                      <span className="text-sm font-medium text-green-500">
                        +${(ref.commissionAmount / 100).toFixed(2)}
                      </span>
                    )}
                    <Badge variant={ref.status === "paid" ? "default" : "secondary"}>
                      {ref.status === "paid" ? "Paid" : "Signed Up"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
