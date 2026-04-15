import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Terminal, Circle, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, Globe, Activity, Wifi, WifiOff, Shield,
  SquareTerminal, LayoutList, Rocket, Search, Trash2,
} from "lucide-react";

const SHELL_SECRET = import.meta.env.VITE_SHELL_SECRET || "afroai-shell-secret";

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
    case "error": return { color: "text-red-400", bg: "hover:bg-red-950/20", prefix: "[ERR] ", icon: XCircle };
    case "warning": return { color: "text-amber-400", bg: "hover:bg-amber-950/20", prefix: "[WARN]", icon: AlertTriangle };
    case "success":
    case "app.published":
    case "app.updated": return { color: "text-green-400", bg: "hover:bg-green-950/20", prefix: "[INFO]", icon: CheckCircle };
    case "secret.created": return { color: "text-amber-300", bg: "hover:bg-amber-950/10", prefix: "[SEC] ", icon: Shield };
    case "form.submitted": return { color: "text-purple-400", bg: "hover:bg-purple-950/20", prefix: "[FORM]", icon: Circle };
    default: return { color: "text-zinc-400", bg: "hover:bg-zinc-800/40", prefix: "[LOG] ", icon: Circle };
  }
}

// ─── Activity Logs Tab ───────────────────────────────────────────────────────

