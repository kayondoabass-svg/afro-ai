import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MailCheck, TriangleAlert } from "lucide-react";
import { readableApiError } from "@shared/customer-api-setup";

interface TestKey { id: number; name: string; isActive: boolean; revokedAt?: string | null }
interface TestResponse { success: boolean; messageId?: string; message?: string; accepted?: boolean; outcome?: "accepted" | "uncertain"; requestId?: string; replayed?: boolean }
interface TestAttempt { fingerprint: string; requestId: string }

function readErrorBody(error: unknown): { status: number; code?: string; requestId?: string } {
  if (!(error instanceof Error)) return { status: 0 };
  const match = error.message.match(/^(\d{3}):\s*([\s\S]*)$/);
  if (!match) return { status: 0 };
  try {
    const body = JSON.parse(match[2]);
    return { status: Number(match[1]), code: body.code, requestId: body.requestId };
  } catch {
    return { status: Number(match[1]) };
  }
}

export function EmailProjectTest({ projectId, keys, hasVerifiedDomain }: { projectId: string; keys: TestKey[]; hasVerifiedDomain: boolean }) {
  const [keyId, setKeyId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Afro AI email API test");
  const [text, setText] = useState("This is the test message you requested.");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<TestResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorKind, setErrorKind] = useState<"uncertain" | "rejected" | null>(null);
  const [attemptFingerprint, setAttemptFingerprint] = useState("");
  const [requestId, setRequestId] = useState("");
  const attemptRef = useRef<TestAttempt | null>(null);
  const available = keys.filter((key) => key.isActive && !key.revokedAt);
  const selectedKey = available.find((key) => String(key.id) === keyId) ?? available[0];
  const fingerprint = JSON.stringify([projectId, selectedKey?.id ?? null, from.trim(), to.trim(), subject.trim(), text]);
  useEffect(() => {
    if (attemptFingerprint && attemptFingerprint !== fingerprint) {
      setAttemptFingerprint("");
      setRequestId("");
      setResult(null);
      setErrorMessage("");
      setErrorKind(null);
      attemptRef.current = null;
    }
  }, [attemptFingerprint, fingerprint]);
  const test = useMutation({
    mutationFn: async (vars: { payload: Record<string, unknown>; requestId: string }) => (await apiRequest(
      "POST",
      `/api/email-api/projects/${encodeURIComponent(projectId)}/test`,
      vars.payload,
      { "Idempotency-Key": vars.requestId },
    )).json() as Promise<TestResponse>,
    retry: false,
    onSuccess: (value) => {
      setResult(value);
      setErrorMessage("");
      setErrorKind(null);
      if ((value.accepted === true || value.outcome === "accepted") && value.success) {
        attemptRef.current = null;
        setAttemptFingerprint("");
        setRequestId("");
      } else {
        setAttemptFingerprint(fingerprint);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/email-api/projects/${encodeURIComponent(projectId)}`] });
    },
    onError: (error) => {
      const detail = readableApiError(error, "The request outcome could not be confirmed.");
      setResult(null);
      const response = readErrorBody(error);
      const definitelyRejected = response.status === 503
        && ["EMAIL_PROVIDER_AUTH", "EMAIL_PROVIDER_LIMIT", "EMAIL_PROVIDER_PERMISSION", "EMAIL_PROVIDER_REJECTED"].includes(response.code || "")
        && typeof response.requestId === "string";
      if (definitelyRejected) {
        attemptRef.current = null;
        setAttemptFingerprint("");
        setRequestId("");
        setErrorKind("rejected");
        setErrorMessage(`${detail}${response.requestId ? ` · Request reference: ${response.requestId}` : ""}`);
      } else {
        setAttemptFingerprint(fingerprint);
        setErrorKind("uncertain");
        setErrorMessage(detail);
      }
    },
  });
  const canSend = !!selectedKey && hasVerifiedDomain && consent && from.trim() && to.trim() && subject.trim();
  const runTest = () => {
    if (test.isPending) return;
    let attempt = attemptRef.current;
    if (!attempt || attempt.fingerprint !== fingerprint) {
      attempt = { fingerprint, requestId: crypto.randomUUID() };
      attemptRef.current = attempt;
    }
    setRequestId(attempt.requestId);
    setAttemptFingerprint(fingerprint);
    setErrorMessage("");
    setErrorKind(null);
    setResult(null);
    test.mutate({
      requestId: attempt.requestId,
      payload: { keyId: Number(selectedKey?.id), from: from.trim(), to: to.trim(), subject: subject.trim(), text, consent: true },
    });
  };
  const hasUnresolvedAttempt = attemptFingerprint === fingerprint && !!requestId;
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><MailCheck className="h-5 w-5 text-primary" />Send one explicit test</CardTitle>
      <CardDescription>This sends exactly one real email using this project’s current allowance. Accepted by the provider does not mean delivered. There are no automatic retries.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {!hasVerifiedDomain && <Alert><TriangleAlert className="h-4 w-4" /><AlertDescription>Add and verify a sending domain before testing delivery.</AlertDescription></Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="test-key">Active project key</Label><select id="test-key" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={String(selectedKey?.id || "")} onChange={(event) => setKeyId(event.target.value)}><option value="">Choose an active key</option>{available.map((key) => <option key={key.id} value={String(key.id)}>{key.name}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="test-from">From address</Label><Input id="test-from" value={from} onChange={(event) => setFrom(event.target.value)} placeholder="Studio <hello@example.com>" /></div>
        <div className="space-y-2"><Label htmlFor="test-to">Recipient</Label><Input id="test-to" type="email" value={to} onChange={(event) => setTo(event.target.value)} placeholder="you@example.net" /></div>
        <div className="space-y-2"><Label htmlFor="test-subject">Subject</Label><Input id="test-subject" value={subject} onChange={(event) => setSubject(event.target.value)} /></div>
      </div>
      <div className="space-y-2"><Label htmlFor="test-text">Plain-text message</Label><Textarea id="test-text" value={text} onChange={(event) => setText(event.target.value)} className="min-h-24" /></div>
      <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 accent-primary" />
        <span>I authorize one real email to the recipient above. Provider acceptance may incur usage and is not proof of inbox delivery.</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!canSend || test.isPending || hasUnresolvedAttempt} onClick={runTest}>{test.isPending ? "Sending one test…" : "Send one test email"}</Button>
        {hasUnresolvedAttempt && !test.isPending && <Button variant="outline" disabled={!canSend} onClick={runTest}>Retry same request</Button>}
      </div>
      {errorMessage && <Alert variant="destructive"><AlertDescription>
        <p>{errorMessage}</p>
        {errorKind === "rejected"
          ? <p className="mt-2">The provider definitively rejected this attempt; it was not accepted for delivery. You may explicitly send a new attempt, which will use a new request ID.</p>
          : <p className="mt-2">The outcome may be unknown. Do not start a new request; retry using the same Idempotency-Key{requestId ? ` ${requestId}` : ""} to avoid sending a duplicate.</p>}
      </AlertDescription></Alert>}
      {result && <Alert variant={result.accepted === true || result.outcome === "accepted" ? "default" : "destructive"}><AlertDescription>
        {result.accepted === true || result.outcome === "accepted"
          ? <>Accepted by the provider{result.messageId ? ` · message ${result.messageId}` : ""}. Acceptance is not delivery and does not verify the recipient’s mailbox.{result.outcome === "uncertain" ? " Delivery status or logging is still uncertain; do not send a new attempt." : ""}{result.replayed ? " This response reuses the earlier request." : ""}</>
          : <>The provider outcome is uncertain. Delivery is not confirmed. Retry only with the same Idempotency-Key{requestId ? ` ${requestId}` : ""}.{result.requestId ? ` Provider request reference: ${result.requestId}.` : ""}</>}
      </AlertDescription></Alert>}
    </CardContent>
  </Card>;
}
