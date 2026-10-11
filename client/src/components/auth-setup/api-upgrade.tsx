import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { readableApiError } from "@shared/customer-api-setup";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, CircleAlert, Copy, Database, GitBranch, ShieldCheck, Users } from "lucide-react";

type Contract = "legacy" | "v1";
interface ApiUpgrade {
  projectId: string;
  projectSlug: string;
  supportedVersions: string[];
  legacyAvailable: boolean;
  selectedContract: Contract | null;
  selectedAt: number | null;
  dataStrategy: "reuse-existing-project";
  storage: "D1";
  userFolder: string;
  users: { total: number; verified: number; unverified: number };
  activeKeys: number;
  urls: { legacy: string; v1: string };
  preserves: string[];
  requiresDataCopy: false;
}

const labels: Record<string, string> = {
  userIds: "Customer user IDs",
  passwordHashes: "Password hashes",
  verificationStatus: "Email verification status",
  apiKeys: "API keys",
  sessions: "Sessions",
};

export function ApiUpgrade({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const endpoint = `/cf-auth/v1/admin/tenants/${tenantId}/api-upgrade`;
  const [target, setTarget] = useState<Contract | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [feedback, setFeedback] = useState("");
  const { data, isLoading, error, refetch, isFetching } = useQuery<ApiUpgrade>({
    queryKey: [endpoint],
    enabled: !!tenantId,
  });
  const saveChoice = useMutation({
    mutationFn: async (contract: Contract) =>
      (await apiRequest("POST", endpoint, { contract, confirmPreserveData: true })).json() as Promise<ApiUpgrade>,
    onSuccess: async (result) => {
      setTarget(null);
      setConfirmed(false);
      setFeedback(`Saved: ${result.selectedContract === "v1" ? "Use v1 with existing users" : "Keep current API"}. Your external app was not changed.`);
      await queryClient.invalidateQueries({ queryKey: [endpoint] });
      toast({ title: "API preference saved", description: "This updates setup guidance only; it does not change your customer app." });
    },
    onError: (cause) => setFeedback(readableApiError(cause, "Could not save this preference. Your current integration has not been changed.")),
  });
  const copy = async (value: string, name: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${name} copied.`);
      toast({ title: `${name} copied` });
    } catch {
      setFeedback(`Could not copy ${name}. Select the URL and copy it manually.`);
    }
  };
  const choose = (contract: Contract) => {
    setConfirmed(false);
    setFeedback("");
    setTarget(contract);
  };
  const closeDialog = (open: boolean) => {
    if (!open && !saveChoice.isPending) {
      setTarget(null);
      setConfirmed(false);
    }
  };

  return <Card className="overflow-hidden">
    <div className="h-1 bg-primary" />
    <CardHeader>
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-primary/10 p-2 text-primary"><GitBranch className="h-5 w-5" /></span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><CardTitle>Move an existing integration to v1</CardTitle>{data?.selectedContract && <Badge variant="secondary">Selected: {data.selectedContract === "v1" ? "v1" : "Current API"}</Badge>}</div>
          <CardDescription className="mt-1 max-w-3xl">A safe, optional contract choice for this project. Your existing customer accounts stay in place; this setting provides matching integration guidance and does not edit code in your app.</CardDescription>
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-5">
      {isLoading ? <div className="space-y-3" aria-label="Loading API upgrade details"><Skeleton className="h-20 w-full" /><Skeleton className="h-36 w-full" /></div>
        : error || !data ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="flex items-center gap-2 font-medium"><CircleAlert className="h-4 w-4 text-destructive" />Upgrade information unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">{readableApiError(error, "Could not load this project's API compatibility details.")}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>Try again</Button>
        </div>
        : <>
          <Alert><AlertDescription><strong>Same project. Same customers.</strong> Both URLs remain active against this project’s existing D1 records. No new project, account import, password reset, new registration, API-key replacement, or data copy is required.</AlertDescription></Alert>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Users className="h-4 w-4" />Customer accounts</p><p className="mt-2 text-xl font-semibold tabular-nums">{data.users.total.toLocaleString()}</p><p className="text-xs text-muted-foreground">{data.users.verified.toLocaleString()} verified · {data.users.unverified.toLocaleString()} awaiting confirmation</p></div>
            <div className="rounded-lg border p-3"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Database className="h-4 w-4" />Existing storage</p><p className="mt-2 font-semibold">{data.storage}</p><code className="mt-1 block break-all text-xs text-muted-foreground">{data.userFolder}</code></div>
            <div className="rounded-lg border p-3"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><ShieldCheck className="h-4 w-4" />Active API keys</p><p className="mt-2 text-xl font-semibold tabular-nums">{data.activeKeys.toLocaleString()}</p><p className="text-xs text-muted-foreground">The current keys are preserved.</p></div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="font-semibold">Available API contracts</h3><p className="mt-1 text-xs text-muted-foreground">Choose which integration instructions to follow. This is a reversible preference, not an automatic traffic switch.</p></div>
              {data.selectedAt && <span className="text-xs text-muted-foreground">Preference saved {new Date(data.selectedAt * 1000).toLocaleString()}</span>}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ContractChoice
                title="Keep current API"
                description={data.legacyAvailable ? "Continue with your existing integration while you plan an upgrade." : "The legacy contract is not available for this project."}
                url={data.urls.legacy}
                selected={data.selectedContract === "legacy"}
                disabled={!data.legacyAvailable}
                onCopy={() => copy(data.urls.legacy, "Current API URL")}
                onChoose={() => choose("legacy")}
              />
              <ContractChoice
                title="Use v1 with existing users"
                description="Follow the v1 contract using the same customer accounts, verification records, keys, and sessions."
                url={data.urls.v1}
                selected={data.selectedContract === "v1"}
                disabled={!data.supportedVersions.includes("v1")}
                onCopy={() => copy(data.urls.v1, "v1 API URL")}
                onChoose={() => choose("v1")}
              />
            </div>
          </div>
          {data.selectedContract && <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /><h3 className="font-semibold">{data.selectedContract === "v1" ? "v1 integration instructions" : "Current API instructions"}</h3></div>
            <p className="text-sm text-muted-foreground">
              {data.selectedContract === "v1"
                ? "Update your own app’s Auth base URL to the v1 URL below, then use the v1 signup and login contract. The preference here does not make that code change for you."
                : "Keep your existing Auth base URL in your app. This choice records the current contract and does not change customer traffic or app code."}
            </p>
            <UrlRow label={data.selectedContract === "v1" ? "v1 project URL" : "Current project URL"} url={data.selectedContract === "v1" ? data.urls.v1 : data.urls.legacy} onCopy={() => copy(data.selectedContract === "v1" ? data.urls.v1 : data.urls.legacy, "API URL")} />
            {data.selectedContract === "v1" && <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed"><code>{`const authBaseUrl = "${data.urls.v1}";
const response = await fetch(authBaseUrl + "/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
});
const result = await response.json();
if (!response.ok) throw new Error(result.message);
// Show a confirmation prompt. Existing customer accounts are reused.`}</code></pre>}
            <p className="text-xs text-muted-foreground">The selected contract only changes this dashboard’s setup guidance. Your deployed app continues to call the URL it currently uses until you update it.</p>
          </div>}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <h3 className="text-sm font-semibold">What stays intact</h3>
            <ul className="mt-2 grid gap-x-5 gap-y-1 text-sm sm:grid-cols-2">
              {data.preserves.map((item) => <li key={item} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0 text-primary" />{labels[item] || item}</li>)}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Strategy: {data.dataStrategy}. No copy, merge, or data migration runs when you save this preference.</p>
          </div>
          <div className="space-y-2 rounded-lg border border-amber-600/25 bg-amber-600/5 p-4">
            <p className="text-sm font-semibold">Keep the current URL as your rollback</p>
            <p className="text-sm text-muted-foreground">Both project URLs continue to reach the same records. If you deploy v1 and need to roll back, point your app back to the current API URL. Do not create a fresh project or delete this project’s data.</p>
            <p className="text-xs text-muted-foreground">These are per-project customer accounts. They are separate from global Afro AI platform accounts at <code>/cf-auth/login</code>. This is not a bulk import from another identity provider.</p>
          </div>
          {feedback && <p className="text-sm" role="status" aria-live="polite">{feedback}</p>}
        </>}
      <Dialog open={!!target} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target === "v1" ? "Use v1 with existing users?" : "Keep the current API?"}</DialogTitle>
            <DialogDescription>This saves a reversible preference and updates the matching instructions here. It does not change your external app or move customer data.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">This project’s existing D1 records remain in place</p>
              <p className="mt-1 text-muted-foreground">No account copying, password reset, new project, API-key replacement, or customer re-registration will occur. Both existing and v1 URLs continue to use the same project records.</p>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} />
              <span>I understand this saves a contract preference only. I will update my own app’s URL/code separately if I choose to deploy v1.</span>
            </label>
            {saveChoice.isError && <p className="text-sm text-destructive" role="alert">{readableApiError(saveChoice.error, "Could not save the preference.")}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => closeDialog(false)} disabled={saveChoice.isPending}>Cancel</Button>
            <Button onClick={() => target && saveChoice.mutate(target)} disabled={!confirmed || !target || saveChoice.isPending}>
              {saveChoice.isPending ? "Saving…" : "Confirm choice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card>;
}