function ActivityTab() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [filterApp, setFilterApp] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");

  const { data: apps = [] } = useQuery<any[]>({ queryKey: ["/api/published-apps"] });
  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/logs"],
    refetchInterval: 30000,
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const filtered = logs.filter((l: any) => {
    if (filterApp !== "all" && l.appId !== parseInt(filterApp)) return false;
    if (filterType !== "all" && l.eventType !== filterType) return false;
    if (search && !l.title?.toLowerCase().includes(search.toLowerCase()) &&
        !l.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const errorCount = logs.filter((l: any) => l.eventType === "error").length;
  const warnCount = logs.filter((l: any) => l.eventType === "warning").length;

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 p-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="pl-8 h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-300 placeholder:text-zinc-600"
            data-testid="input-log-search"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 w-32 text-xs bg-zinc-900 border-zinc-700 text-zinc-300" data-testid="select-log-type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
            <SelectItem value="warning">Warnings</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="app.published">Published</SelectItem>
            <SelectItem value="form.submitted">Forms</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterApp} onValueChange={setFilterApp}>
          <SelectTrigger className="h-8 w-40 text-xs bg-zinc-900 border-zinc-700 text-zinc-300" data-testid="select-log-app">
            <Globe className="w-3 h-3 mr-1" />
            <SelectValue placeholder="All apps" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All apps</SelectItem>
            {apps.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1.5 items-center">
          {errorCount > 0 && <Badge variant="destructive" className="text-xs h-7">{errorCount} err</Badge>}
          {warnCount > 0 && <Badge className="text-xs h-7 bg-amber-500/10 text-amber-400 border-amber-500/30">{warnCount} warn</Badge>}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white" onClick={() => refetch()} disabled={isFetching} data-testid="button-logs-refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto font-mono text-xs p-3 space-y-0.5">
        {isLoading ? (
          Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-5 bg-zinc-800 mb-1" />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <Activity className="w-10 h-10 mb-3 opacity-20" />
            <p>No logs match your filters.</p>
          </div>
        ) : (
          <>
            <div className="text-green-500 pb-2 mb-1 border-b border-zinc-800">
              <span>Afro AI Console v2 — Activity Feed initialized — {filtered.length} events</span>
            </div>
            {filtered.map((log: any) => {
              const s = getLogStyle(log.eventType);
              const Icon = s.icon;
              return (
                <div key={log.id} className={`flex items-start gap-2 rounded px-1.5 py-1 ${s.bg} cursor-default`} data-testid={`row-log-${log.id}`}>
                  <span className="text-zinc-600 shrink-0 w-20 tabular-nums">{new Date(log.createdAt).toLocaleTimeString()}</span>
                  <span className={`${s.color} shrink-0 w-14 font-semibold`}>{s.prefix}</span>
                  <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${s.color}`} />
                  <span className={`flex-1 ${s.color}`}>{log.title}</span>
                  {log.description && <span className="text-zinc-600 truncate max-w-48 hidden md:block">{log.description}</span>}
                  <span className="text-zinc-700 shrink-0 hidden lg:block">{timeAgo(log.createdAt)}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Terminal Tab ────────────────────────────────────────────────────────────

function TerminalTab() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const socketRef = useRef<any>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [adminKey, setAdminKey] = useState(SHELL_SECRET);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    if (!terminalRef.current) return;
    setConnecting(true);
    setError(null);

    const { Terminal } = await import("@xterm/xterm");
    const { FitAddon } = await import("@xterm/addon-fit");
    await import("@xterm/xterm/css/xterm.css");

    if (xtermRef.current) { xtermRef.current.dispose(); }

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
      theme: {
        background: "#09090b", foreground: "#e4e4e7", cursor: "#22c55e",
        selectionBackground: "#3f3f46",
        black: "#18181b", red: "#ef4444", green: "#22c55e", yellow: "#eab308",
        blue: "#3b82f6", magenta: "#a855f7", cyan: "#06b6d4", white: "#e4e4e7",
        brightBlack: "#52525b", brightRed: "#f87171", brightGreen: "#4ade80",
        brightYellow: "#facc15", brightBlue: "#60a5fa", brightMagenta: "#c084fc",
        brightCyan: "#22d3ee", brightWhite: "#fafafa",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const { io } = await import("socket.io-client");
    const socket = io(window.location.origin, { path: "/shell-ws", auth: { adminKey }, transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => { setConnected(true); setConnecting(false); });
    socket.on("disconnect", () => { setConnected(false); term.writeln("\r\n\x1b[33m[Disconnected]\x1b[0m"); });
    socket.on("connect_error", (err: any) => { setConnecting(false); setError("Connection failed: " + err.message); });
    socket.on("output", (data: string) => term.write(data));

    term.onData((data) => socket.emit("input", data));

    const resize = () => { fitAddon.fit(); socket.emit("resize", { cols: term.cols, rows: term.rows }); };
    window.addEventListener("resize", resize);
    socket.on("disconnect", () => window.removeEventListener("resize", resize));
  };

  const disconnect = () => { socketRef.current?.disconnect(); setConnected(false); };

  useEffect(() => () => { socketRef.current?.disconnect(); xtermRef.current?.dispose(); }, []);

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Shield className="w-6 h-6 text-amber-500" />
          </div>
          <p className="text-sm font-medium">Admin access required</p>
          <p className="text-xs text-zinc-500 max-w-xs">Enter your shell access key to start an interactive bash session on the server.</p>
        </div>
        <div className="flex gap-2 w-full max-w-sm">
          <Input type="password" placeholder="Shell access key" value={adminKey} onChange={(e) => setAdminKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setUnlocked(true)}
            className="bg-zinc-900 border-zinc-700 text-zinc-300" data-testid="input-shell-key" />
          <Button onClick={() => setUnlocked(true)} data-testid="button-shell-unlock">Unlock</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Terminal toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/60">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500 opacity-80" />
          <div className="w-3 h-3 rounded-full bg-amber-500 opacity-80" />
          <div className="w-3 h-3 rounded-full bg-green-500 opacity-80" />
        </div>
        <span className="text-xs text-zinc-500 font-mono ml-2">bash — afroai-server</span>
        <div className="flex-1" />
        {error && <span className="text-xs text-red-400">{error}</span>}
        {connected ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400 hover:text-white gap-1.5" onClick={() => { disconnect(); setTimeout(connect, 300); }} data-testid="button-shell-restart">
            <RefreshCw className="w-3 h-3" /> Restart
          </Button>
        ) : (
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={connect} disabled={connecting} data-testid="button-shell-connect">
            {connecting ? <><RefreshCw className="w-3 h-3 animate-spin" /> Connecting...</> : <><Terminal className="w-3 h-3" /> Connect</>}
          </Button>
        )}
      </div>

      {/* Xterm */}
      <div className="flex-1 bg-zinc-950 relative" style={{ minHeight: 0 }}>
        {!connected && !connecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600">
            <SquareTerminal className="w-12 h-12 opacity-10" />
            <p className="text-sm">Click Connect to start a bash session</p>
          </div>
        )}
        <div ref={terminalRef} className="w-full h-full p-1" data-testid="shell-terminal" />
      </div>
    </div>
  );
}

// ─── Deployments Tab ─────────────────────────────────────────────────────────

function DeploymentsTab() {
  const { data: apps = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/published-apps"] });

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 bg-zinc-800" />)
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
          <Rocket className="w-10 h-10 mb-3 opacity-20" />
          <p className="text-sm">No deployments yet.</p>
        </div>
      ) : (
        apps.map((app: any) => (
          <div key={app.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 hover:border-zinc-700 transition-colors" data-testid={`row-deployment-${app.id}`}>
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${app.status === "suspended" ? "bg-zinc-500" : "bg-green-500"}`} />
              <div>
                <p className="text-sm font-medium text-zinc-200">{app.title}</p>
                <p className="text-xs text-zinc-500 font-mono">{app.subdomain ? `${app.subdomain}.afroaigroup.com` : app.customDomain || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={`text-xs ${app.status === "suspended" ? "border-zinc-700 text-zinc-500" : "border-green-500/30 text-green-400 bg-green-500/10"}`}>
                {app.status || "live"}
              </Badge>
              <span className="text-xs text-zinc-600">{timeAgo(app.updatedAt || app.createdAt)}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Main Console Page ───────────────────────────────────────────────────────

type Tab = "logs" | "terminal" | "deployments";

export default function ConsolePage() {
  const [tab, setTab] = useState<Tab>("logs");
  const [shellConnected, setShellConnected] = useState(false);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "logs", label: "Activity", icon: LayoutList },
    { id: "terminal", label: "Terminal", icon: SquareTerminal },
    { id: "deployments", label: "Deployments", icon: Rocket },
  ];

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-200" style={{ fontFamily: "system-ui, sans-serif" }}>

      {/* Top tab bar */}
      <div className="flex items-center border-b border-zinc-800 bg-zinc-900 px-1 shrink-0">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            data-testid={`tab-console-${id}`}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
              tab === id
                ? "border-blue-500 text-white bg-zinc-800/50"
                : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 px-3">
          <Circle className="w-2 h-2 fill-green-500 text-green-500" />
          <span className="text-xs text-zinc-500 hidden sm:block">afroai-console</span>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {tab === "logs" && <ActivityTab />}
        {tab === "terminal" && <TerminalTab />}
        {tab === "deployments" && <DeploymentsTab />}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-1 bg-blue-600 text-white text-xs shrink-0">
        <div className="flex items-center gap-1.5">
          {shellConnected
            ? <><Wifi className="w-3 h-3" /> Shell: Connected</>
            : <><WifiOff className="w-3 h-3 opacity-60" /> Shell: Idle</>
          }
        </div>
        <div className="flex items-center gap-1">
          <Circle className="w-2 h-2 fill-green-300 text-green-300" />
          <span>Server: Online</span>
        </div>
        <span className="opacity-60">Branch: main</span>
        <span className="opacity-60">Port: 5000</span>
        <div className="flex-1" />
        <span className="opacity-60">Afro AI Dev Console v2</span>
      </div>
    </div>
  );
}
