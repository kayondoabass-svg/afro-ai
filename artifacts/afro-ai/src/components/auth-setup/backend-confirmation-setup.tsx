import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { readableApiError } from "@shared/customer-api-setup";
import backendSample from "../../../../../examples/afro-auth-backend/server.mjs?raw";
import callbackPageSample from "../../../../../examples/afro-auth-backend/CallbackPage.jsx?raw";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Check, CircleAlert, Copy, Download, RefreshCw, ShieldCheck } from "lucide-react";

interface ConfirmationFlow {
  enabled: boolean;
  callbackUrl: string | null;
  exchangeUrl: string;
}

export function BackendConfirmationSetup({ tenantId }: { tenantId: string }) {
  const path = `/cf-auth/v1/admin/tenants/${tenantId}/confirmation-flow`;
  const [callbackUrl, setCallbackUrl] = useState("");
  const [initializedFor, setInitializedFor] = useState("");
  const [formError, setFormError] = useState("");
  const [feedback, setFeedback] = useState("");
  const { data, isLoading, isFetching, error, refetch } = useQuery<ConfirmationFlow>({
    queryKey: [path],
    enabled: !!tenantId,
    retry: false,
    queryFn: async () => (await apiRequest("GET", path)).json() as Promise<ConfirmationFlow>,
  });

  useEffect(() => {
    if (data && initializedFor !== path) {
      setCallbackUrl(data.callbackUrl ?? "");
      setInitializedFor(path);
    }
  }, [data, initializedFor, path]);

  const save = useMutation({
    mutationFn: async (next: string | null) =>
      (await apiRequest("PATCH", path, { callbackUrl: next })).json() as Promise<ConfirmationFlow>,
    onSuccess: (result) => {
      setCallbackUrl(result.callbackUrl ?? "");
      setFormError("");
      setFeedback(result.enabled
        ? "Backend confirmation handoff saved and enabled."
        : "Backend confirmation handoff disabled. Existing integrations are unchanged.");
      queryClient.setQueryData([path], result);
    },
    onError: (e) => {
      setFeedback("");
      setFormError(readableApiError(e, "Could not save the confirmation flow. Check the URL and try again."));
    },
  });

  const validateCallback = (value: string): string | null => {
    if (!value.trim()) return null;
    let parsed: URL;
    try { parsed = new URL(value.trim()); } catch { return "Enter a complete callback URL."; }
    const localDevelopment = import.meta.env.DEV &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");
    if (parsed.protocol !== "https:" && !(localDevelopment && parsed.protocol === "http:")) {
      return "Use HTTPS. HTTP is accepted only for localhost during development.";
    }
    if (parsed.username || parsed.password || parsed.hash) return "Do not include credentials or a URL fragment.";
    return null;
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} copied.`);
    } catch {
      setFormError(`Couldn't copy ${label.toLowerCase()}. Select and copy it manually.`);
    }
  };
  const downloadSample = (contents: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type: "text/javascript;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <section className="space-y-4" aria-labelledby="backend-confirmation-title">
    <Card className="overflow-hidden">
      <div className="h-1 bg-primary" />
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <CardTitle id="backend-confirmation-title">Optional backend confirmation handoff</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Legacy email links keep using the hosted confirmation page. In opt-in mode, the link targets your registered customer callback; your backend serves the confirmation form and completes the handoff.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <Alert><AlertDescription>
          This is backend-only: no iframe, API secret, or JWT is placed in a URL or browser code. Signup creates a pending transaction, not a login, and supplies confirmation state plus an S256 PKCE challenge. The email link targets your registered callback with a verification token and state. The sample's default GET serves a safe customer-domain confirmation form; its GET does not mutate state, so link scanners cannot confirm accounts. Only the customer's explicit POST calls Afro Auth's verify-email endpoint server-to-server. Afro Auth returns JSON with a redirect containing a one-use code and state valid for 2 minutes. Your backend exchanges that code using its API secret and PKCE verifier, destroys the pending session, clears the pending cookie, sets a fresh Secure, HttpOnly cookie, and redirects home.
        </AlertDescription></Alert>
        <p className="text-sm text-muted-foreground">
          Enter the exact HTTPS callback URL hosted by you, on one of this project's verified and allowed origins. HTTP localhost is accepted only in development. Install and configure the customer backend integration before enabling this option; saving the callback alone does not deploy or implement it. Legacy email links remain on the hosted confirmation flow. Leaving the field empty stops pending and new backend handoffs; existing verified sessions and legacy integrations remain unchanged. Cross-device confirmation requires the original browser or a normal login.
        </p>
        {isLoading ? <div className="space-y-3" aria-label="Loading confirmation flow">
          <div className="h-5 w-48 animate-pulse rounded bg-muted" /><div className="h-10 w-full animate-pulse rounded bg-muted" /><div className="h-20 w-full animate-pulse rounded bg-muted" />
        </div> : error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><CircleAlert className="h-4 w-4" />Couldn't load confirmation flow</p>
          <p className="mt-1 text-muted-foreground">{readableApiError(error, "Try again to load the current backend handoff settings.")}</p>
          <Button className="mt-3" variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
        </div> : <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${data?.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              {data?.enabled && <Check className="h-3.5 w-3.5" />}{data?.enabled ? "Enabled" : "Disabled"}
            </span>
            {data?.exchangeUrl && <span className="text-muted-foreground">Exchange endpoint <code className="break-all text-foreground">{data.exchangeUrl}</code></span>}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            const value = callbackUrl.trim();
            const issue = validateCallback(value);
            if (issue) { setFormError(issue); setFeedback(""); return; }
            setFormError("");
            setFeedback("");
            save.mutate(value || null);
          }}>
            <label htmlFor="confirmation-callback-url" className="text-sm font-medium">Backend callback URL</label>
            <Input id="confirmation-callback-url" type="url" value={callbackUrl}
              onChange={(event) => { setCallbackUrl(event.target.value); setFormError(""); setFeedback(""); }}
              placeholder="https://app.example.com/auth/confirmed" aria-invalid={!!formError} aria-describedby="callback-help callback-error" />
            <p id="callback-help" className="text-xs text-muted-foreground">The endpoint must be implemented by your backend and match an owned, verified, allowed origin exactly.</p>
            {formError && <p id="callback-error" role="alert" className="text-sm text-destructive">{formError}</p>}
            {feedback && <Alert role="status"><AlertDescription>{feedback}</AlertDescription></Alert>}
            <Button type="submit" disabled={save.isPending || !data}>
                {save.isPending ? "Saving…" : "Save confirmation flow"}
            </Button>
          </form>
        </>}
        <div className="space-y-2 rounded-lg border p-4">
          <div>
            <p className="font-medium">Customer backend examples</p>
            <p className="text-xs text-muted-foreground">These are source files for your own integration; downloading them does not deploy your backend.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => downloadSample(backendSample, "server.mjs")}><Download className="mr-2 h-4 w-4" />Download server.mjs</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => copy(backendSample, "server.mjs sample")}><Copy className="mr-2 h-4 w-4" />Copy server sample</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => downloadSample(callbackPageSample, "CallbackPage.jsx")}><Download className="mr-2 h-4 w-4" />Download CallbackPage.jsx</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => copy(callbackPageSample, "CallbackPage.jsx sample")}><Copy className="mr-2 h-4 w-4" />Copy React page</Button>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="font-medium">A confirmation code is not a session token</p>
          <p className="mt-1 text-muted-foreground">The callback consumes the one-use code once. The optional React customer page sends a nonce-protected POST to your own backend; the backend returns JSON while setting a first-party HttpOnly cookie. Set <code>renderCallback: false</code> when using that React page for GET; the backend sample still handles POST and the cookie. If the customer confirms on another device, use the original browser to complete the handoff or ask them to log in normally.</p>
        </div>
      </CardContent>
    </Card>
  </section>;
}
