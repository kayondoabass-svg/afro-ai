import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { readableApiError } from "@shared/customer-api-setup";
import { openPaymentCheckout } from "@/components/payment-checkout";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Check, CircleAlert, Eye, LockKeyhole, Mail, RefreshCw, Send, ShieldCheck } from "lucide-react";

type Purpose = "verify" | "reset";
type Settings = {
  logoUrl: string; color: string; senderName: string; replyTo: string; domainId: string | number | null;
  fromAddress: string; verifySubject: string; verifyIntro: string; resetSubject: string; resetIntro: string;
  footer: string; verifyHtml: string; resetHtml: string;
};
type BrandingData = {
  project: { id: string; name: string; slug: string };
  package: { key: string; name: string; usd: number; mau: number; apps: number | string };
  source: "free" | "payment" | "founder" | "override" | "legacy";
  expiresAt: string | null;
  features: { identity: boolean; senderDomain: boolean; copy: boolean; whiteLabel: boolean; html: boolean };
  settings: Settings;
  domains: { id: string | number; domain: string; status: string }[];
  packages: { key: string; name: string; usd: number; mau: number; apps: number | string }[];
  retainedLockedFields: string[];
  recentMail: { purpose: string; outcome: string; reason: string | null; message_id: string | null; created_at: string }[];
  testRecipient: string | null;
};
type Preview = { subject: string; html: string; text: string; from: string; replyTo: string | null };

const EMPTY_SETTINGS: Settings = {
  logoUrl: "", color: "#9A4F36", senderName: "", replyTo: "", domainId: null, fromAddress: "",
  verifySubject: "", verifyIntro: "", resetSubject: "", resetIntro: "", footer: "", verifyHtml: "", resetHtml: "",
};

function locked(feature: boolean) {
  return feature ? "" : "border-dashed bg-muted/35";
}

function FieldLock({ enabled, plan }: { enabled: boolean; plan: "Builder" | "Business" | "Scale" }) {
  return enabled ? null : <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"><LockKeyhole className="h-3 w-3" />Included from {plan}</span>;
}

