import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CircleAlert,
  Code2,
  ExternalLink,
  Eye,
  Fingerprint,
  Github,
  Globe2,
  HeartPulse,
  Loader2,
  LockKeyhole,
  MailPlus,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

type Invite = { email: string; createdAt: string };
type ReleaseManifest = {
  name?: string;
  version?: string;
  stage?: string;
  downloadUrl?: string;
  bytes?: number;
  sha256?: string;
  runtime?: string;
  desktopDevelopmentRuntime?: string;
  engine?: string;
  dependencyCount?: number;
  implementedArchitectures?: string[];
  pretrainedSmokeCheckedArchitectures?: string[];
  license?: string;
};
type AdminData = {
  isFounder: boolean;
  authorizedUsersCount: number;
  activeViewersCount: number;
  presenceWindowSeconds: number;
  invites: Invite[];
  release: ReleaseManifest;
  publicLinks: { github: string; huggingFace: string };
};

const ADMIN_KEY = ["/api/keyo-studio/admin"];

function safeDownloadHref(value?: string): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function errorStatus(error: unknown): number | undefined {
  const match = String(error instanceof Error ? error.message : error).match(/^(\d{3}):/);
  return match ? Number(match[1]) : undefined;
}

function formatBytes(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes)) return "Not listed";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dateLabel(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? "Date unavailable"
    : parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function KeyoStudioAdmin() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [revokeEmail, setRevokeEmail] = useState<string | null>(null);
  const [presenceEnabled, setPresenceEnabled] = useState(false);
  const dataRef = useRef<AdminData | undefined>(undefined);

  const adminQuery = useQuery<AdminData>({
    queryKey: [...ADMIN_KEY, user?.id ?? "signed-out"],
    queryFn: async () => (await apiRequest("GET", "/api/keyo-studio/admin")).json(),
    staleTime: 0,
    retry: false,
  });
  dataRef.current = adminQuery.data;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
  const heartbeatMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/keyo-studio/admin/presence", {}),
    onSuccess: refresh,
    onError: () => {
      toast({ title: "Presence could not be renewed", description: "We will try again on the next heartbeat.", variant: "destructive" });
    },
  });
  const inviteMutation = useMutation({
    mutationFn: async (inviteEmail: string) =>
      apiRequest("POST", "/api/keyo-studio/admin/invites", { email: inviteEmail }),
    onSuccess: () => {
      setEmail("");
      toast({ title: "Viewer access granted", description: "The user must sign in with this email and open /admin-command/keyo-studio. No email notification was sent." });
      refresh();
    },
    onError: (error) => toast({
      title: "Invitation was not added",
      description: error instanceof Error ? error.message.replace(/^\d{3}:\s*/, "") : "Check the email and try again.",
      variant: "destructive",
    }),
  });
  const revokeMutation = useMutation({
    mutationFn: async (inviteEmail: string) =>
      apiRequest("DELETE", `/api/keyo-studio/admin/invites/${encodeURIComponent(inviteEmail)}`),
    onSuccess: () => {
      setRevokeEmail(null);
      toast({ title: "Invitation revoked", description: "That email no longer has invited access." });
      refresh();
    },
    onError: (error) => toast({
      title: "Could not revoke invitation",
      description: error instanceof Error ? error.message.replace(/^\d{3}:\s*/, "") : "Please try again.",
      variant: "destructive",
    }),
  });

  useEffect(() => {
    if (!adminQuery.data || adminQuery.isError) return;
    let stopped = false;
    const sendHeartbeat = () => {
      if (!stopped && document.visibilityState === "visible" && dataRef.current) {
        heartbeatMutation.mutate();
      }
    };
    setPresenceEnabled(true);
    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") sendHeartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      setPresenceEnabled(false);
      void apiRequest("DELETE", "/api/keyo-studio/admin/presence").catch(() => undefined);
    };
  }, [adminQuery.data?.isFounder, adminQuery.data?.presenceWindowSeconds, adminQuery.isError]);

  const status = errorStatus(adminQuery.error);
  const release = adminQuery.data?.release;
  const downloadHref = useMemo(() => safeDownloadHref(release?.downloadUrl), [release?.downloadUrl]);
  const publicLinks = adminQuery.data?.publicLinks;

  if (adminQuery.isPending) {
    return (
      <main className="min-h-[100dvh] bg-background px-4 py-8 md:px-8">
        <div className="mx-auto max-w-6xl space-y-6" aria-label="Loading KEYO Studio admin">
          <div className="h-8 w-52 animate-pulse rounded bg-muted" />
          <div className="h-36 animate-pulse rounded-2xl bg-muted" />
          <div className="grid gap-5 md:grid-cols-2"><div className="h-64 animate-pulse rounded-2xl bg-muted" /><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div>
        </div>
      </main>
    );
  }

  if (adminQuery.isError) {
    const forbidden = status === 403;
    const unauthorized = status === 401;
    return (
      <main className="min-h-[100dvh] bg-background px-4 py-10 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Code2 className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Afro AI / private tools</p><h1 className="text-2xl font-semibold tracking-tight">KEYO Studio runner studio</h1></div>
          </div>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex flex-col items-start gap-4 p-7 md:flex-row md:items-center">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"><LockKeyhole className="h-5 w-5" /></div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">{forbidden ? "Private access only" : unauthorized ? "Sign in to continue" : "Studio data unavailable"}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {forbidden
                    ? "This oversight space is limited to the founder and people explicitly granted access. No release or invitation details are available here."
                    : unauthorized
                      ? "Your session is not authenticated. Sign in with an authorized Afro AI account to view this private studio."
                      : "The private studio could not be reached. No release or invitation details are being shown."}
                </p>
              </div>
              {!forbidden && <Button variant="outline" onClick={() => adminQuery.refetch()} disabled={adminQuery.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${adminQuery.isFetching ? "animate-spin" : ""}`} />Retry</Button>}
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const data = adminQuery.data;
  if (!data) return null;
  const stage = release?.stage || "stage not reported";

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 md:px-8 md:pt-9">
        <header className="mb-8 flex flex-col justify-between gap-5 border-b border-border/70 pb-6 sm:flex-row sm:items-end">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Code2 className="h-5 w-5" /></div>
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.19em] text-muted-foreground"><span>Afro AI</span><span className="text-primary">/</span><span>Founder tools</span></div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">KEYO Studio runner studio</h1>
              <p className="mt-1 text-sm text-muted-foreground">Private oversight for KEYO’s independently built runner.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Badge variant="outline" className="gap-1.5 border-primary/25 bg-primary/5 px-3 py-1.5 text-primary"><ShieldCheck className="h-3.5 w-3.5" />{data.isFounder ? "Founder access" : "Granted access"}</Badge>
            <Button aria-label="Refresh studio data" variant="ghost" size="icon" onClick={() => adminQuery.refetch()} disabled={adminQuery.isFetching}><RefreshCw className={`h-4 w-4 ${adminQuery.isFetching ? "animate-spin" : ""}`} /></Button>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-[1.45fr_1fr]">
          <Card className="overflow-hidden border-primary/20 bg-card">
            <div className="h-1 bg-primary" />
            <CardContent className="flex flex-col justify-between gap-6 p-6 md:flex-row md:items-center md:p-7">
              <div className="max-w-xl">
                <div className="mb-3 flex items-center gap-2"><Badge className="rounded-md font-mono text-[11px] uppercase tracking-wider">{stage}</Badge><span className="text-xs text-muted-foreground">Release channel</span></div>
                <h2 className="text-xl font-semibold tracking-tight">{release?.name || "KEYO Studio"} <span className="font-mono text-primary">v{release?.version || "—"}</span></h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">An early source-code release for developers evaluating KEYO’s own JavaScript engine.</p>
                {downloadHref ? (
                  <Button asChild className="mt-5 gap-2"><a href={downloadHref} download><ArrowDownToLine className="h-4 w-4" />Download source archive</a></Button>
                ) : <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><CircleAlert className="h-4 w-4" />A safe source download is not available in this manifest.</p>}
              </div>
              <div className="min-w-[180px] rounded-xl border border-border/70 bg-muted/35 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Package</p>
                <p className="mt-2 font-mono text-2xl font-semibold">{formatBytes(release?.bytes)}</p>
                <p className="mt-1 text-xs text-muted-foreground">source archive size</p>
                <div className="mt-4 flex items-center gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground"><Activity className="h-3.5 w-3.5 text-primary" />{release?.dependencyCount ?? "—"} runtime dependencies</div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><HeartPulse className="h-4 w-4 text-primary" />Access presence</CardTitle>
              <CardDescription>People allowed in the studio and recently active sessions.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-4"><p className="text-2xl font-semibold tabular-nums">{data.authorizedUsersCount}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />Authorized viewers</p></div>
                <div className="rounded-lg bg-primary/5 p-4"><p className="text-2xl font-semibold tabular-nums">{data.activeViewersCount}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Eye className="h-3.5 w-3.5" />Active in last {data.presenceWindowSeconds}s</p></div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full ${presenceEnabled ? "bg-emerald-600" : "bg-muted-foreground"}`} />This browser {presenceEnabled ? "renews presence every 30 seconds while visible" : "presence is not active"}</div>
            </CardContent>
          </Card>
        </section>

        <section className="grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border/70">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle className="text-base">Release profile</CardTitle>
              <CardDescription>What this release is—and what it is not.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 p-5 md:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Engine</p><p className="mt-1.5 text-sm leading-6">{release?.engine || "Independent JavaScript CPU transformer implementation"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Developer runtime</p><p className="mt-1.5 text-sm leading-6">{release?.runtime || "Runtime details not reported"}</p></div>
                {release?.desktopDevelopmentRuntime && <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Desktop development requirements</p><p className="mt-1.5 text-sm leading-6">{release.desktopDevelopmentRuntime}</p></div>}
                <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Implemented architectures</p><p className="mt-1.5 text-sm leading-6">{release?.implementedArchitectures?.join(", ") || "Not listed"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pretrained smoke checked</p><p className="mt-1.5 text-sm leading-6">{release?.pretrainedSmokeCheckedArchitectures?.join(", ") || "Not listed"}</p></div>
              </div>
              <div className="rounded-lg border border-amber-600/20 bg-amber-500/5 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><CircleAlert className="h-4 w-4 text-amber-700" />Source-only alpha</p>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">This is an early developer source release, not a production-ready model runner. No 2B, 7B, or 14B model support, GPU readiness, or desktop-user capability is claimed here.</p>
              </div>
              {release?.sha256 && <div className="border-t border-border/60 pt-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SHA-256</p><p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">{release.sha256}</p></div>}
              {release?.license && <p className="text-xs text-muted-foreground">License: {release.license}</p>}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-border/70">
              <CardHeader className="pb-3"><CardTitle className="text-base">Public destinations</CardTitle><CardDescription>Public project references, separate from this private console.</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                <a href="/keyo-studio/workspace/" className="group flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 transition-colors hover:bg-muted/50">
                  <span className="flex items-center gap-3"><Globe2 className="h-4 w-4 text-primary" /><span><span className="block text-sm font-medium">KEYO Studio page</span><span className="block text-xs text-muted-foreground">Product overview</span></span></span><ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </a>
                {publicLinks?.github && <a href={publicLinks.github} target="_blank" rel="noreferrer" className="group flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 transition-colors hover:bg-muted/50"><span className="flex items-center gap-3"><Github className="h-4 w-4 text-primary" /><span><span className="block text-sm font-medium">GitHub source</span><span className="block text-xs text-muted-foreground">Repository</span></span></span><ExternalLink className="h-4 w-4 text-muted-foreground" /></a>}
                {publicLinks?.huggingFace && <a href={publicLinks.huggingFace} target="_blank" rel="noreferrer" className="group flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 transition-colors hover:bg-muted/50"><span className="flex items-center gap-3"><Fingerprint className="h-4 w-4 text-primary" /><span><span className="block text-sm font-medium">Hugging Face</span><span className="block text-xs text-muted-foreground">Project listing</span></span></span><ExternalLink className="h-4 w-4 text-muted-foreground" /></a>}
              </CardContent>
            </Card>

            {data.isFounder && <Card className="border-border/70">
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" />Invited access</CardTitle><CardDescription>Manage email invitations for private oversight. An invitation is not a count of active sessions.</CardDescription></CardHeader>
              <CardContent>
                <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (!email.trim()) return; inviteMutation.mutate(email.trim()); }}>
                  <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="developer@example.com" aria-label="Email address to invite" required />
                  <Button type="submit" className="shrink-0 gap-2" disabled={inviteMutation.isPending || !email.trim()}>{inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}Invite email</Button>
                </form>
                <div className="mt-5 border-t border-border/60 pt-3">
                  <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invitations</p><Badge variant="secondary">{data.invites.length}</Badge></div>
                  {data.invites.length ? <ul className="divide-y divide-border/60">
                    {data.invites.map((invite) => <li key={invite.email} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{invite.email}</p><p className="mt-0.5 text-xs text-muted-foreground">Added {dateLabel(invite.createdAt)}</p></div>
                      <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setRevokeEmail(invite.email)} aria-label={`Revoke access for ${invite.email}`}><X className="mr-1.5 h-4 w-4" />Revoke</Button>
                    </li>)}
                  </ul> : <div className="rounded-lg bg-muted/40 px-4 py-5 text-center"><Check className="mx-auto h-4 w-4 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No invited emails yet</p><p className="mt-1 text-xs text-muted-foreground">Add a specific email to grant studio access.</p></div>}
                </div>
              </CardContent>
            </Card>}
          </div>
        </section>
        <footer className="mt-9 flex flex-col gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>KEYO Studio · Private founder oversight</span><span>Presence expires after {data.presenceWindowSeconds} seconds without a heartbeat.</span>
        </footer>
      </div>

      <AlertDialog open={Boolean(revokeEmail)} onOpenChange={(open) => { if (!open && !revokeMutation.isPending) setRevokeEmail(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Revoke this invitation?</AlertDialogTitle><AlertDialogDescription>{revokeEmail} will lose invited access to KEYO Studio. This does not remove the founder.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>Keep invitation</AlertDialogCancel>
            <AlertDialogAction disabled={revokeMutation.isPending} onClick={(event) => { event.preventDefault(); if (revokeEmail) revokeMutation.mutate(revokeEmail); }}>{revokeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}Revoke invitation</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
