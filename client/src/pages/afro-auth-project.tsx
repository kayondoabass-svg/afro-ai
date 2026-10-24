import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { prepareAuthOrigins, readableApiError } from "@shared/customer-api-setup";
import { DomainSetup } from "@/components/auth-setup/domain-setup";
import { UserDirectory } from "@/components/auth-setup/user-directory";
import { ApiUpgrade } from "@/components/auth-setup/api-upgrade";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, AlertTriangle, Check, CircleAlert, Copy, Download, KeyRound, Plus, RefreshCw, Settings, Users } from "lucide-react";

interface TenantDetail {
  tenant: {
    id: string; slug: string; name: string; plan: string;
    allowed_origins: string | null; created_at: number; updated_at: number; setup_required?: number;
  };
  stats: { mau: number; mauLimit: number; totalUsers: number };
  keys: ApiKey[];
  setup?: { required: boolean; canCreateKeys: boolean; verifiedDomainCount: number; userStore: "D1"; userFolder: string };
}
interface ApiKey {
  id: string; public_key: string; secret_preview: string; label: string | null;
  last_used_at: number | null; revoked_at: number | null; created_at: number;
}
interface NewKey {
  id: string; public_key: string; secret_key: string; secret_preview: string; label: string | null; created_at: number; replaces_key_id?: string | null;
}

