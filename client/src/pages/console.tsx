import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Terminal, Circle, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, Trash2, Globe, Activity,
} from "lucide-react";

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(date).toLocaleString();
}

function getLogStyle(type: string) {
  switch (type) {
    case "error": return { color: "text-red-400", prefix: "[ERR]", icon: XCircle };
    case "warning": return { color: "text-amber-400", prefix: "[WARN]", icon: AlertTriangle };
    case "success":
    case "app.published":
    case "app.updated": return { color: "text-green-400", prefix: "[INFO]", icon: CheckCircle };
    case "secret.created": return { color: "text-amber-300", prefix: "[SEC]", icon: Circle };
    case "form.submitted": return { color: "text-purple-400", prefix: "[FORM]", icon: Circle };
    default: return { color: "text-gray-400", prefix: "[LOG]", icon: Circle };
  }
}

export default function ConsolePage() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [filterApp, setFilterApp] = useState<string>("all");

  const { data: apps = [] } = useQuery<any[]>({ queryKey: ["/api/published-apps"] });
  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/logs"],
    refetchInterval: 30000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const filtered = filterApp === "all"
    ? logs
    : logs.filter((l: any) => l.appId === parseInt(filterApp));

  const errorCount = filtered.filter((l: any) => l.eventType === "error").length;
  const warningCount = filtered.filter((l: any) => l.eventType === "warning").length;

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Terminal className="w-6 h-6 text-primary" /> Console
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time activity stream for your published apps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {errorCount > 0 && <Badge variant="destructive">{errorCount} errors</Badge>}
          {warningCount > 0 && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">{warningCount} warnings</Badge>}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-console">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 items-center">
        <Select value={filterApp} onValueChange={setFilterApp}>
          <SelectTrigger className="w-52" data-testid="select-console-app">
            <Globe className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue placeholder="All apps" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All apps</SelectItem>
            {apps.map((app: any) => (
              <SelectItem key={app.id} value={String(app.id)}>{app.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Circle className="w-2 h-2 fill-green-500 text-green-500" />
          <span>Live — auto-refreshes every 30s</span>
        </div>
      </div>

      {/* Terminal Output */}
      <Card className="flex-1 bg-zinc-950 border-zinc-800 font-mono overflow-hidden">
        <CardHeader className="py-2 px-4 border-b border-zinc-800 flex flex-row items-center justify-between">
          <CardTitle className="text-xs text-zinc-400 font-mono font-normal flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5" />
            afroai-console — {filtered.length} entries
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-5 bg-zinc-800" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
              <Activity className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No console output yet.</p>
              <p className="text-xs mt-1">Events from your apps will appear here.</p>
            </div>
          ) : (
            <div className="p-3 space-y-0.5 text-xs leading-relaxed">
              {/* Startup banner */}
              <div className="text-green-500 mb-3 border-b border-zinc-800 pb-2">
                <p>Afro AI Console — Initialized</p>
                <p className="text-zinc-600">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</p>
              </div>
              {filtered.map((log: any) => {
                const style = getLogStyle(log.eventType);
                const Icon = style.icon;
                return (
                  <div key={log.id} className="flex items-start gap-2 group hover:bg-zinc-900/50 rounded px-1 py-0.5" data-testid={`row-console-log-${log.id}`}>
                    <span className="text-zinc-600 flex-shrink-0 w-32">{new Date(log.createdAt).toLocaleTimeString()}</span>
                    <span className={`${style.color} flex-shrink-0 w-12`}>{style.prefix}</span>
                    <Icon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${style.color}`} />
                    <span className={`flex-1 ${style.color}`}>{log.title}</span>
                    {log.description && <span className="text-zinc-600 truncate max-w-48">{log.description}</span>}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
