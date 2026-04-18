import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Globe, Loader2, ShieldCheck, Lock, ArrowLeft, CreditCard } from "lucide-react";

export default function DomainsCheckoutPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const domain = params.get("domain") || "";
  const initialPrice = params.get("price");

  const [contact, setContact] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    country: "UG",
  });
  const [submitting, setSubmitting] = useState(false);
  const [years, setYears] = useState(1);

  // Login gate
  useEffect(() => {
    if (!isLoading && !user) {
      // remember intended destination
      sessionStorage.setItem("after_login_redirect", `/domain-names/checkout${window.location.search}`);
      navigate("/login");
    }
  }, [user, isLoading, navigate]);

  // Pre-fill from user
  useEffect(() => {
    if (user) {
      setContact(c => ({
        ...c,
        email: c.email || user.email || "",
        firstName: c.firstName || (user.firstName as string) || "",
        lastName: c.lastName || (user.lastName as string) || "",
      }));
    }
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground">No domain selected.</p>
        <a href="/domain-names"><Button>Search domains</Button></a>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/domains/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ domainName: domain, years, contact }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not create order");
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        toast({ title: "Order created", description: "Payment is pending. Check your dashboard." });
        navigate("/domains");
      }
    } catch (e: any) {
      toast({ title: "Checkout error", description: e.message, variant: "destructive" });
      setSubmitting(false);
    }
  }

  const totalPrice = initialPrice ? (parseFloat(initialPrice) * years).toFixed(2) : null;

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <a href="/domain-names" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary" data-testid="link-back-search">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to search
        </a>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Order summary */}
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" /> Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-xs text-muted-foreground">Domain</p>
                <p className="font-bold text-lg break-all" data-testid="text-checkout-domain">{domain}</p>
              </div>
              <div>
                <Label className="text-xs">Registration period</Label>
                <select
                  value={years}
                  onChange={e => setYears(parseInt(e.target.value))}
                  className="w-full mt-1 p-2 rounded border bg-background text-sm"
                  data-testid="select-years"
                >
                  {[1, 2, 3, 5, 10].map(y => (
                    <option key={y} value={y}>{y} year{y > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
              {totalPrice && (
                <>
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${totalPrice}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary" data-testid="text-checkout-total">${totalPrice}</span>
                  </div>
                </>
              )}
              <div className="space-y-1.5 pt-2 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-green-400" /> Free WHOIS privacy</p>
                <p className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-green-400" /> Domain lock enabled</p>
                <p className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5 text-green-400" /> Secure payment via Pesapal</p>
              </div>
            </CardContent>
          </Card>

          {/* Contact form */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Registrant contact details</CardTitle>
              <CardDescription className="text-xs">Required by ICANN. Your details are kept private via WHOIS protection.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="firstName" className="text-xs">First name *</Label>
                    <Input id="firstName" required value={contact.firstName} onChange={e => setContact({ ...contact, firstName: e.target.value })} data-testid="input-firstname" />
                  </div>
                  <div>
                    <Label htmlFor="lastName" className="text-xs">Last name *</Label>
                    <Input id="lastName" required value={contact.lastName} onChange={e => setContact({ ...contact, lastName: e.target.value })} data-testid="input-lastname" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email" className="text-xs">Email *</Label>
                  <Input id="email" type="email" required value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} data-testid="input-email" />
                </div>
                <div>
                  <Label htmlFor="phone" className="text-xs">Phone (with country code) *</Label>
                  <Input id="phone" required placeholder="+256700000000" value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} data-testid="input-phone" />
                </div>
                <div>
                  <Label htmlFor="address" className="text-xs">Address *</Label>
                  <Input id="address" required value={contact.address} onChange={e => setContact({ ...contact, address: e.target.value })} data-testid="input-address" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="city" className="text-xs">City *</Label>
                    <Input id="city" required value={contact.city} onChange={e => setContact({ ...contact, city: e.target.value })} data-testid="input-city" />
                  </div>
                  <div>
                    <Label htmlFor="state" className="text-xs">State / Region *</Label>
                    <Input id="state" required value={contact.state} onChange={e => setContact({ ...contact, state: e.target.value })} data-testid="input-state" />
                  </div>
                  <div>
                    <Label htmlFor="zip" className="text-xs">Postal code *</Label>
                    <Input id="zip" required value={contact.zip} onChange={e => setContact({ ...contact, zip: e.target.value })} data-testid="input-zip" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="country" className="text-xs">Country *</Label>
                  <select
                    id="country"
                    required
                    value={contact.country}
                    onChange={e => setContact({ ...contact, country: e.target.value })}
                    className="w-full mt-1 p-2 rounded border bg-background text-sm"
                    data-testid="select-country"
                  >
                    {[
                      ["UG", "Uganda"], ["KE", "Kenya"], ["TZ", "Tanzania"], ["RW", "Rwanda"],
                      ["NG", "Nigeria"], ["GH", "Ghana"], ["ZA", "South Africa"], ["ET", "Ethiopia"],
                      ["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"],
                    ].map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </div>

                <Button type="submit" size="lg" className="w-full mt-4" disabled={submitting} data-testid="button-checkout-pay">
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                  {submitting ? "Creating order..." : `Pay ${totalPrice ? `$${totalPrice}` : ""} with Pesapal`}
                </Button>
                <p className="text-[11px] text-center text-muted-foreground">
                  You'll be redirected to Pesapal to complete payment with mobile money or card.
                  After payment, your domain is registered automatically.
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