export default function AfroAuthProjectPage() {
  const [, params] = useRoute("/dashboard/auth/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const id = params?.id || "";
  const [activeTab, setActiveTab] = useState("quickstart");
  const [newSecret, setNewSecret] = useState<NewKey | null>(null);
  const [keyLabel, setKeyLabel] = useState("production");
  const [secretCopied, setSecretCopied] = useState(false);
  const [keyError, setKeyError] = useState("");
  const detailPath = `/cf-auth/v1/admin/tenants/${id}`;
  const { data, isLoading, error, refetch } = useQuery<TenantDetail>({
    queryKey: ["/cf-auth/v1/admin/tenants", id],
    enabled: !!id,
    retry: false,
  });
  const setup = data?.setup;
  const { data: apiChoice } = useQuery<{selectedContract:"legacy"|"v1"|null;urls:{legacy:string;v1:string}}>({
    queryKey:[`${detailPath}/api-upgrade`],enabled:!!id,retry:false,
  });
  const createAllowed = setup?.canCreateKeys === true;

  const createKey = useMutation({
    gcTime: 0,
    mutationFn: async () => (await apiRequest("POST", `${detailPath}/keys`, { label: keyLabel.trim() || "production" })).json() as Promise<NewKey>,
    onSuccess: (key) => {
      setKeyError("");
      setSecretCopied(false);
      setNewSecret(key);
      queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants", id] });
      queryClient.invalidateQueries({ queryKey: [detailPath, "domains"] });
    },
    onError: (e) => setKeyError(readableApiError(e, "Couldn't create an API key. Verify a website domain first.")),
  });
  const rotateKey = useMutation({
    gcTime: 0,
    mutationFn: async (keyId: string) => (await apiRequest("POST", `${detailPath}/keys/${encodeURIComponent(keyId)}/rotate`, { confirm: true })).json() as Promise<NewKey>,
    onSuccess: (key) => {
      setSecretCopied(false);
      setNewSecret(key);
      setKeyError("");
      queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants", id] });
    },
    onError: (e) => setKeyError(readableApiError(e, "Couldn't rotate this key.")),
  });
  const revokeKey = useMutation({
    mutationFn: async (keyId: string) => apiRequest("DELETE", `${detailPath}/keys/${encodeURIComponent(keyId)}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants", id] }); toast({ title: "Key revoked" }); },
    onError: (e) => toast({ title: "Couldn't revoke key", description: readableApiError(e, "Please try again."), variant: "destructive" }),
  });
  const renameMutation = useMutation({
    mutationFn: async (vars: { name?: string; allowed_origins?: string[] }) => apiRequest("PATCH", detailPath, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants", id] });
      toast({ title: "Settings saved" });
    },
    onError: (e) => toast({ title: "Couldn't save settings", description: readableApiError(e, "Please try again."), variant: "destructive" }),
  });
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
      return true;
    } catch {
      toast({ title: `Couldn't copy ${label.toLowerCase()}`, description: "Select and copy the text manually.", variant: "destructive" });
      return false;
    }
  };
  const saveEnv = () => {
    if (!newSecret || !data?.tenant) return;
    const contents = [
      `AFRO_AUTH_PROJECT_SLUG=${data.tenant.slug}`,
      `AFRO_AUTH_PUBLIC_KEY=${newSecret.public_key}`,
      `AFRO_AUTH_SECRET_KEY=${newSecret.secret_key}`,
      "",
    ].join("\n");
    const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = ".env";
    anchor.click();
    URL.revokeObjectURL(href);
    setSecretCopied(true);
    toast({ title: ".env file downloaded", description: "Store it securely on your server. Never commit secrets to source control." });
  };
  const closeSecret = (open: boolean) => {
    if (!open) {
      if (newSecret && !secretCopied && !window.confirm("Close without saving? This secret cannot be retrieved later. You would need to generate another key.")) return;
      setNewSecret(null);
      setSecretCopied(false);
      createKey.reset();
      rotateKey.reset();
    }
  };
  useEffect(() => {
    setNewSecret(null); setSecretCopied(false); setKeyError("");
    createKey.reset(); rotateKey.reset();
  }, [id]);

  if (isLoading) return <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" aria-label="Loading project">
    <Skeleton className="h-8 w-48" /><Skeleton className="h-36 w-full" /><Skeleton className="h-64 w-full" />
  </div>;

  if (error || !data) {
    const msg = readableApiError(error, "");
    const isAuth = /401|403|unauthor/i.test(msg);
    const isNotFound = /404|not.?found/i.test(msg);
    return <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Link href="/dashboard/auth" className="mb-4 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted"><ArrowLeft className="mr-2 h-4 w-4" />All projects</Link>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><CircleAlert className="h-5 w-5 text-destructive" />{isNotFound ? "Project not found" : isAuth ? "Owner access required" : "Couldn't load this project"}</CardTitle>
        <CardDescription>{isNotFound ? "This project may have been deleted, or the link is incorrect." : isAuth ? "Sign in with the Afro AI account that owns this project." : msg || "The project details could not be loaded."}</CardDescription></CardHeader>
        <CardContent className="flex gap-2"><Button onClick={() => refetch()} variant="outline">Try again</Button><Button onClick={() => setLocation("/dashboard/auth")}>Back to projects</Button></CardContent></Card>
    </div>;
  }

  const t = data.tenant;
  const mauPct = data.stats.mauLimit > 0 ? Math.min(100, (data.stats.mau / data.stats.mauLimit) * 100) : 0;
  const projectUrl = apiChoice?.selectedContract === "legacy"
    ? apiChoice.urls.legacy : `https://afroaigroup.com/cf-auth/v1/t/${t.slug}`;
  const liveKeys = data.keys.filter((key) => !key.revoked_at);
  const setupRequired = setup?.required === true || t.setup_required === 1;
  const verifiedDomainCount = setup?.verifiedDomainCount ?? 0;
  const projectReady = verifiedDomainCount > 0 && liveKeys.length > 0;
  const replacedKey = newSecret?.replaces_key_id
    ? data.keys.find((key) => key.id === newSecret.replaces_key_id)
    : undefined;

  return <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
    <div className="mb-5">
      <Link href="/dashboard/auth" className="-ml-3 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted"><ArrowLeft className="mr-2 h-4 w-4" />All projects</Link>
    </div>
    <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="secondary">{t.plan}</Badge>{setupRequired && <Badge variant={projectReady ? "secondary" : "outline"} className={!projectReady ? "border-amber-600/40 text-amber-700 dark:text-amber-400" : ""}>{projectReady ? "Ready" : "Setup in progress"}</Badge>}</div>
        <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl" data-testid="text-project-name">{t.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 text-sm" data-testid="text-project-slug">{t.slug}</code>
          <Button variant="ghost" size="sm" onClick={() => copy(t.slug, "Project slug")} aria-label="Copy project slug"><Copy className="h-4 w-4" /></Button>
          <span className="text-xs text-muted-foreground">Project slug · safe to expose</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:min-w-[390px]">
        <StatCard label="Monthly active" value={data.stats.mau.toLocaleString()} sub={`${mauPct.toFixed(0)}% of limit`} />
        <StatCard label="Signups" value={data.stats.totalUsers.toLocaleString()} />
        <StatCard label="Active keys" value={String(liveKeys.length)} />
      </div>
    </header>
    <Alert className="mb-5">
      <AlertDescription>
        “Ready” reflects website ownership proof and an active key only. It does not confirm email delivery or prove your customer app has completed integration.
      </AlertDescription>
    </Alert>

    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="mb-2 grid h-auto w-full grid-cols-4 p-1 sm:inline-flex sm:w-auto">
        <TabsTrigger value="quickstart" data-testid="tab-quickstart">Setup</TabsTrigger>
        <TabsTrigger value="keys" data-testid="tab-keys"><KeyRound className="mr-1.5 hidden h-4 w-4 sm:inline" />API keys</TabsTrigger>
        <TabsTrigger value="users" data-testid="tab-users"><Users className="mr-1.5 hidden h-4 w-4 sm:inline" />Users</TabsTrigger>
        <TabsTrigger value="settings" data-testid="tab-settings"><Settings className="mr-1.5 hidden h-4 w-4 sm:inline" />Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="quickstart" className="mt-4 space-y-5">
        <Card className="border-primary/20 bg-primary/[0.035]">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Your integration details</p>
              <p className="mt-1 font-medium">{t.name} · <code className="break-all">{t.slug}</code></p>
              <p className="mt-1 text-sm text-muted-foreground">Use this exact API base URL in your customer app and the matching server environment.</p>
              <code className="mt-2 block break-all rounded-md border bg-background/70 px-3 py-2 text-xs">{projectUrl}</code>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" onClick={() => setActiveTab("settings")}>Configure origins</Button>
              <Button variant="outline" asChild><Link href="/docs/auth#start">Full setup guide</Link></Button>
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
          <DomainSetup tenantId={id} />
          <Card className="h-fit">
            <CardHeader><CardTitle className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm text-primary">2</span>Then create your key</CardTitle>
              <CardDescription>Key creation unlocks when the API confirms website ownership. A pending TXT record is not enough.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <CopyableCode text={projectUrl} label="Website API base URL" onCopy={copy} />
                <CopyableCode text={t.slug} label="Project slug" onCopy={copy} />
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3">
                {verifiedDomainCount > 0 ? <Check className="mt-0.5 h-5 w-5 text-primary" /> : <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-xs">•</span>}
                <div><p className="font-medium">{verifiedDomainCount > 0 ? "Website ownership verified" : "Waiting for website proof"}</p><p className="mt-1 text-xs text-muted-foreground">{verifiedDomainCount > 0 ? `${verifiedDomainCount} domain${verifiedDomainCount === 1 ? "" : "s"} verified` : "Add your hostname and publish its TXT record above."}</p></div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                This TXT record proves control of your website hostname. It is not email-sending DNS and does not confirm a customer's mailbox.
              </p>
              <label htmlFor="key-label" className="text-sm font-medium">Key label</label>
              <Input id="key-label" value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} maxLength={80} placeholder="production" />
              <Button className="w-full" onClick={() => { setKeyError(""); createKey.mutate(); }} disabled={!createAllowed || createKey.isPending}>
                <Plus className="mr-2 h-4 w-4" />{createKey.isPending ? "Generating key…" : "Generate API key"}
              </Button>
              {!createAllowed && <p className="text-xs text-muted-foreground">Key generation is disabled until setup verification allows it. Existing keys remain available in the API keys tab.</p>}
              {keyError && <Alert variant="destructive"><AlertDescription>{keyError}</AlertDescription></Alert>}
              <p className="text-xs text-muted-foreground">The secret is displayed once. Copy it or save the downloaded .env file before closing the dialog.</p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle>3. Connect your website</CardTitle><CardDescription>Use the canonical project endpoint. Signup sends a confirmation link; it does not issue a session token.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <CopyableCode text={`${projectUrl}/signup`} label="Signup endpoint" onCopy={copy} />
            <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed"><code>{`fetch("${projectUrl}/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
}).then(async response => {
  const data = await response.json();
  if (!response.ok) throw new Error(data.message);
  // Show a “check your email” message. The user must confirm before login.
  return data;
});`}</code></pre>
            <Alert><AlertDescription>Email confirmation is separate from DNS ownership. Afro Auth sends signup confirmation links using the platform sender. You do not need an email API key or a sending domain for customer signup confirmation.</AlertDescription></Alert>
            <p className="text-sm text-muted-foreground">
              After signup, direct the customer to check the inbox for the address they entered, including spam or junk, and explicitly submit the confirmation form before attempting login. A successful response from a resend endpoint acknowledges the request; it is not proof the email arrived.
            </p>
          </CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Verify sessions on your server</CardTitle><CardDescription>Keep the secret key in server-side environment variables; never expose it to browser code.</CardDescription></CardHeader><CardContent className="space-y-3">
            <CopyableCode text={`${projectUrl}/login`} label="Login endpoint" onCopy={copy} />
            <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed"><code>{`// After email confirmation, sign in:
const login = await fetch("${projectUrl}/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
});
if (!login.ok) throw new Error((await login.json()).message);
const { token } = await login.json();

