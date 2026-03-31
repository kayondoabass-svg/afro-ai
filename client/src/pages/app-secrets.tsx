import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  KeyRound, Plus, Trash2, Eye, EyeOff, Copy, Check, Globe, Lock,
} from "lucide-react";

export default function AppSecretsPage() {
  const { toast } = useToast();
  const [selectedApp, setSelectedApp] = useState<string>("global");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: apps = [] } = useQuery<any[]>({ queryKey: ["/api/published-apps"] });

  const appIdParam = selectedApp === "global" ? "global" : selectedApp;
  const { data: secrets = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/secrets", appIdParam],
    queryFn: () => fetch(`/api/secrets?appId=${appIdParam}`, { credentials: "include" }).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: { key: string; value: string; appId?: number | null }) =>
      apiRequest("POST", "/api/secrets", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
      setNewKey("");
      setNewValue("");
      toast({ title: "Secret added", description: `${newKey} has been saved securely.` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/secrets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
      toast({ title: "Secret deleted" });
    },
  });

  const handleAdd = () => {
    if (!newKey.trim() || !newValue.trim()) {
      toast({ title: "Both key and value are required", variant: "destructive" });
      return;
    }
    const appId = selectedApp === "global" ? null : parseInt(selectedApp);
    createMutation.mutate({ key: newKey.trim().toUpperCase().replace(/\s/g, "_"), value: newValue.trim(), appId });
  };

  const toggleVisible = (id: number) => {
    setVisibleIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const copyValue = (id: number, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-primary" /> Secrets
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Store environment variables and API keys for your published apps. Values are hidden by default.
        </p>
      </div>

      {/* App Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="w-4 h-4" /> Scope
          </CardTitle>
          <CardDescription>Choose which app these secrets belong to, or keep them global.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedApp} onValueChange={setSelectedApp}>
            <SelectTrigger className="w-64" data-testid="select-app-scope">
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">🌐 Global (all apps)</SelectItem>
              {apps.map((app: any) => (
                <SelectItem key={app.id} value={String(app.id)}>
                  {app.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Add New Secret */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Add Secret
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-40">
              <Label className="text-xs mb-1 block">Key</Label>
              <Input
                placeholder="e.g. API_KEY"
                value={newKey}
                onChange={e => setNewKey(e.target.value.toUpperCase().replace(/\s/g, "_"))}
                className="font-mono text-sm"
                data-testid="input-secret-key"
              />
            </div>
            <div className="flex-1 min-w-40">
              <Label className="text-xs mb-1 block">Value</Label>
              <Input
                placeholder="Enter secret value"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                type="password"
                className="font-mono text-sm"
                data-testid="input-secret-value"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAdd} disabled={createMutation.isPending} data-testid="button-add-secret">
                <Plus className="w-4 h-4 mr-1" />
                {createMutation.isPending ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secrets List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lock className="w-4 h-4" /> Stored Secrets
            <Badge variant="secondary">{secrets.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : secrets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <KeyRound className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No secrets stored yet.</p>
              <p className="text-xs">Add your first secret above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {secrets.map((secret: any) => (
                <div
                  key={secret.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border font-mono text-sm"
                  data-testid={`row-secret-${secret.id}`}
                >
                  <KeyRound className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="font-semibold text-primary w-48 truncate">{secret.key}</span>
                  <span className="flex-1 text-muted-foreground truncate">
                    {visibleIds.has(secret.id) ? secret.value : "••••••••••••"}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => toggleVisible(secret.id)} data-testid={`button-toggle-secret-${secret.id}`}>
                      {visibleIds.has(secret.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => copyValue(secret.id, secret.value)} data-testid={`button-copy-secret-${secret.id}`}>
                      {copiedId === secret.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-red-500 hover:text-red-600" onClick={() => deleteMutation.mutate(secret.id)} data-testid={`button-delete-secret-${secret.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
