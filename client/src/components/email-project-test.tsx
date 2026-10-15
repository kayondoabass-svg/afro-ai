import { useState } from "react";
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

export function EmailProjectTest({ projectId, keys, hasVerifiedDomain }: { projectId: string; keys: TestKey[]; hasVerifiedDomain: boolean }) {
  const [keyId, setKeyId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Afro AI email API test");
  const [text, setText] = useState("This is the test message you requested.");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<{success: boolean; messageId?: string; message?: string} | null>(null);
  const available = keys.filter((key) => key.isActive && !key.revokedAt);
  const selectedKey = available.find((key) => String(key.id) === keyId) ?? available[0];
  const test = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/email-api/projects/${encodeURIComponent(projectId)}/test`, {
      keyId: Number(selectedKey?.id), from: from.trim(), to: to.trim(), subject: subject.trim(), text, consent: true,
    })).json() as Promise<{success: boolean; messageId?: string; message?: string}>,
    retry: false,
    onSuccess: (value) => {
      setResult(value);
      queryClient.invalidateQueries({ queryKey: [`/api/email-api/projects/${encodeURIComponent(projectId)}`] });
    },
    onError: () => setResult({ success: false, message: "The test request failed. No automatic retry was made." }),
  });
  const canSend = !!selectedKey && hasVerifiedDomain && consent && from.trim() && to.trim() && subject.trim();
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
      <Button disabled={!canSend || test.isPending} onClick={() => { setResult(null); test.mutate(); }}>{test.isPending ? "Sending one test…" : "Send one test email"}</Button>
      {result && <Alert variant={result.success ? "default" : "destructive"}><AlertDescription>{result.success ? `Accepted by provider${result.messageId ? ` · message ${result.messageId}` : ""}. This does not confirm delivery.` : readableApiError(result.message, "Test did not complete.")}</AlertDescription></Alert>}
    </CardContent>
  </Card>;
}
