import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, Rocket, Zap, KeyRound, ClipboardList, XCircle,
  Info, Trash2, Search, RefreshCw, Clock, Filter,
} from "lucide-react";

const EVENT_TYPES = [
  { value: "all", label: "All Events" },
  { value: "app.published", label: "App Published" },
  { value: "app.updated", label: "App Updated" },
  { value: "secret.created", label: "Secret Added" },
  { value: "form.submitted", label: "Form Submitted" },
  { value: "error", label: "Errors" },
  { value: "info", label: "Info" },
];

const EVENT_META: Record<string, { icon: any; color: string; bg: string }> = {
  "app.published": { icon: Rocket, color: "text-green-400", bg: "bg-green-500/10" },
  "app.updated": { icon: Zap, color: "text-blue-400", bg: "bg-blue-500/10" },
  "secret.created": { icon: KeyRound, color: "text-amber-400", bg: "bg-amber-500/10" },
  "form.submitted": { icon: ClipboardList, color: "text-purple-400", bg: "bg-purple-500/10" },
  "error": { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  "info": { icon: Info, color: "text-gray-400", bg: "bg-gray-500/10" },
};

function getEventMeta(type: string) {
  return EVENT_META[type] || { icon: Activity, color: "text-muted-foreground", bg: "bg-muted/30" };
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(date).toLocaleDateString();
}

export default function ActivityLogsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/logs"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/logs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      toast({ title: "Log entry deleted" });
    },
  });

  const filtered = logs.filter(log => {
    const matchType = filterType === "all" || log.eventType === filterType;
    const matchSearch = !search || log.title.toLowerCase().includes(search.toLowerCase()) || (log.description || "").toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" /> Activity Logs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track all events across your apps — publishes, secrets, form submissions and more.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-logs">
          <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search logs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-search-logs"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44" data-testid="select-filter-event-type">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="self-center px-3 py-1.5">
          {filtered.length} entries
        </Badge>
      </div>

      {/* Log entries */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Showing {filtered.length} of {logs.length} total logs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No activity yet</p>
              <p className="text-xs">Events will appear here as you use the platform.</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((log: any) => {
                const meta = getEventMeta(log.eventType);
                const Icon = meta.icon;
                return (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group" data-testid={`row-log-${log.id}`}>
                    <div className={`w-8 h-8 rounded-full ${meta.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{log.title}</p>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${meta.color} border-current/30`}>
                          {log.eventType}
                        </Badge>
                      </div>
                      {log.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{log.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {timeAgo(log.createdAt)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600"
                        onClick={() => deleteMutation.mutate(log.id)}
                        data-testid={`button-delete-log-${log.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