function ContractChoice({ title, description, url, selected, disabled, onCopy, onChoose }: {
  title: string;
  description: string;
  url: string;
  selected: boolean;
  disabled: boolean;
  onCopy: () => void;
  onChoose: () => void;
}) {
  return <article className={`min-w-0 rounded-lg border p-4 ${selected ? "border-primary/60 bg-primary/5" : "bg-background"}`}>
    <div className="flex items-start justify-between gap-2">
      <div><h4 className="font-medium">{title}</h4><p className="mt-1 min-h-10 text-xs text-muted-foreground">{description}</p></div>
      {selected && <Badge variant="secondary" className="shrink-0">Selected</Badge>}
    </div>
    <UrlRow label="API URL" url={url} onCopy={onCopy} />
    <Button className="mt-3 w-full" variant={selected ? "secondary" : "outline"} onClick={onChoose} disabled={disabled}>
      {selected ? <><Check className="mr-2 h-4 w-4" />Selected</> : title}
    </Button>
    {disabled && <p className="mt-2 text-xs text-muted-foreground">This option is unavailable for this project.</p>}
  </article>;
}

function UrlRow({ label, url, onCopy }: { label: string; url: string; onCopy: () => void }) {
  return <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md bg-muted/60 p-2">
    <div className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span><code className="block break-all text-xs">{url}</code></div>
    <Button size="icon" variant="ghost" aria-label={`Copy ${label}`} onClick={onCopy}><Copy className="h-4 w-4" /></Button>
  </div>;
}
