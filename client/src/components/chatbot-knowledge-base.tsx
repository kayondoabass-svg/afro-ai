import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  ScanLine, Loader2, AlertTriangle, ShieldAlert, Trash2, Pencil, CheckCircle2, XCircle,
  Sparkles, RefreshCw, Filter, ExternalLink, Search,
} from "lucide-react";
import type { ChatbotQa, ChatbotWidget } from "@shared/schema";

type ScanResult = {
  pagesScanned: number;
  qasExtracted: number;
  qasDeduped: number;
  qasSensitive: number;
  qasInserted: number;
  qasSkippedUnchanged: number;
  topics: string[];
  mode: string;
};

export function ChatbotKnowledgeBase({ widget }: { widget: ChatbotWidget }) {
  const { toast } = useToast();
  const [maxPages, setMaxPages] = useState(12);
  const [mode, setMode] = useState<"incremental" | "replace">("incremental");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "included" | "excluded" | "sensitive">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ChatbotQa | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const qasQuery = useQuery<ChatbotQa[]>({
    queryKey: ["/api/chatbots", widget.id, "qas"],
  });
  const qas = qasQuery.data || [];

  const topics = useMemo(() => Array.from(new Set(qas.map((q) => q.topic))).sort(), [qas]);

  const filtered = useMemo(() => {
    return qas.filter((q) => {
      if (topicFilter !== "all" && q.topic !== topicFilter) return false;
      if (statusFilter === "included" && !q.included) return false;
      if (statusFilter === "excluded" && q.included) return false;
      if (statusFilter === "sensitive" && !q.sensitive) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!q.question.toLowerCase().includes(s) && !q.answer.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [qas, topicFilter, statusFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ChatbotQa[]>();
    for (const q of filtered) {
      if (!map.has(q.topic)) map.set(q.topic, []);
      map.get(q.topic)!.push(q);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const stats = useMemo(() => ({
    total: qas.length,
    included: qas.filter((q) => q.included).length,
    sensitive: qas.filter((q) => q.sensitive).length,
    sensitiveExcluded: qas.filter((q) => q.sensitive && !q.included).length,
  }), [qas]);

  const scanMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/chatbots/${widget.id}/auto-scan`, { maxPages, mode });
      return await r.json();
    },
    onSuccess: (data: ScanResult) => {
      setScanResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/chatbots", widget.id, "qas"] });
      toast({
        title: "Auto-scan complete",
        description: `${data.qasInserted} new Q&As from ${data.pagesScanned} pages`,
      });
    },
    onError: (e: any) => toast({ title: "Scan failed", description: e?.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, included }: { id: number; included: boolean }) => {
      await apiRequest("PATCH", `/api/chatbots/qas/${id}`, { included });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/chatbots", widget.id, "qas"] }),
  });

  const editMutation = useMutation({
    mutationFn: async (qa: ChatbotQa) => {
      await apiRequest("PATCH", `/api/chatbots/qas/${qa.id}`, {
        question: qa.question, answer: qa.answer, topic: qa.topic,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbots", widget.id, "qas"] });
      setEditing(null);
      toast({ title: "Saved" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/chatbots/qas/${id}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/chatbots", widget.id, "qas"] }),
  });

  const bulkMutation = useMutation({
    mutationFn: async (body: { action: "include" | "exclude" | "delete"; topic?: string; sensitive?: boolean }) => {
      const r = await apiRequest("POST", `/api/chatbots/${widget.id}/qas/bulk`, body);
      return await r.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbots", widget.id, "qas"] });
      toast({ title: `${data.affected} Q&As updated` });
    },
  });

  return (
    <div className="space-y-5" data-testid="kb-panel">
      {/* Header / Auto-Scan controls */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start gap-2">
            <Sparkles className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-sm">Auto-Scan Knowledge Base</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Crawls your site, extracts Q&As, auto-flags sensitive info. You only toggle what to <strong>exclude</strong>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Max pages</Label>
              <Input
                type="number" min={1} max={30} value={maxPages}
                onChange={(e) => setMaxPages(parseInt(e.target.value) || 12)}
                data-testid="input-maxpages"
              />
            </div>
            <div>
              <Label className="text-xs">Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger data-testid="select-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="incremental">Incremental (changed pages only)</SelectItem>
                  <SelectItem value="replace">Replace (wipe & rescan)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => scanMutation.mutate()}
                disabled={scanMutation.isPending || !widget.websiteUrl}
                className="w-full"
                data-testid="button-run-scan"
              >
                {scanMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scanning…</>
                ) : (
                  <><ScanLine className="w-4 h-4 mr-2" />Run Auto-Scan</>
                )}
              </Button>
            </div>
          </div>
          {!widget.websiteUrl && (
            <p className="text-xs text-amber-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Set a Website URL in Settings first.
            </p>
          )}

          {scanResult && (
            <div className="text-xs bg-muted/40 rounded-lg p-3 space-y-1" data-testid="scan-result">
              <div className="flex justify-between"><span>Pages scanned</span><strong>{scanResult.pagesScanned}</strong></div>
              <div className="flex justify-between"><span>Q&As extracted</span><strong>{scanResult.qasExtracted}</strong></div>
              <div className="flex justify-between"><span>Duplicates removed</span><strong>{scanResult.qasDeduped}</strong></div>
              <div className="flex justify-between"><span>Auto-flagged sensitive</span><strong className="text-amber-500">{scanResult.qasSensitive}</strong></div>
              <div className="flex justify-between"><span>New Q&As added</span><strong className="text-green-500">{scanResult.qasInserted}</strong></div>
              {scanResult.qasSkippedUnchanged > 0 && (
                <div className="flex justify-between text-muted-foreground"><span>Skipped (unchanged)</span><span>{scanResult.qasSkippedUnchanged}</span></div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats + bulk actions */}
      {qas.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div><div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div><div className="text-xs text-muted-foreground">Total</div></div>
              <div><div className="text-2xl font-bold text-green-500" data-testid="stat-included">{stats.included}</div><div className="text-xs text-muted-foreground">Active</div></div>
              <div><div className="text-2xl font-bold text-amber-500" data-testid="stat-sensitive">{stats.sensitive}</div><div className="text-xs text-muted-foreground">Sensitive</div></div>
              <div><div className="text-2xl font-bold text-red-500" data-testid="stat-excluded">{stats.total - stats.included}</div><div className="text-xs text-muted-foreground">Excluded</div></div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
              <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ action: "exclude", sensitive: true })} data-testid="button-bulk-exclude-sensitive">
                <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />Exclude all sensitive
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ action: "include", sensitive: false })} data-testid="button-bulk-include-safe">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Include all safe
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ action: "delete", sensitive: true })} className="text-red-500 hover:text-red-600" data-testid="button-bulk-delete-sensitive">
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete all sensitive
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      {qas.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search Q&As…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" data-testid="input-search-qas" />
          </div>
          <Select value={topicFilter} onValueChange={setTopicFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-topic-filter"><Filter className="w-3.5 h-3.5 mr-1.5" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              {topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[140px]" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="included">Active only</SelectItem>
              <SelectItem value="excluded">Excluded only</SelectItem>
              <SelectItem value="sensitive">Sensitive only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Q&A list */}
      {qasQuery.isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div>
      ) : qas.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl">
          No Q&As yet. Run Auto-Scan to build your knowledge base from your website.
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">No Q&As match the filters.</div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([topic, items]) => (
            <div key={topic} data-testid={`topic-group-${topic}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{topic}</Badge>
                  <span className="text-xs text-muted-foreground">{items.length} Q&A{items.length === 1 ? "" : "s"}</span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => bulkMutation.mutate({ action: "include", topic })} data-testid={`button-include-topic-${topic}`}>
                    <CheckCircle2 className="w-3 h-3 mr-1" />Include all
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => bulkMutation.mutate({ action: "exclude", topic })} data-testid={`button-exclude-topic-${topic}`}>
                    <XCircle className="w-3 h-3 mr-1" />Exclude all
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {items.map((qa) => (
                  <Card key={qa.id} className={qa.included ? "" : "opacity-60"} data-testid={`qa-card-${qa.id}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start gap-3">
                        <Switch
                          checked={qa.included}
                          onCheckedChange={(v) => toggleMutation.mutate({ id: qa.id, included: v })}
                          data-testid={`switch-qa-${qa.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 flex-wrap">
                            <p className="text-sm font-medium flex-1" data-testid={`text-question-${qa.id}`}>{qa.question}</p>
                            {qa.sensitive && (
                              <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-500" data-testid={`badge-sensitive-${qa.id}`}>
                                <ShieldAlert className="w-3 h-3 mr-1" />{qa.sensitiveReason || "Sensitive"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap" data-testid={`text-answer-${qa.id}`}>{qa.answer}</p>
                          {qa.sourceUrl && (
                            <a href={qa.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1.5 hover:underline">
                              <ExternalLink className="w-3 h-3" />{new URL(qa.sourceUrl).pathname || "/"}
                            </a>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(qa)} data-testid={`button-edit-${qa.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteMutation.mutate(qa.id)} data-testid={`button-delete-${qa.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Q&A</DialogTitle>
            <DialogDescription>Refine the question or answer your bot will use.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Topic</Label>
                <Input value={editing.topic} onChange={(e) => setEditing({ ...editing, topic: e.target.value })} data-testid="input-edit-topic" />
              </div>
              <div>
                <Label className="text-xs">Question</Label>
                <Input value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} data-testid="input-edit-question" />
              </div>
              <div>
                <Label className="text-xs">Answer</Label>
                <Textarea rows={5} value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} data-testid="input-edit-answer" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editing && editMutation.mutate(editing)} disabled={editMutation.isPending} data-testid="button-save-edit">
              {editMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
