import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Check, Copy, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";

interface PrivateKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  replacesKeyId: string | null;
}
interface CredentialResponse { enforcement: "legacy" | "required"; keys: PrivateKey[] }
interface SecretResponse { key: PrivateKey; secretKey: string }

export function ChatbotApiCredentials({ widgetId }: { widgetId: number | string }) {
  const { toast } = useToast();
  const path = `/api/chatbots/${encodeURIComponent(String(widgetId))}/api-credentials`;
  const [name, setName] = useState("production");
  const [secret, setSecret] = useState<SecretResponse | null>(null);
  const [saved, setSaved] = useState(false);
  const [enforceConfirm, setEnforceConfirm] = useState(false);
  const [errorText, setErrorText] = useState("");
  const { data, isLoading, isError, refetch } = useQuery<CredentialResponse>({ queryKey: [path], retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: [path] });
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", path, { name: name.trim() || "production" })).json() as Promise<SecretResponse>,
    retry: false, gcTime: 0,
    onSuccess: (result) => { setSecret(result); setSaved(false); setErrorText(""); refresh(); },
    onError: () => setErrorText("Couldn't create a private credential. Try again."),
  });
  const rotate = useMutation({
    mutationFn: async (keyId: string) => (await apiRequest("POST", `${path}/${encodeURIComponent(keyId)}/rotate`)).json() as Promise<SecretResponse>,
    retry: false, gcTime: 0,
    onSuccess: (result) => { setSecret(result); setSaved(false); setErrorText(""); refresh(); },
    onError: () => setErrorText("Couldn't rotate this credential. Try again."),
  });
  const revoke = useMutation({
    mutationFn: async (keyId: string) => apiRequest("POST", `${path}/${encodeURIComponent(keyId)}/revoke`, { confirm: true }),
    retry: false,
    onSuccess: () => { refresh(); toast({ title: "Private credential revoked" }); },
    onError: () => toast({ title: "Couldn't revoke credential", variant: "destructive" }),
  });
  const enforce = useMutation({
    mutationFn: async () => (await apiRequest("POST", `${path}/enforce`, { confirm: true })).json(),
    retry: false,
    onSuccess: () => { setEnforceConfirm(false); refresh(); toast({ title: "Private credentials required" }); },
    onError: () => { setErrorText("Couldn't enable private-key enforcement. Check that an active private key exists."); },
  });
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setSaved(true); toast({ title: "Secret copied", description: "Keep it on your server; do not add it to browser code." }); }
    catch { toast({ title: "Couldn't copy secret", description: "Select and copy it manually.", variant: "destructive" }); }
  };
  const clearSecret = (open: boolean) => {
    if (!open) { setSecret(null); setSaved(false); create.reset(); rotate.reset(); }
  };

  return <section className="p-4 sm:p-6" data-testid="chatbot-private-credentials">
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-primary" />Private server credentials</CardTitle>
        <CardDescription>These high-entropy credentials authenticate server-to-server API calls. They are separate from the public widget ID used by the browser embed. New bots require private credentials by default; key management does not change your plan or Agency/founder entitlements.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <div className="space-y-2" aria-label="Loading credentials"><div className="h-10 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded bg-muted" /></div>
          : isError || !data ? <Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-3">Credential settings couldn't load. <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button></AlertDescription></Alert>
          : <>
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2"><span className="text-sm font-semibold">API enforcement</span><Badge variant={data.enforcement === "required" ? "default" : "outline"}>{data.enforcement === "required" ? "Private key required" : "Legacy access"}</Badge></div>
                {data.enforcement === "legacy"
                  ? <p className="max-w-2xl text-xs text-muted-foreground">The public widget ID still authorizes legacy server calls. This remains unchanged until you opt in; switching requires an active private key and stops legacy server calls using the public widget ID. Browser embeds are unaffected.</p>
                  : <p className="text-xs text-muted-foreground">Server requests must use an active private key. Browser embeds continue using the same public widget ID.</p>}
              </div>
              {data.enforcement === "legacy" && <Button variant="outline" size="sm" disabled={!data.keys.some((key) => !key.revokedAt)} onClick={() => setEnforceConfirm(true)}>Require private key</Button>}
            </div>
            {data.enforcement === "legacy" && <Alert className="border-amber-500/40 bg-amber-500/5"><AlertTriangle className="h-4 w-4 text-amber-600" /><AlertDescription><strong>Legacy access is still on.</strong> Deploy a private key to your server and update every server integration before switching enforcement. This does not revoke existing keys.</AlertDescription></Alert>}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-2"><Label htmlFor={`private-key-name-${widgetId}`}>Credential name</Label><Input id={`private-key-name-${widgetId}`} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="production server" /></div>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}><KeyRound className="mr-2 h-4 w-4" />{create.isPending ? "Generating…" : "Generate private key"}</Button>
            </div>
            {errorText && <p role="alert" className="text-sm text-destructive">{errorText}</p>}
            <div className="space-y-3">
              {data.keys.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center"><KeyRound className="mx-auto mb-2 h-5 w-5 text-muted-foreground" /><p className="text-sm font-medium">No private credentials</p><p className="mt-1 text-xs text-muted-foreground">Generate a key for trusted server integrations. It is never needed in browser code.</p></div> :
                data.keys.map((key) => <div key={key.id} className={`rounded-lg border p-4 ${key.revokedAt ? "opacity-60" : ""}`} data-testid={`private-key-${key.id}`}>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{key.name}</span><Badge variant={key.revokedAt ? "secondary" : "outline"}>{key.revokedAt ? "Revoked" : "Active"}</Badge></div>
                      <code className="mt-2 block break-all text-xs text-muted-foreground">{key.prefix}••••••••</code>
                      <p className="mt-1 text-xs text-muted-foreground">Created {new Date(key.createdAt).toLocaleDateString()}{key.lastUsedAt ? ` · Last used ${new Date(key.lastUsedAt).toLocaleString()}` : " · Not used yet"}</p>
                    </div>
                    {!key.revokedAt && <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={rotate.isPending || create.isPending} onClick={() => {
                        if (window.confirm("Generate a replacement private key? This key stays active during rollout. Deploy the replacement before revoking this one.")) rotate.mutate(key.id);
                      }}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Rotate</Button>
                      <Button size="sm" variant="destructive" disabled={revoke.isPending} onClick={() => {
                        if (window.confirm("Revoke this private key permanently? Any server still using it will lose API access immediately.")) revoke.mutate(key.id);
                      }}>Revoke</Button>
                    </div>}
                  </div>
                  {key.replacesKeyId && <p className="mt-3 rounded-md bg-primary/5 p-2 text-xs text-muted-foreground">Safe overlap: replacement for key <code>{key.replacesKeyId}</code>. This key remains active until you revoke it.</p>}
                </div>)}
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">Server-only request example</p>
              <p className="mb-2 mt-1 text-xs text-muted-foreground">Keep the credential in a server environment variable. Never put it in the widget embed or client-side JavaScript.</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 text-xs leading-relaxed [overflow-wrap:anywhere]"><code>{`await fetch("https://afroaigroup.com/api/v1/chatbot/message", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + process.env.AFRO_CHATBOT_API_KEY
  },
  body: JSON.stringify({ message: "Hello" })
});`}</code></pre>
            </div>
          </>}
      </CardContent>
    </Card>
    <Dialog open={!!secret} onOpenChange={clearSecret}>
      <DialogContent onEscapeKeyDown={(event) => { if (!saved) event.preventDefault(); }}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" />Save this private key now</DialogTitle>
          <DialogDescription>This secret is shown once. Store it in your server environment; closing clears it from this page.</DialogDescription></DialogHeader>
        {secret && <div className="space-y-4">
          <div><p className="mb-1 text-xs font-medium text-muted-foreground">Public prefix · identifier, not a secret</p><code className="block break-all rounded bg-muted p-3 text-sm">{secret.key.prefix}</code></div>
          <div><p className="mb-1 text-xs font-medium text-muted-foreground">Private secret · server only</p><code className="block break-all rounded bg-muted p-3 text-sm" data-testid="private-secret-once">{secret.secretKey}</code></div>
          {secret.key.replacesKeyId && <Alert><Check className="h-4 w-4" /><AlertDescription>Overlap is active. Deploy this replacement, then explicitly revoke the old key <code>{secret.key.replacesKeyId}</code>.</AlertDescription></Alert>}
          <Button className="w-full" onClick={() => copy(secret.secretKey)}><Copy className="mr-2 h-4 w-4" />Copy private key</Button>
        </div>}
        <DialogFooter><Button variant="outline" disabled={!saved} onClick={() => clearSecret(false)}>I've saved it — close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={enforceConfirm} onOpenChange={setEnforceConfirm}>
      <DialogContent><DialogHeader><DialogTitle>Require private credentials?</DialogTitle><DialogDescription>Deploy an active private key to every server integration first. This permanently opts the bot out of legacy API access; requests that use only the public widget ID will stop working. Browser embeds and their public widget ID remain unchanged.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setEnforceConfirm(false)}>Not yet</Button><Button variant="destructive" disabled={enforce.isPending || !data?.keys.some((key) => !key.revokedAt)} onClick={() => enforce.mutate()}>{enforce.isPending ? "Switching…" : "I deployed the key — switch"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