export function EmailBrandingSetup({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const initializedForProject = useRef("");
  const [purpose, setPurpose] = useState<Purpose>("verify");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [awaitingPlan, setAwaitingPlan] = useState<string | null>(null);
  const [awaitingUntil, setAwaitingUntil] = useState(0);
  const [countryCode, setCountryCode] = useState(() => {
    try { return localStorage.getItem("afro-ai-country") || ""; } catch { return ""; }
  });
  const path = `/api/auth-projects/${encodeURIComponent(projectId)}/branding`;
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<BrandingData>({
    queryKey: [path], queryFn: async () => (await apiRequest("GET", path)).json(), enabled: !!projectId, retry: false,
    refetchInterval: (query) => {
      const target = awaitingPlan?.replace(/^auth-/, "").toLowerCase();
      const ranks: Record<string, number> = { free: 0, builder: 1, business: 2, scale: 3 };
      return target && Date.now() < awaitingUntil &&
        (ranks[String(query.state.data?.package.key || "free")] ?? 0) < (ranks[target] ?? 0) ? 4_000 : false;
    },
  });

  useEffect(() => {
    if (data?.settings && initializedForProject.current !== projectId) {
      initializedForProject.current = projectId;
      setSettings({ ...EMPTY_SETTINGS, ...data.settings });
    }
  }, [data, projectId]);

  const saveMutation = useMutation({
    mutationFn: async (next: Settings) => (await apiRequest("PATCH", path, next)).json() as Promise<{ ok: boolean; settings: Settings }>,
    onSuccess: (saved) => {
      queryClient.setQueryData<BrandingData>([path], (current) => current ? { ...current, settings: saved.settings } : current);
      setSettings({ ...EMPTY_SETTINGS, ...saved.settings });
      toast({ title: "Email branding saved" });
    },
    onError: (saveError) => toast({ title: "Couldn't save email branding", description: readableApiError(saveError, "Check the fields and try again."), variant: "destructive" }),
  });
  const previewMutation = useMutation({
    mutationFn: async (vars: { purpose: Purpose; settings: Settings }) =>
      (await apiRequest("POST", `${path}/preview`, vars)).json() as Promise<Preview>,
    onSuccess: (value) => { setPreview(value); setPreviewError(""); },
    onError: (previewFailure) => { setPreview(null); setPreviewError(readableApiError(previewFailure, "Couldn't build this preview.")); },
  });
  const testMutation = useMutation({
    mutationFn: async (purposeValue: Purpose) =>
      (await apiRequest("POST", `${path}/test`, { purpose: purposeValue })).json() as Promise<{ accepted: boolean; messageId: string }>,
    onSuccess: (result) => toast({
      title: result.accepted ? "Test accepted" : "Test not accepted",
      description: result.accepted
        ? `Afro Auth accepted the request for ${data?.testRecipient || "your account email"}. Acceptance is not delivery confirmation.`
        : "The test was not accepted. Check the send history and try again later.",
      variant: result.accepted ? "default" : "destructive",
    }),
    onError: (testFailure) => toast({ title: "Couldn't send test", description: readableApiError(testFailure, "The test could not be accepted."), variant: "destructive" }),
  });
  const subscribeMutation = useMutation({
    mutationFn: async (plan: string) => (await apiRequest("POST", "/api/subscribe", {
      plan: plan.startsWith("auth-") ? plan : `auth-${plan}`, projectId, countryCode: countryCode.trim().toUpperCase() || undefined, embedded: true,
    })).json(),
    onSuccess: (order, requestedPlan) => {
      if (order?.redirectUrl) {
        setAwaitingPlan(requestedPlan);
        setAwaitingUntil(Date.now() + 5 * 60_000);
        openPaymentCheckout({ ...order });
      }
      else toast({ title: "Checkout unavailable", description: "No payment page was prepared. Your project was not charged.", variant: "destructive" });
    },
    onError: (checkoutError) => toast({ title: "Couldn't prepare checkout", description: readableApiError(checkoutError, "Your project was not charged. Try again."), variant: "destructive" }),
  });

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: [path] });
      void queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants", projectId] });
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [path, projectId]);

  useEffect(() => {
    if (!awaitingPlan || !data?.package) return;
    const ranks: Record<string, number> = { free: 0, builder: 1, business: 2, scale: 3 };
    const target = awaitingPlan.replace(/^auth-/, "").toLowerCase();
    const current = String(data.package.key).replace(/^auth-/, "").toLowerCase();
    if ((ranks[current] ?? 0) >= (ranks[target] ?? 99)) {
      void queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants", projectId] });
      setAwaitingPlan(null);
      setAwaitingUntil(0);
    }
  }, [awaitingPlan, data?.package.key, projectId]);

  useEffect(() => {
    if (!awaitingPlan || !awaitingUntil) return;
    const timer = window.setTimeout(() => {
      setAwaitingPlan(null);
      setAwaitingUntil(0);
    }, Math.max(0, awaitingUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [awaitingPlan, awaitingUntil]);

  const packageOptions = useMemo(() => data?.packages ?? [], [data?.packages]);
  const setField = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const feature = data?.features ?? {identity:false,senderDomain:false,copy:false,whiteLabel:false,html:false};
  const verifiedDomains = data?.domains.filter((domain) => domain.status.toLowerCase() === "verified") ?? [];
  const selectedPlan = data?.package?.name || "Starter";

  if (isLoading) return <div className="space-y-4" aria-label="Loading email branding">
    <Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /><Skeleton className="h-48 w-full" />
  </div>;
  if (isError || !data) return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><CircleAlert className="h-5 w-5 text-destructive" />Couldn't load email branding</CardTitle>
      <CardDescription>{readableApiError(error, "Branding settings are unavailable for this project.")}</CardDescription></CardHeader>
    <CardContent><Button variant="outline" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></CardContent>
  </Card>;

  const updatePreview = () => {
    setPreviewError("");
    previewMutation.mutate({ purpose, settings });
  };

  return <div className="space-y-5" data-testid="email-branding-setup">
    <Card className="border-primary/20 bg-primary/[0.025]">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{selectedPlan}</Badge><Badge variant="outline">{data.package.usd === 0 ? "Free" : `$${data.package.usd} · prepaid 30 days`}</Badge></div>
          <p className="mt-2 font-medium">{data.project.name} email identity</p>
          <p className="text-sm text-muted-foreground">The platform keeps delivery credentials private. Branding packages apply across your owned Afro Auth projects, up to the package app limit.</p>
          {data.expiresAt && <p className="mt-1 text-xs text-muted-foreground">Access through {new Date(data.expiresAt).toLocaleDateString()} · no automatic debit.</p>}
        </div>
        {data.package.usd > 0 && <Badge variant="outline" className="w-fit">{data.source === "founder" ? "Founder access" : data.source === "override" ? "Owner-managed access" : "Active entitlement"}</Badge>}
      </CardContent>
    </Card>

    {data.retainedLockedFields.length > 0 && <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>
      {data.retainedLockedFields.length} locked field{data.retainedLockedFields.length === 1 ? " is" : "s are"} preserved. Values are retained when saving; an upgrade is needed to edit them.
    </AlertDescription></Alert>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.85fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Sender identity</CardTitle>
            <CardDescription>Brand verification and password-reset mail without handling provider credentials. Customer-owned callback pages remain available on every tier.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className={`grid gap-4 rounded-lg border p-4 sm:grid-cols-2 ${locked(feature.identity)}`}>
              <div className="space-y-2"><Label htmlFor="branding-sender-name">Sender name <FieldLock enabled={feature.identity} plan="Builder" /></Label><Input id="branding-sender-name" value={settings.senderName} onChange={(e) => setField("senderName", e.target.value)} disabled={!feature.identity} maxLength={100} placeholder={data.project.name} /></div>
              <div className="space-y-2"><Label htmlFor="branding-reply-to">Reply-to email <FieldLock enabled={feature.identity} plan="Builder" /></Label><Input id="branding-reply-to" type="email" value={settings.replyTo} onChange={(e) => setField("replyTo", e.target.value)} disabled={!feature.identity} maxLength={254} placeholder="help@example.com" /><p className="text-xs text-muted-foreground">Must be your verified account email or an address on an owned verified Email API domain.</p></div>
              <div className="space-y-2"><Label htmlFor="branding-logo">Logo URL <FieldLock enabled={feature.identity} plan="Builder" /></Label><Input id="branding-logo" type="url" value={settings.logoUrl} onChange={(e) => setField("logoUrl", e.target.value)} disabled={!feature.identity} maxLength={500} placeholder="https://example.com/logo.png" /></div>
              <div className="space-y-2"><Label htmlFor="branding-color">Brand color <FieldLock enabled={feature.identity} plan="Builder" /></Label><div className="flex gap-2"><Input id="branding-color" type="color" className="h-10 w-14 p-1" value={/^#[0-9a-f]{6}$/i.test(settings.color) ? settings.color : "#9A4F36"} onChange={(e) => setField("color", e.target.value)} disabled={!feature.identity} /><Input aria-label="Brand color hex" value={settings.color} onChange={(e) => setField("color", e.target.value)} disabled={!feature.identity} maxLength={7} /></div></div>
            </div>
            <div className={`space-y-3 rounded-lg border p-4 ${locked(feature.senderDomain)}`}>
                <p className="font-medium">Verified sender domain <FieldLock enabled={feature.senderDomain} plan="Business" /></p>
              <p className="text-xs text-muted-foreground">Only verified domains owned by the linked Email API project can be selected. This is separate from your website TXT proof.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="branding-domain">Email API domain</Label>
                  <Select value={settings.domainId == null ? "none" : String(settings.domainId)} onValueChange={(value) => setField("domainId", value === "none" ? null : typeof verifiedDomains[0]?.id === "number" ? Number(value) : value)} disabled={!feature.senderDomain}>
                  <SelectTrigger id="branding-domain"><SelectValue placeholder="Choose a verified domain" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Platform sender</SelectItem>{verifiedDomains.map((domain) => <SelectItem key={domain.id} value={String(domain.id)}>{domain.domain} · verified</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label htmlFor="branding-from">From address <FieldLock enabled={feature.senderDomain} plan="Business" /></Label><Input id="branding-from" value={settings.fromAddress} onChange={(e) => setField("fromAddress", e.target.value)} disabled={!feature.senderDomain} maxLength={500} placeholder="hello@your-verified-domain.com" /></div>
              </div>
              {verifiedDomains.length === 0 && <p className="text-xs text-muted-foreground">No verified sender domains are available. Verify a domain in the owned Email API project first.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" />Message copy</CardTitle>
            <CardDescription>Control the wording customers see in verification and recovery emails.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className={`grid gap-4 rounded-lg border p-4 sm:grid-cols-2 ${locked(feature.copy)}`}>
              <div className="space-y-2"><Label htmlFor="verify-subject">Verification subject <FieldLock enabled={feature.copy} plan="Business" /></Label><Input id="verify-subject" value={settings.verifySubject} onChange={(e) => setField("verifySubject", e.target.value)} disabled={!feature.copy} maxLength={160} placeholder="Confirm your email" /></div>
              <div className="space-y-2"><Label htmlFor="reset-subject">Password reset subject <FieldLock enabled={feature.copy} plan="Business" /></Label><Input id="reset-subject" value={settings.resetSubject} onChange={(e) => setField("resetSubject", e.target.value)} disabled={!feature.copy} maxLength={160} placeholder="Reset your password" /></div>
              <div className="space-y-2"><Label htmlFor="verify-intro">Verification introduction <FieldLock enabled={feature.copy} plan="Business" /></Label><Textarea id="verify-intro" value={settings.verifyIntro} onChange={(e) => setField("verifyIntro", e.target.value)} disabled={!feature.copy} maxLength={1500} rows={4} /></div>
              <div className="space-y-2"><Label htmlFor="reset-intro">Recovery introduction <FieldLock enabled={feature.copy} plan="Business" /></Label><Textarea id="reset-intro" value={settings.resetIntro} onChange={(e) => setField("resetIntro", e.target.value)} disabled={!feature.copy} maxLength={1500} rows={4} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="branding-footer">Footer text <FieldLock enabled={feature.copy} plan="Business" /></Label><Textarea id="branding-footer" value={settings.footer} onChange={(e) => setField("footer", e.target.value)} disabled={!feature.copy} maxLength={500} rows={3} /></div>
            </div>
            <div className={`space-y-3 rounded-lg border p-4 ${locked(feature.html)}`}>
              <p className="font-medium">Custom HTML templates <FieldLock enabled={feature.html} plan="Scale" /></p>
              <p className="text-xs text-muted-foreground">Use basic formatting tags only: no scripts, styles, links, attributes or forms. HTML is rendered in an isolated preview; Afro Auth controls the real action links.</p>
              <div className="space-y-2"><Label htmlFor="verify-html">Verification HTML</Label><Textarea id="verify-html" value={settings.verifyHtml} onChange={(e) => setField("verifyHtml", e.target.value)} disabled={!feature.html} maxLength={12000} rows={6} className="font-mono text-xs" /></div>
              <div className="space-y-2"><Label htmlFor="reset-html">Password reset HTML</Label><Textarea id="reset-html" value={settings.resetHtml} onChange={(e) => setField("resetHtml", e.target.value)} disabled={!feature.html} maxLength={12000} rows={6} className="font-mono text-xs" /></div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <p className="font-medium">Afro Auth attribution <FieldLock enabled={feature.whiteLabel} plan="Business" /></p>
              <p className="mt-1 text-xs text-muted-foreground">{feature.whiteLabel ? "Your eligible branded mail omits the platform attribution." : "Platform attribution remains in verification and recovery mail on this package."}</p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => { setSettings({ ...EMPTY_SETTINGS, ...data.settings }); setPreview(null); }} disabled={saveMutation.isPending}>Discard changes</Button>
              <Button onClick={() => saveMutation.mutate(settings)} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving…" : "Save branding"}</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle>Safe preview & test</CardTitle><CardDescription>Preview uses a fake action link. A test sends the saved template only to the account email shown below.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={purpose} onValueChange={(value) => { setPurpose(value as Purpose); setPreview(null); }}>
                <SelectTrigger aria-label="Preview email type"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="verify">Email verification</SelectItem><SelectItem value="reset">Password recovery</SelectItem></SelectContent>
              </Select>
              <Button variant="outline" onClick={updatePreview} disabled={previewMutation.isPending} className="shrink-0"><Eye className="mr-2 h-4 w-4" />{previewMutation.isPending ? "Building…" : "Preview current edits"}</Button>
            </div>
            {previewError && <Alert variant="destructive"><AlertDescription>{previewError}</AlertDescription></Alert>}
            {preview ? <div className="overflow-hidden rounded-lg border">
              <div className="space-y-1 border-b bg-muted/40 p-3 text-xs"><p><strong>Subject:</strong> {preview.subject}</p><p className="break-all"><strong>From:</strong> {preview.from}</p>{preview.replyTo && <p><strong>Reply-to:</strong> {preview.replyTo}</p>}</div>
              <iframe title={`${purpose === "verify" ? "Verification" : "Password recovery"} email preview`} srcDoc={preview.html} sandbox="" referrerPolicy="no-referrer" className="h-72 w-full bg-white" />
              <details className="border-t p-3"><summary className="cursor-pointer text-sm font-medium">Plain-text version</summary><pre className="mt-2 whitespace-pre-wrap text-xs">{preview.text}</pre></details>
            </div> : <div className="grid min-h-48 place-items-center rounded-lg border border-dashed bg-muted/20 p-6 text-center">
              <div><Eye className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="text-sm font-medium">Preview appears here</p><p className="mt-1 text-xs text-muted-foreground">This does not send an email.</p></div>
            </div>}
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Test destination</p>
              <p className="mt-1 break-all text-sm">{data.testRecipient || "Current account email"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Test sends the saved template only. “Accepted” means queued for processing, not delivered to an inbox.</p>
              <Button className="mt-3 w-full" variant="outline" onClick={() => testMutation.mutate(purpose)} disabled={testMutation.isPending}>
                <Send className="mr-2 h-4 w-4" />{testMutation.isPending ? "Submitting test…" : `Send saved ${purpose === "verify" ? "verification" : "recovery"} test`}
              </Button>
            </div>
            {data.recentMail.length > 0 && <div><p className="mb-2 text-sm font-medium">Recent email activity</p><ul className="space-y-2">{data.recentMail.slice(0, 4).map((mail, index) => <li key={`${mail.message_id || mail.created_at}-${index}`} className="flex items-start justify-between gap-3 rounded-md border p-2 text-xs"><span className="capitalize">{mail.purpose} · {mail.reason || mail.outcome}</span><span className="shrink-0 text-muted-foreground">{new Date(mail.created_at).toLocaleString()}</span></li>)}</ul></div>}
          </CardContent>
        </Card>
        <Card className="border-primary/20">
          <CardHeader><CardTitle>Choose a branding package</CardTitle><CardDescription>Prepaid access lasts 30 days. No automatic debit. One Afro Auth package covers your owned projects up to its app limit; separate builder and Email API plans are unaffected.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => { void refetch(); void queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants", projectId] }); }} disabled={isFetching}><RefreshCw className="mr-2 h-4 w-4" />Refresh access status</Button></div>
            {awaitingPlan && <Alert><RefreshCw className="h-4 w-4" /><AlertDescription>Checkout is in progress. Branding and project entitlement will refresh automatically while payment confirmation is checked; payment is not treated as access until the server confirms fulfilment.</AlertDescription></Alert>}
            {packageOptions.filter((pkg) => pkg.usd > 0).map((pkg) => <div key={pkg.key} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium">{pkg.name} <span className="font-mono text-sm text-primary">${pkg.usd}/30 days</span></p><p className="text-xs text-muted-foreground">{pkg.mau.toLocaleString()} monthly active users · {Number(pkg.apps) === -1 ? "unlimited owned projects" : `${pkg.apps} owned app${Number(pkg.apps) === 1 ? "" : "s"}`}</p></div>
              <Button size="sm" variant={data.package.key === pkg.key ? "secondary" : "outline"} disabled={data.package.key === pkg.key || subscribeMutation.isPending || !!awaitingPlan} onClick={() => subscribeMutation.mutate(pkg.key)}>{data.package.key === pkg.key ? <><Check className="mr-1 h-4 w-4" />Current</> : `Select ${pkg.name}`}</Button>
            </div>)}
            <div className="space-y-2 pt-1"><Label htmlFor="branding-country">Country code for payment pricing</Label><Input id="branding-country" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} aria-describedby="country-hint" placeholder="UG" /><p id="country-hint" className="text-xs text-muted-foreground">Enter a two-letter country code, or leave blank for USD/worldwide checkout.</p></div>
            <p className="text-xs text-muted-foreground">The server prepares a secure checkout; selecting a package does not claim payment or change access until confirmed.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>;
}
