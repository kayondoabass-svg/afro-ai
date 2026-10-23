import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { getCurrencyForCountry } from "@shared/currencies";

type Notice = { id: number; balance: { label: string; approximate: boolean }; topUpUrl: string };
export function LowCreditNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  let currency: string | undefined;
  try { currency = getCurrencyForCountry(localStorage.getItem("afro-ai-country") || "")?.code; } catch {}
  const { data } = useQuery<{ lowCredit: Notice | null }>({
    queryKey: ["/api/payg/status", "credit-reminder", user?.id, currency ?? "account"],
    enabled: !!user && ["pro", "business", "payg"].includes(user.plan),
    refetchInterval: 60_000,
    queryFn: async () => {
      const response = await fetch(`/api/payg/status${currency ? `?currency=${encodeURIComponent(currency)}` : ""}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Could not check credit balance.");
      return response.json();
    },
  });
  useEffect(() => {
    if (!user || !data?.lowCredit) return;
    const notice = data.lowCredit;
    const key = `afro-low-credit:${user.id}:${notice.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "shown");
    } catch {}
    toast({
      title: "Your credits are running low",
      description: `${notice.balance.approximate ? "Approximately " : ""}${notice.balance.label} remaining. This reminder triggers at US$5 or less, in any currency.`,
      duration: 12000,
      action: <Button size="sm" onClick={() => navigate("/pricing")} data-testid="button-low-credit-topup">Top up</Button>,
    });
  }, [user?.id, data?.lowCredit?.id, toast, navigate]);
  return null;
}
