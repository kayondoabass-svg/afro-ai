import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Copy, Plus, Trash2, KeyRound, Users, Settings, AlertTriangle } from "lucide-react";

interface TenantDetail {
  tenant: {
    id: string; slug: string; name: string; plan: string;
    allowed_origins: string | null; created_at: number; updated_at: number;
  };
  stats: { mau: number; mauLimit: number; totalUsers: number };
  keys: ApiKey[];
}
interface ApiKey {
  id: string; public_key: string; secret_preview: string; label: string | null;
  last_used_at: number | null; revoked_at: number | null; created_at: number;
}
interface TenantUser {
  id: string; email: string; first_name: string | null; last_name: string | null;
  email_verified: number; created_at: number;
}

export default function AfroAuthProjectPage() {
  const [, params] = useRoute("/dashboard/auth/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const id = params?.id || "";

  const { data, isLoading, error } = useQuery<TenantDetail>({
    queryKey: ["/cf-auth/v1/admin/tenants", id],
    enabled: !!id,
    retry: false,
  });

  const { data: usersData } = useQuery<{ users: TenantUser[] }>({
    queryKey: ["/cf-auth/v1/admin/tenants", id, "users"],
    enabled: !!id,
  });

  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [keyLabel, setKeyLabel] = useState("production");

  const createKey = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/cf-auth/v1/admin/tenants/${id}/keys`, { label: keyLabel });
      return res.json() as Promise<{ secret_key: string; public_key: string }>;
    },
    onSuccess: (k) => {
      setNewSecret(k.secret_key);
      queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants", id] });
    },
    onError: (e: any) => toast({ title: "Couldn't create key", description: e?.message, variant: "destructive" }),
  });

  const revokeKey = useMutation({
    mutationFn: async (keyId: string) => {
      await apiRequest("DELETE", `/cf-auth/v1/admin/tenants/${id}/keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants", id] });
      toast({ title: "Key revoked" });
    },
    onError: (e: any) => toast({ title: "Couldn't revoke", description: e?.message, variant: "destructive" }),
  });

  const renameMutation = useMutation({
    mutationFn: async (vars: { name?: string; allowed_origins?: string[] }) => {
      await apiRequest("PATCH", `/cf-auth/v1/admin/tenants/${id}`, vars);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/cf-auth/v1/admin/tenants", id] });
      toast({ title: "Saved" });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() =>
      toast({ title: `${label} copied` }),
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    const msg = (error as any)?.message || "";
    const isAuth = /401|403|unauthor/i.test(msg);
    const isNotFound = /404|not.?found/i.test(msg);
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Link href="/dashboard/auth">
          <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" /> All projects
          </Button>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {isNotFound ? "Project not found" : isAuth ? "You don't have access" : "Couldn't load this project"}
            </CardTitle>
            <CardDescription data-testid="text-error-detail">
              {isNotFound
                ? "This project may have been deleted, or the link is wrong."
                : isAuth
                ? "Sign in with the account that owns this project."
                : msg || "Try refreshing the page."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/dashboard/auth")} data-testid="button-back-to-list">
              Back to projects
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const t = data.tenant;
  const mauPct = data.stats.mauLimit > 0 ? Math.min(100, (data.stats.mau / data.stats.mauLimit) * 100) : 0;
  const slugUrl = `https://afroaigroup.com/cf-auth/t/${t.slug}`;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link href="/dashboard/auth">
        <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> All projects
        </Button>
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-project-name">{t.name}</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1" data-testid="text-project-slug">{t.slug}</p>
        </div>
        <Badge variant="secondary" className="text-base" data-testid="badge-current-plan">{t.plan}</Badge>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Monthly active users"
          value={data.stats.mau.toLocaleString()}
          sub={`of ${data.stats.mauLimit.toLocaleString()} (${mauPct.toFixed(0)}%)`}
          testId="stat-mau"
        />
        <StatCard label="Total signups" value={data.stats.totalUsers.toLocaleString()} testId="stat-total" />
        <StatCard label="API keys" value={String(data.keys.filter((k) => !k.revoked_at).length)} testId="stat-keys" />
      </div>

      <Tabs defaultValue="quickstart">
        <TabsList>
          <TabsTrigger value="quickstart" data-testid="tab-quickstart">Quickstart</TabsTrigger>
          <TabsTrigger value="keys" data-testid="tab-keys">API keys</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
        </TabsList>

        {/* Quickstart */}
        <TabsContent value="quickstart" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sign up endpoint</CardTitle>
              <CardDescription>POST to this URL from your app.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-3">
                <code className="flex-1 bg-muted rounded px-3 py-2 text-sm font-mono break-all" data-testid="code-signup-url">
                  {slugUrl}/signup
                </code>
                <Button variant="outline" size="sm" onClick={() => copy(`${slugUrl}/signup`, "URL")} data-testid="button-copy-signup-url">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <pre className="bg-card border rounded p-4 text-xs font-mono overflow-x-auto" data-testid="code-signup-example">
{`fetch("${slugUrl}/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
}).then(r => r.json())
  .then(({ token, user }) => {
    localStorage.setItem("auth_token", token);
  });`}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verify a session (your backend)</CardTitle>
              <CardDescription>
                Send the secret key in the Authorization header. Returns the user if valid.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-card border rounded p-4 text-xs font-mono overflow-x-auto" data-testid="code-verify-example">
{`fetch("https://afroaigroup.com/cf-auth/v1/sessions/verify", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer sk_live_..."   // your secret key
  },
  body: JSON.stringify({ token })
}).then(r => r.json());
// → { valid: true, user: { id, email, ... } }`}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API keys */}
        <TabsContent value="keys" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>API keys</CardTitle>
                <CardDescription>Use the secret key only on your server, never in browser code.</CardDescription>
              </div>
              <Dialog>
                <Button onClick={() => createKey.mutate()} disabled={createKey.isPending} data-testid="button-create-key">
                  <Plus className="h-4 w-4 mr-2" /> {createKey.isPending ? "Creating…" : "Create key"}
                </Button>
              </Dialog>
            </CardHeader>
            <CardContent>
              {data.keys.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-no-keys">No keys yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.keys.map((k) => (
                    <div
                      key={k.id}
                      className={`border rounded-lg p-4 ${k.revoked_at ? "opacity-50" : ""}`}
                      data-testid={`row-key-${k.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium" data-testid={`text-key-label-${k.id}`}>{k.label || "(no label)"}</div>
                          <div className="text-xs font-mono text-muted-foreground truncate mt-1" data-testid={`text-key-public-${k.id}`}>
                            {k.public_key}
                          </div>
                          <div className="text-xs font-mono text-muted-foreground mt-1" data-testid={`text-key-secret-${k.id}`}>
                            {k.secret_preview}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {k.revoked_at && <Badge variant="secondary">Revoked</Badge>}
                          {!k.revoked_at && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("Revoke this key? Apps using it will stop working.")) {
                                  revokeKey.mutate(k.id);
                                }
                              }}
                              data-testid={`button-revoke-${k.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Users in this project</CardTitle>
              <CardDescription>People who have signed up via your app's login.</CardDescription>
            </CardHeader>
            <CardContent>
              {!usersData ? (
                <Skeleton className="h-32" />
              ) : usersData.users.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-no-users">
                  Nobody has signed up yet.
                </p>
              ) : (
                <div className="divide-y">
                  {usersData.users.map((u) => (
                    <div key={u.id} className="py-3 flex items-center justify-between" data-testid={`row-user-${u.id}`}>
                      <div>
                        <div className="font-medium" data-testid={`text-user-email-${u.id}`}>{u.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
                          {" · joined "}
                          {new Date(u.created_at * 1000).toLocaleDateString()}
                        </div>
                      </div>
                      {!u.email_verified ? (
                        <Badge variant="outline" className="text-xs">Unverified</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Verified</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings" className="mt-4">
          <SettingsForm tenant={t} onSave={renameMutation.mutate} saving={renameMutation.isPending} />
        </TabsContent>
      </Tabs>

      {/* Reveal new secret modal — appears once per key creation */}
      <Dialog open={!!newSecret} onOpenChange={(open) => !open && setNewSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Save your secret key now
            </DialogTitle>
            <DialogDescription>
              We won't show this again. Copy it and paste into your server's environment variables.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <code className="block bg-muted rounded p-3 text-sm font-mono break-all" data-testid="text-new-secret">
              {newSecret}
            </code>
          </div>
          <DialogFooter>
            <Button onClick={() => newSecret && copy(newSecret, "Secret key")} data-testid="button-copy-secret">
              <Copy className="h-4 w-4 mr-2" /> Copy
            </Button>
            <Button variant="outline" onClick={() => setNewSecret(null)} data-testid="button-close-secret">
              I've saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function SettingsForm({
  tenant, onSave, saving,
}: {
  tenant: TenantDetail["tenant"];
  onSave: (vars: { name?: string; allowed_origins?: string[] }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(tenant.name);
  const [origins, setOrigins] = useState((() => {
    try {
      return JSON.parse(tenant.allowed_origins || "[]").join("\n");
    } catch { return ""; }
  })());

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Project name</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} data-testid="input-rename" />
          <Button onClick={() => onSave({ name })} disabled={saving || name === tenant.name} data-testid="button-save-name">
            {saving ? "Saving…" : "Save"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allowed origins (CORS)</CardTitle>
          <CardDescription>One per line. Leave blank to allow all (development only).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={origins}
            onChange={(e) => setOrigins(e.target.value)}
            className="w-full min-h-[100px] rounded-md border bg-background p-3 text-sm font-mono"
            placeholder="https://yourapp.com&#10;https://www.yourapp.com"
            data-testid="textarea-origins"
          />
          <Button
            onClick={() =>
              onSave({
                allowed_origins: origins.split("\n").map((s: string) => s.trim()).filter(Boolean),
              })
            }
            disabled={saving}
            data-testid="button-save-origins"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
