import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { CREDIT_PACKS, creditCheckoutUrl } from "@shared/credit-checkout";
import { getCurrencyForCountry, formatLocalPrice } from "@shared/currencies";
import { Loader2, CreditCard } from "lucide-react";

export function CreditPurchaseDialog({ onClose, onBack, onCheckout = url => window.location.assign(url) }: {
  onClose: () => void;
  onBack: () => void;
  onCheckout?: (url: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  let country = "";
  try { country = localStorage.getItem("afro-ai-country") || ""; } catch {}
  const currency = getCurrencyForCountry(country);

  async function purchase(pack: string) {
    if (pending.current) return;
    pending.current = true;
    setSelected(pack);
    setError("");
    try {
      const response = await apiRequest("POST", "/api/payg/topup", { pack, mode: "one-time", countryCode: country || undefined });
      const data = await response.json();
      if (active.current) onCheckout(creditCheckoutUrl(data.redirectUrl));
    } catch {
      if (active.current) setError("We couldn't open secure checkout. No payment has been confirmed here. Please try again or close this screen.");
    } finally {
      pending.current = false;
      if (active.current) setSelected(null);
    }
  }
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md" data-testid="dialog-credit-purchase">
        <DialogHeader>
          <DialogTitle>Purchase credits to continue</DialogTitle>
          <DialogDescription>
            Choose a one-time credit pack. Your project stays saved, and your free allowance still resets at midnight UTC.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">One-time purchase</p>
          <p className="text-muted-foreground">No subscription or repeat charges are authorized.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {CREDIT_PACKS.map(pack => (
            <Button key={pack.key} variant="outline" className="h-auto min-h-20 flex-col gap-1 py-3"
              disabled={selected !== null} onClick={() => purchase(pack.key)} data-testid={`button-quota-${pack.key}`}>
              {selected === pack.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              <span className="font-semibold">US${pack.usd.toFixed(2)}</span>
              <span>{pack.credits.toLocaleString()} credits</span>
              {currency && currency.code !== "USD" && <span className="text-xs text-muted-foreground">
                ≈ {currency.code} {formatLocalPrice(pack.usd, country)}
              </span>}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Local values are estimates. Secure checkout confirms the actual amount and currency. Credits are added only after payment is verified.</p>
        <div className="rounded-lg border p-3 text-sm text-muted-foreground" data-testid="text-autotopup-unavailable">
          <p className="font-medium">Low-balance auto-top-up — not enabled</p>
          <p>Automatic top-ups are not available with the current payment setup. This purchase will not enable automatic charging.</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button variant="ghost" onClick={onClose}>Wait for the free reset</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
