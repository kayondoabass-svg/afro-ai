import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Globe, Search, CheckCircle2, XCircle, Loader2, ShoppingCart, Star,
  AlertCircle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import DomainManager from "@/components/domain-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DomainAvailability {
  domainName: string;
  available: boolean;
  purchasable: boolean;
  premium: boolean;
  purchasePrice: number | null;
  renewalPrice: number | null;
  currency: string;
}

interface ContactForm {
  firstName: string; lastName: string; email: string; phone: string;
  address: string; city: string; state: string; zip: string; country: string;
}

const POPULAR_TLDS = [".com", ".net", ".org", ".io", ".co", ".africa", ".shop", ".tech", ".app"];

export default function DomainsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<DomainAvailability | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [years, setYears] = useState("1");
  const [contact, setContact] = useState<ContactForm>({
    firstName: "", lastName: "", email: "", phone: "",
    address: "", city: "", state: "", zip: "", country: "",
  });
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const ownedQuery = useQuery<Array<{ domainName: string; status: string }>>({ queryKey: ["/api/domains/my"] });
  const hasPurchases = Array.isArray(ownedQuery.data) && ownedQuery.data.length > 0;

  const checkMutation = useMutation({
    mutationFn: (query: string) => apiRequest("POST", "/api/domains/check", { query }).then(r => r.json()),
    onError: (e: any) => toast({ title: "Search failed", description: e.message, variant: "destructive" }),
  });

  const [paymentReturnOrder, setPaymentReturnOrder] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const orderId = params.get("order");
    if (status === "success" && orderId) {
      setPaymentReturnOrder(parseInt(orderId));
      window.history.replaceState({}, "", "/domains");
    }
  }, []);

  const orderMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/domains/order", data).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/domain-manager"] });
      setRegisterOpen(false);
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        toast({ title: "Order created!", description: `Domain order for ${selectedDomain?.domainName} placed. Complete payment to activate.` });
      }
    },
    onError: (e: any) => toast({ title: "Order failed", description: e.message, variant: "destructive" }),
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setActiveSearch(searchQuery.trim());
    checkMutation.mutate(searchQuery.trim());
  };

  const handleRegister = () => {
    if (!selectedDomain) return;
    if (![contact.firstName, contact.lastName, contact.email, contact.phone, contact.address, contact.city].every(value => value.trim())) {
      return toast({ title: "Complete your name, email, phone, address, and city", variant: "destructive" });
    }
    if (!/^[A-Za-z]{2}$/.test(contact.country.trim())) {
      return toast({ title: "Enter your two-letter country code", variant: "destructive" });
    }
    orderMutation.mutate({
      domainName: selectedDomain.domainName,
      years: parseInt(years),
      contact,
    });
  };

  const results: DomainAvailability[] = checkMutation.data || [];
  const availableResults = results.filter(r => r.available);
  const unavailableResults = results.filter(r => !r.available);

  return (
    <div className="flex-1 overflow-auto min-h-0 bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Post-payment return banner */}
        {paymentReturnOrder && (
          <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-yellow-400 mt-0.5 shrink-0" />
              <div>
                 <p className="font-semibold text-yellow-300">Checkout returned</p>
                <p className="text-sm text-yellow-200/70 mt-0.5">
                   Check My Domains for the current payment and registration status. Returning from checkout alone does not confirm registration.
                </p>
              </div>
            </div>
             <Button size="sm" variant="outline" onClick={() => setPaymentReturnOrder(null)}>Dismiss</Button>
          </div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Globe className="w-8 h-8 text-yellow-400" />
            Domain Store
          </h1>
          <p className="text-muted-foreground mt-1">Find and register your perfect domain — powered by name.com</p>
        </div>

        <Tabs value={selectedTab ?? (hasPurchases || paymentReturnOrder ? "mydomains" : "search")} onValueChange={setSelectedTab}>
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="search" data-testid="tab-search">Find Domains</TabsTrigger>
            <TabsTrigger value="mydomains" data-testid="tab-mydomains">
               My Domains
            </TabsTrigger>
          </TabsList>

          {/* Domain Search Tab */}
          <TabsContent value="search" className="space-y-6 mt-6">
            {/* Search Bar */}
            <Card className="border-white/10 bg-white/5">
              <CardContent className="pt-6 pb-5">
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      data-testid="input-domain-search"
                      placeholder="Search for your domain, e.g. mybusiness"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSearch()}
                      className="pl-9 bg-white/5 border-white/10 h-11 text-base"
                    />
                  </div>
                  <Button
                    data-testid="button-search-domains"
                    onClick={handleSearch}
                    disabled={checkMutation.isPending || !searchQuery.trim()}
                    className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold h-11 px-6 gap-2"
                  >
                    {checkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Search
                  </Button>
                </div>
                {/* Popular TLDs hint */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {POPULAR_TLDS.map(tld => (
                    <span key={tld} className="text-xs bg-white/5 border border-white/10 rounded px-2 py-0.5 text-muted-foreground">
                      {tld}
                    </span>
                  ))}
                  <span className="text-xs text-muted-foreground py-0.5">+ more</span>
                </div>
              </CardContent>
            </Card>

            {/* Loading */}
            {checkMutation.isPending && (
              <div className="flex items-center gap-3 text-muted-foreground py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-yellow-400" />
                <span>Checking availability for <strong className="text-white">"{activeSearch}"</strong> across all TLDs...</span>
              </div>
            )}

            {/* Results */}
            {!checkMutation.isPending && results.length > 0 && (
              <div className="space-y-6">
                {/* Available */}
                {availableResults.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-green-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Available ({availableResults.length})
                    </h2>
                    <div className="space-y-2">
                      {availableResults.map(domain => (
                        <Card
                          key={domain.domainName}
                          data-testid={`card-domain-${domain.domainName}`}
                          className="border-white/10 bg-white/5 hover:border-yellow-400/30 hover:bg-yellow-400/5 transition-all duration-150"
                        >
                          <CardContent className="py-3 px-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                              <span className="font-mono font-semibold text-sm">{domain.domainName}</span>
                              {domain.premium && (
                                <Badge className="bg-yellow-500/20 text-yellow-400 text-xs flex items-center gap-1">
                                  <Star className="w-2.5 h-2.5" /> Premium
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="font-bold text-yellow-400 text-sm">
                                  {domain.purchasePrice ? `$${domain.purchasePrice}/yr` : "—"}
                                </div>
                                {domain.renewalPrice && domain.renewalPrice !== domain.purchasePrice && (
                                  <div className="text-xs text-muted-foreground">Renews ${domain.renewalPrice}/yr</div>
                                )}
                              </div>
                              <Button
                                data-testid={`button-register-${domain.domainName}`}
                                size="sm"
                                onClick={() => {
                                  if (ownedQuery.data?.some(order => order.domainName.toLowerCase() === domain.domainName.toLowerCase())) {
                                    setSelectedTab("mydomains");
                                  } else { setSelectedDomain(domain); setRegisterOpen(true); }
                                }}
                                className="bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-semibold gap-1"
                              >
                                <ShoppingCart className="w-3 h-3" />
                                Register
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unavailable */}
                {unavailableResults.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                      <XCircle className="w-4 h-4" />
                      Unavailable ({unavailableResults.length})
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {unavailableResults.map(domain => (
                        <div key={domain.domainName} className="flex items-center gap-2 p-2.5 rounded-lg bg-white/3 border border-white/5 opacity-60">
                          <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                          <span className="font-mono text-xs truncate">{domain.domainName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {!checkMutation.isPending && results.length === 0 && !checkMutation.error && (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="py-16 text-center">
                  <Globe className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Find your perfect domain</h3>
                  <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    Search for your business name above. We'll check availability across .com, .africa, .io, and many more TLDs instantly.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* My Domains Tab */}
          <TabsContent value="mydomains" className="mt-6 space-y-4">
             <DomainManager />
          </TabsContent>
        </Tabs>

        {/* Info Card */}
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                 <strong className="text-yellow-400">How it works:</strong> Search for a domain → Submit registration details → Pay via Pesapal (Mobile Money, Visa, Mastercard) → Check registration status in My Domains.
                 After registration, choose your published app in My Domains, save its hostname, follow the DNS instructions and verify the website connection.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Register Dialog */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="border-white/10 bg-zinc-900 sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-yellow-400" />
              Register {selectedDomain?.domainName}
            </DialogTitle>
          </DialogHeader>

          {selectedDomain && (
            <div className="space-y-5">
              {/* Price summary */}
              <Card className="border-yellow-500/20 bg-yellow-500/5">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-bold">{selectedDomain.domainName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Registration via name.com</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-yellow-400">
                        ${selectedDomain.purchasePrice ? (selectedDomain.purchasePrice * parseInt(years)).toFixed(2) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">for {years} year{parseInt(years) > 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Label className="text-xs">Registration Period</Label>
                    <Select value={years} onValueChange={setYears}>
                      <SelectTrigger data-testid="select-years" className="bg-white/5 border-white/10 mt-1 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 5].map(y => (
                          <SelectItem key={y} value={String(y)}>
                            {y} year{y > 1 ? "s" : ""} — ${selectedDomain.purchasePrice ? (selectedDomain.purchasePrice * y).toFixed(2) : "—"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Contact Info */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Registrant Contact Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "firstName", label: "First Name*", placeholder: "John" },
                    { key: "lastName", label: "Last Name*", placeholder: "Doe" },
                  ].map(f => (
                    <div key={f.key}>
                      <Label className="text-xs">{f.label}</Label>
                      <Input
                        data-testid={`input-contact-${f.key}`}
                        value={(contact as any)[f.key]}
                        onChange={e => setContact(p => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="bg-white/5 border-white/10 mt-1 h-8 text-xs"
                      />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <Label className="text-xs">Email*</Label>
                    <Input
                      data-testid="input-contact-email"
                      type="email"
                      value={contact.email}
                      onChange={e => setContact(p => ({ ...p, email: e.target.value }))}
                      placeholder="john@example.com"
                      className="bg-white/5 border-white/10 mt-1 h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Phone* (international format)</Label>
                    <Input
                      data-testid="input-contact-phone"
                      value={contact.phone}
                      onChange={e => setContact(p => ({ ...p, phone: e.target.value }))}
                      placeholder="+ country code and phone number"
                      className="bg-white/5 border-white/10 mt-1 h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Address</Label>
                    <Input
                      data-testid="input-contact-address"
                      value={contact.address}
                      onChange={e => setContact(p => ({ ...p, address: e.target.value }))}
                      placeholder="123 Main Street"
                      className="bg-white/5 border-white/10 mt-1 h-8 text-xs"
                    />
                  </div>
                  {[
                    { key: "city", label: "City", placeholder: "Your city" },
                    { key: "state", label: "State/Region", placeholder: "Your state or region" },
                    { key: "zip", label: "ZIP/Postal Code", placeholder: "Your postal code" },
                  ].map(f => (
                    <div key={f.key}>
                      <Label className="text-xs">{f.label}</Label>
                      <Input
                        data-testid={`input-contact-${f.key}`}
                        value={(contact as any)[f.key]}
                        onChange={e => setContact(p => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="bg-white/5 border-white/10 mt-1 h-8 text-xs"
                      />
                    </div>
                  ))}
                  <div>
                    <Label className="text-xs">Country Code</Label>
                    <Input
                      data-testid="input-contact-country"
                      value={contact.country}
                      onChange={e => setContact(p => ({ ...p, country: e.target.value.toUpperCase() }))}
                      placeholder="Two-letter country code"
                      maxLength={2}
                      className="bg-white/5 border-white/10 mt-1 h-8 text-xs uppercase"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRegisterOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-confirm-register"
              onClick={handleRegister}
              disabled={orderMutation.isPending}
              className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold gap-2"
            >
              {orderMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
              ) : (
                <><ShoppingCart className="w-4 h-4" /> Proceed to Payment</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
