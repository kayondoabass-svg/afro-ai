import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { CREDIT_PACKS, creditCheckoutUrl } from "@shared/credit-checkout";
import { africanCountries, getCountryByIsoCode, getCurrencyForCountry, formatLocalPrice } from "@shared/currencies";
import { Loader2, CreditCard } from "lucide-react";

export function CreditPurchaseDialog({ onClose, onBack, onCheckout = url => window.location.assign(url) }: {
  onClose: () => void;
  onBack: () => void;
  onCheckout?: (url: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [country, setCountry] = useState(() => {
    try { return getCountryByIsoCode(localStorage.getItem("afro-ai-country") || "")?.isoCode || ""; }
    catch { return ""; }
  });
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const currency = getCurrencyForCountry(country);
  function selectCountry(value: string) {
    setCountry(value);
    try { localStorage.setItem("afro-ai-country", value); } catch {}
  }

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
          <DialogTitle>Buy credits directly</DialogTitle>
          <DialogDescription>
            Choose a one-time credit pack and pay with mobile money or card through Pesapal. Your project stays saved, and your free allowance still resets at midnight UTC.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">One-time purchase</p>
          <p className="text-muted-foreground">No subscription or repeat charges are authorized.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="credit-payment-country" className="text-sm font-medium">Country for payment</label>
          <select id="credit-payment-country" value={country} disabled={selected !== null}
            onChange={event => selectCountry(event.target.value)} aria-describedby="credit-payment-help"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Other / pay in USD</option>
            {africanCountries.map(option => <option key={option.isoCode} value={option.isoCode}>{option.name} ({option.currencyCode})</option>)}
          </select>
          <p id="credit-payment-help" className="text-xs text-muted-foreground">
            For mobile money, select your country, choose a pack, then select Mobile Money on Pesapal's secure checkout.
            Available networks and card options are shown by Pesapal for your payment.
          </p>
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
        <p className="text-xs text-muted-foreground" data-testid="text-autotopup-unavailable">You choose when to buy again. Auto-renewal is off.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button variant="ghost" onClick={onClose}>Wait for the free reset</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
