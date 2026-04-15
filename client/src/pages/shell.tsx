import { useEffect, useRef, useState } from "react";
import { Terminal as TerminalIcon, Wifi, WifiOff, RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const SHELL_SECRET = import.meta.env.VITE_SHELL_SECRET || "afroai-shell-secret";

export default function ShellPage() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const socketRef = useRef<any>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [adminKey, setAdminKey] = useState(SHELL_SECRET);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initTerminal = async () => {
    if (!terminalRef.current) return;

    // Dynamically import xterm to avoid SSR issues
    const { Terminal } = await import("@xterm/xterm");
    const { FitAddon } = await import("@xterm/addon-fit");
    await import("@xterm/xterm/css/xterm.css");

    if (xtermRef.current) {
      xtermRef.current.dispose();
    }

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: "#09090b",
        foreground: "#e4e4e7",
        cursor: "#22c55e",
        selectionBackground: "#3f3f46",
        black: "#18181b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e4e4e7",
        brightBlack: "#52525b",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#fafafa",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln("\x1b[36mAfro AI Shell — Connecting...\x1b[0m");

    return { term, fitAddon };
  };

  const connect = async () => {
    setConnecting(true);
    setError(null);

    const result = await initTerminal();
    if (!result) return;
    const { term, fitAddon } = result;

    const { io } = await import("socket.io-client");

    const socket = io(window.location.origin, {
      path: "/shell-ws",
      auth: { adminKey },
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setConnecting(false);
    });

    socket.on("disconnect", () => {
      setConnected(false);
      term.writeln("\r\n\x1b[33m[Disconnected from shell]\x1b[0m");
    });

    socket.on("connect_error", (err: any) => {
      setConnecting(false);
      setError("Connection failed: " + err.message);
      term.writeln(`\r\n\x1b[31m[Connection error: ${err.message}]\x1b[0m`);
    });

    socket.on("output", (data: string) => {
      term.write(data);
    });

    term.onData((data) => {
      socket.emit("input", data);
    });

    // Handle terminal resize
    const handleResize = () => {
      fitAddon.fit();
      socket.emit("resize", { cols: term.cols, rows: term.rows });
    };
    window.addEventListener("resize", handleResize);
    socket.on("disconnect", () => window.removeEventListener("resize", handleResize));
  };

  const disconnect = () => {
    socketRef.current?.disconnect();
    setConnected(false);
  };

  const reconnect = () => {
    disconnect();
    setTimeout(connect, 300);
  };

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      xtermRef.current?.dispose();
    };
  }, []);

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Shield className="w-7 h-7 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold">Interactive Shell</h1>
          <p className="text-muted-foreground text-sm max-w-xs">
            This is a protected admin feature. Enter your shell access key to continue.
          </p>
        </div>
        <div className="flex gap-2 w-full max-w-sm">
          <Input
            type="password"
            placeholder="Shell access key"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setUnlocked(true)}
            data-testid="input-shell-key"
          />
          <Button onClick={() => setUnlocked(true)} data-testid="button-shell-unlock">
            Unlock
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <TerminalIcon className="w-5 h-5 text-green-500" />
            Interactive Shell
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">
            Real bash shell — runs commands directly on the server
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={connected
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-zinc-700 text-zinc-500"}
            data-testid="status-shell-connection"
          >
            {connected ? (
              <><Wifi className="w-3 h-3 mr-1" /> Connected</>
            ) : (
              <><WifiOff className="w-3 h-3 mr-1" /> Disconnected</>
            )}
          </Badge>
          {connected ? (
            <Button variant="outline" size="sm" onClick={reconnect} data-testid="button-shell-reconnect">
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Restart
            </Button>
          ) : (
            <Button size="sm" onClick={connect} disabled={connecting} data-testid="button-shell-connect">
              {connecting ? (
                <><RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> Connecting...</>
              ) : (
                <><TerminalIcon className="w-3.5 h-3.5 mr-1" /> Connect</>
              )}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* Terminal window */}
      <div
        className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden"
        style={{ minHeight: "400px" }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800 bg-zinc-900">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="ml-2 text-xs text-zinc-500 font-mono">afroai — bash</span>
        </div>

        {!connected && !connecting ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-600">
            <TerminalIcon className="w-10 h-10 opacity-20" />
            <p className="text-sm">Click Connect to start a shell session</p>
          </div>
        ) : (
          <div
            ref={terminalRef}
            className="w-full h-full p-2"
            style={{ minHeight: "380px" }}
            data-testid="shell-terminal"
          />
        )}
      </div>
    </div>
  );
}
