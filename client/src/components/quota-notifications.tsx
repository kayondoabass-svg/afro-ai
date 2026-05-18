import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { AlertTriangle, Sparkles, CreditCard, Clock } from "lucide-react";

type QuotaKind = "chat" | "image" | "audio" | "video";

type WarnDetail = {
  kind: QuotaKind; used: number; limit: number; percent: number; plan: string; resetsAt: string;
};
type BlockedDetail = WarnDetail & { upgradeUrl?: string; creditsUrl?: string };

const KIND_LABEL: Record<QuotaKind, string> = {
  chat: "messages", image: "image generations", audio: "voice messages", video: "video clips",
};

function hoursUntil(iso: string): number {
  if (!iso) return 0;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.round(diff / 3_600_000));
}

export function QuotaNotifications() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [blocked, setBlocked] = useState<BlockedDetail | null>(null);

  useEffect(() => {
    // Dedup toast per kind so we don't spam the user during a long session.
    const toastedToday = new Set<string>();

    function onWarn(e: Event) {
      const d = (e as CustomEvent<WarnDetail>).detail;
      const tag = `${d.kind}-${new Date().toISOString().slice(0, 10)}`;
      if (toastedToday.has(tag)) return;
      toastedToday.add(tag);
      toast({
        title: `You've used ${d.used} of ${d.limit} daily ${KIND_LABEL[d.kind] || d.kind}`,
        description: `Upgrade to keep building without interruption.`,
        duration: 8000,
        action: (
          <Button
            size="sm"
            onClick={() => navigate("/pricing")}
            data-testid="button-quota-toast-upgrade"
          >
            Upgrade
          </Button>
        ),
      });
    }

    function onBlocked(e: Event) {
      setBlocked((e as CustomEvent<BlockedDetail>).detail);
    }

    window.addEventListener("afroai:quota-warn", onWarn);
    window.addEventListener("afroai:quota-blocked", onBlocked);
    return () => {
      window.removeEventListener("afroai:quota-warn", onWarn);
      window.removeEventListener("afroai:quota-blocked", onBlocked);
    };
  }, [toast, navigate]);

  if (!blocked) return null;
  const label = KIND_LABEL[blocked.kind] || blocked.kind;
  const hours = hoursUntil(blocked.resetsAt);

  return (
    <Dialog open={!!blocked} onOpenChange={(open) => { if (!open) setBlocked(null); }}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-quota-blocked">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <DialogTitle className="text-center" data-testid="text-quota-title">
            Daily limit reached
          </DialogTitle>
          <DialogDescription className="text-center" data-testid="text-quota-description">
            You've used all <strong>{blocked.limit}</strong> daily {label} on your <strong>{blocked.plan}</strong> plan.
            Your project is safe — keep building right now by upgrading, or wait{" "}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <strong>~{hours} hour{hours === 1 ? "" : "s"}</strong>
            </span>{" "}
            for it to reset.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={() => { setBlocked(null); navigate(blocked.upgradeUrl || "/pricing"); }}
            data-testid="button-quota-upgrade"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Upgrade plan
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { setBlocked(null); navigate(blocked.creditsUrl || "/pricing#payg"); }}
            data-testid="button-quota-buy-credits"
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Buy credits (one-time)
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => setBlocked(null)}
            data-testid="button-quota-dismiss"
          >
            Wait until reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