// On your backend, verify each session before protected operations:
const verification = await fetch("https://afroaigroup.com/cf-auth/v1/sessions/verify", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + process.env.AFRO_AUTH_SECRET_KEY
  },
  body: JSON.stringify({ token })
});
const result = await verification.json();
if (!verification.ok || result.valid !== true) {
  throw new Error("Session is invalid or expired");
}
return result.user;`}</code></pre>
            <p className="text-xs text-muted-foreground">Set <code>AFRO_AUTH_PROJECT_SLUG</code>, <code>AFRO_AUTH_PUBLIC_KEY</code>, and <code>AFRO_AUTH_SECRET_KEY</code> in your server environment. Keep secrets out of source control and public variables.</p>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Account lifecycle</CardTitle><CardDescription>Hosted confirmation and recovery keep email ownership separate from your website setup.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-2 pl-5">
              <li>After the customer confirms their email, send their credentials to <code>/login</code>.</li>
              <li><code>POST /send-verification</code> and <code>POST /forgot-password</code> accept an email and deliberately avoid revealing whether an account exists.</li>
              <li><code>GET /me</code>, <code>GET /sessions</code>, <code>POST /logout</code>, <code>POST /logout-all</code>, and <code>DELETE /sessions/:id</code> use the customer's bearer token.</li>
              <li>Validate tokens on your backend against <code>/cf-auth/v1/sessions/verify</code>; offline signature checks cannot detect revoked sessions.</li>
              <li>Social login uses PKCE. Register the exact callback origin in project settings before integrating it.</li>
            </ul>
            <p className="border-t pt-3 text-xs text-muted-foreground">Website TXT proof authorizes the website integration. It does not send signup email and does not confirm a customer's email address.</p>
          </CardContent></Card>
        </div>
        <ApiUpgrade tenantId={id} />
      </TabsContent>

      <TabsContent value="keys" className="mt-4">
        <Card><CardHeader><CardTitle>Project API keys</CardTitle><CardDescription>Existing and legacy keys are shown here. A secret can only be seen when it is first generated or rotated.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium">Generate a project key</p><p className="text-sm text-muted-foreground">{createAllowed ? "Website proof is verified. Generate a key for your server." : "Complete domain verification before generating or rotating keys."}</p></div>
              <Button onClick={() => { setActiveTab("quickstart"); }} disabled={!createAllowed} variant="outline"><Plus className="mr-2 h-4 w-4" />Create from setup</Button>
            </div>
            {keyError && <Alert variant="destructive"><AlertDescription>{keyError}</AlertDescription></Alert>}
            {data.keys.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center"><KeyRound className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="font-medium">No API keys yet</p><p className="mt-1 text-sm text-muted-foreground">Verify a website domain to generate the first key.</p></div> :
              <div className="space-y-3">{data.keys.map((key) => <div key={key.id} className={`rounded-xl border p-4 ${key.revoked_at ? "opacity-60" : ""}`} data-testid={`row-key-${key.id}`}>
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{key.label || "Unlabelled key"}</p>{key.revoked_at && <Badge variant="secondary">Revoked</Badge>}{!key.revoked_at && <Badge variant="outline">Active</Badge>}</div>
                    <p className="mt-2 text-xs text-muted-foreground">Public key</p><code className="block break-all text-sm">{key.public_key}</code>
                    <p className="mt-2 text-xs text-muted-foreground">Secret preview · generated {new Date(key.created_at * 1000).toLocaleDateString()}</p><code className="text-sm">{key.secret_preview}</code>
                  </div>
                  {!key.revoked_at && <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" disabled={!createAllowed || rotateKey.isPending} onClick={() => {
                      if (window.confirm("Create a replacement key? The existing key will remain active so you can deploy the replacement without downtime. After the new key is deployed, explicitly revoke this old key.")) rotateKey.mutate(key.id);
                    }}><RefreshCw className="mr-2 h-4 w-4" />Regenerate</Button>
                    <Button variant="outline" size="sm" disabled={revokeKey.isPending} onClick={() => {
                      if (window.confirm("Revoke this key? Any application still using it will stop working immediately.")) revokeKey.mutate(key.id);
                    }}>Revoke</Button>
                  </div>}
                </div>
              </div>)}</div>
            }
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="users" className="mt-4">
        <UserDirectory tenantId={id} active={activeTab === "users"} />
      </TabsContent>
      <TabsContent value="settings" className="mt-4">
        <SettingsForm tenant={t} onSave={renameMutation.mutate} saving={renameMutation.isPending} />
      </TabsContent>
    </Tabs>

    <Dialog open={!!newSecret} onOpenChange={closeSecret}>
      <DialogContent onEscapeKeyDown={(event) => { if (!secretCopied) event.preventDefault(); }}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" />Save this secret now</DialogTitle>
          <DialogDescription>This secret is shown only once. Copy it or download the .env file to a secure server location. Closing clears it from this page.</DialogDescription></DialogHeader>
        {newSecret && <div className="space-y-4">
          <div><p className="mb-1 text-xs font-medium text-muted-foreground">Public key</p><code className="block break-all rounded bg-muted p-3 text-sm">{newSecret.public_key}</code></div>
          <div><p className="mb-1 text-xs font-medium text-muted-foreground">Secret key</p><code className="block break-all rounded bg-muted p-3 text-sm" data-testid="text-new-secret">{newSecret.secret_key}</code></div>
          {newSecret.replaces_key_id && <Alert>
            <AlertDescription>
              <strong>Safe rotation:</strong> the previous key remains active. Deploy this replacement first, then explicitly revoke the old key.
              {replacedKey && <span className="mt-2 block">Old key to revoke after deployment: <strong>{replacedKey.label || "Unlabelled key"}</strong> · <code className="break-all">{replacedKey.public_key}</code></span>}
              {!replacedKey && <span className="mt-2 block">Old key ID to revoke after deployment: <code className="break-all">{newSecret.replaces_key_id}</code></span>}
            </AlertDescription>
          </Alert>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={async () => { const copied = await copy(newSecret.secret_key, "Secret key"); setSecretCopied(copied); }} data-testid="button-copy-secret"><Copy className="mr-2 h-4 w-4" />Copy secret</Button>
            <Button variant="outline" className="flex-1" onClick={saveEnv}><Download className="mr-2 h-4 w-4" />Save .env file</Button>
          </div>
          <p className="text-xs text-muted-foreground">Downloaded file contains project slug, public key, and secret key. Store it outside your public web root.</p>
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => closeSecret(false)} disabled={!secretCopied}>I've saved it — close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </main>;
}

function CopyableCode({ text, label, onCopy }: { text: string; label: string; onCopy: (text: string, label: string) => Promise<boolean> | void }) {
  return <div className="flex min-w-0 items-center gap-2"><div className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2">
    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span><code className="block break-all text-xs">{text}</code>
  </div><Button variant="outline" size="icon" aria-label={`Copy ${label}`} onClick={() => onCopy(text, label)}><Copy className="h-4 w-4" /></Button></div>;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="min-w-0 rounded-xl border bg-card px-3 py-3 sm:px-4">
    <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</div>
    <div className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{value}</div>{sub && <div className="truncate text-[10px] text-muted-foreground sm:text-xs">{sub}</div>}
  </div>;
}

export function SettingsForm({ tenant, onSave, saving }: {
  tenant: TenantDetail["tenant"];
  onSave: (vars: { name?: string; allowed_origins?: string[] }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(tenant.name);
  const [originError, setOriginError] = useState("");
  const [origins, setOrigins] = useState(() => {
    try { return JSON.parse(tenant.allowed_origins || "[]").join("\n"); } catch { return ""; }
  });
  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>Project name</CardTitle><CardDescription>Use a name your team will recognize. The project slug does not change.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row">
      <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Project name" data-testid="input-rename" />
      <Button onClick={() => onSave({ name: name.trim() })} disabled={saving || !name.trim() || name === tenant.name} data-testid="button-save-name">{saving ? "Saving…" : "Save name"}</Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Allowed website origins</CardTitle><CardDescription>Each exact origin on its own line (up to 10). No wildcards or paths. This list controls browser CORS access; DNS ownership proof is managed in Setup.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <textarea value={origins} onChange={(e) => { setOrigins(e.target.value); setOriginError(""); }} className="min-h-[110px] w-full rounded-md border bg-background p-3 font-mono text-sm" placeholder={"https://yourapp.com\nhttps://www.yourapp.com"} data-testid="textarea-origins" aria-invalid={!!originError} aria-describedby="origin-help origin-error" />
        <p id="origin-help" className="text-xs text-muted-foreground">Example: https://example.com and https://www.example.com on separate lines. A trailing root slash is removed. Empty origins block browser integrations. HTTP localhost is allowed for development.</p>
        <p id="origin-error" role="alert" className="text-sm text-destructive">{originError}</p>
        <Button onClick={() => {
          try { const allowed_origins = prepareAuthOrigins(origins); setOrigins(allowed_origins.join("\n")); setOriginError(""); onSave({ allowed_origins }); }
          catch (error) { setOriginError(readableApiError(error, "Check your website origins.")); }
        }} disabled={saving} data-testid="button-save-origins">{saving ? "Saving…" : "Save origins"}</Button>
      </CardContent>
    </Card>
  </div>;
}
