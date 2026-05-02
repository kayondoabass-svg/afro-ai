import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileCode2, Key, CheckCircle2, AlertTriangle, Wrench, Search, FilePlus, Pencil, Rocket, Loader2, History, ShieldAlert } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// --- Marker parsers (mirror the server) ---
const FILE_RE = /\[\[file:([^:\]]+)(?::(\d+)(?:-(\d+))?)?\]\]/g;
const STEP_RE = /\[\[step:([a-z]+):([^\]]+)\]\]/g;
const SECRET_RE = /\[\[needs-secret:([A-Z0-9_]+)(?::([^\]]+))?\]\]/g;

export interface ParsedVibe {
  cleanText: string;
  files: { path: string; start?: number; end?: number }[];
  steps: { kind: string; label: string }[];
  secrets: { name: string; reason?: string }[];
}

export function parseVibeMarkers(text: string): ParsedVibe {
  const files: ParsedVibe["files"] = [];
  const steps: ParsedVibe["steps"] = [];
  const secrets: ParsedVibe["secrets"] = [];
  let m;
  FILE_RE.lastIndex = 0;
  while ((m = FILE_RE.exec(text)) !== null) {
    files.push({ path: m[1].trim(), start: m[2] ? parseInt(m[2]) : undefined, end: m[3] ? parseInt(m[3]) : (m[2] ? parseInt(m[2]) : undefined) });
  }
  STEP_RE.lastIndex = 0;
  while ((m = STEP_RE.exec(text)) !== null) {
    steps.push({ kind: m[1], label: m[2].trim() });
  }
  SECRET_RE.lastIndex = 0;
  while ((m = SECRET_RE.exec(text)) !== null) {
    secrets.push({ name: m[1], reason: m[2]?.trim() });
  }
  // Strip markers from rendered text
  const cleanText = text
    .replace(FILE_RE, "")
    .replace(STEP_RE, "")
    .replace(SECRET_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleanText, files, steps, secrets };
}

// =================================================================
// FILE CHIP — clickable badge that opens an inline file viewer modal
// =================================================================
export function FileChip({ path, start, end }: { path: string; start?: number; end?: number }) {
  const [open, setOpen] = useState(false);
  const range = start ? (end && end !== start ? `:${start}-${end}` : `:${start}`) : "";
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-mono text-primary hover:bg-primary/10 transition-colors"
        data-testid={`vibe-file-chip-${path.replace(/[^a-z0-9]/gi, "-")}`}
      >
        <FileCode2 className="w-3 h-3" />
        <span className="truncate max-w-[260px]">{path}</span>
        {range && <span className="text-[10px] opacity-70">{range}</span>}
      </button>
      {open && <FileViewerDialog path={path} start={start} end={end} onClose={() => setOpen(false)} />}
    </>
  );
}

function FileViewerDialog({ path, start, end, onClose }: { path: string; start?: number; end?: number; onClose: () => void }) {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/vibe/file", path, start ?? 1, end ?? 9999],
    queryFn: async () => {
      const params = new URLSearchParams({ path });
      if (start) params.set("start", String(Math.max(1, start - 5)));
      if (end) params.set("end", String(end + 5));
      const res = await fetch(`/api/vibe/file?${params}`);
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      return res.json();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-sm">
            <FileCode2 className="w-4 h-4 text-primary" />
            {path}
            {start && <Badge variant="outline" className="text-[10px]">L{start}{end && end !== start ? `-${end}` : ""}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {data ? `${data.totalLines} lines · showing ${data.startLine}–${data.endLine}` : ""}
          </DialogDescription>
        </DialogHeader>
        {isLoading && <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
        {error && <div className="text-sm text-red-500 p-4">{(error as Error).message}</div>}
        {data && (
          <ScrollArea className="h-[60vh] rounded-md border bg-muted/30">
            <pre className="text-xs p-3 font-mono leading-relaxed">
              {data.snippet.split("\n").map((line: string, i: number) => {
                const lineNo = data.startLine + i;
                const inRange = start && end ? lineNo >= start && lineNo <= end : true;
                return (
                  <div key={i} className={inRange ? "bg-primary/5" : ""}>
                    <span className="inline-block w-10 text-right text-muted-foreground/50 mr-3 select-none">{lineNo}</span>
                    <span>{line}</span>
                  </div>
                );
              })}
            </pre>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =================================================================
// BUILD LEDGER — timeline of steps the agent took
// =================================================================
const STEP_ICONS: Record<string, any> = {
  read: Search, search: Search,
  edit: Pencil, write: FilePlus,
  test: CheckCircle2, deploy: Rocket,
  fix: Wrench,
};
const STEP_COLORS: Record<string, string> = {
  read: "text-blue-400", search: "text-blue-400",
  edit: "text-amber-400", write: "text-emerald-400",
  test: "text-green-400", deploy: "text-purple-400",
  fix: "text-rose-400",
};

export function BuildLedger({ steps }: { steps: { kind: string; label: string }[] }) {
  if (!steps.length) return null;
  return (
    <div className="rounded-lg border bg-card/50 p-3 space-y-1.5" data-testid="vibe-build-ledger">
      <div className="flex items-center gap-2 mb-1">
        <History className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Build Steps</span>
        <Badge variant="secondary" className="text-[10px] ml-auto">{steps.length}</Badge>
      </div>
      {steps.map((s, i) => {
        const Icon = STEP_ICONS[s.kind] || CheckCircle2;
        const color = STEP_COLORS[s.kind] || "text-muted-foreground";
        return (
          <div key={i} className="flex items-center gap-2 text-xs" data-testid={`vibe-step-${i}`}>
            <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
            <span className="text-muted-foreground capitalize w-12 text-[10px]">{s.kind}</span>
            <span className="flex-1 truncate">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// =================================================================
// REQUIRED SECRETS — chips for env vars the generated code needs
// =================================================================
export function RequiredSecrets({ code, hints = [] }: { code?: string; hints?: { name: string; reason?: string }[] }) {
  const { data } = useQuery<{ needed: string[]; missing: string[] }>({
    queryKey: ["/api/vibe/scan-secrets", code?.slice(0, 100), hints.map(h => h.name).join(",")],
    queryFn: async () => {
      if (!code && !hints.length) return { needed: hints.map(h => h.name), missing: [] };
      const res = await apiRequest("POST", "/api/vibe/scan-secrets", { code: code || "" });
      return res.json();
    },
    enabled: !!(code || hints.length),
  });
  const needed = Array.from(new Set([...(data?.needed || []), ...hints.map(h => h.name)]));
  const missing = new Set([...(data?.missing || []), ...hints.filter(h => !data?.needed?.includes(h.name)).map(h => h.name)]);
  if (!needed.length) return null;
  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2" data-testid="vibe-secrets-required">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-3.5 h-3.5 text-yellow-400" />
        <span className="text-[11px] uppercase tracking-wide font-semibold text-yellow-400">API Keys Required</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {needed.map((name) => {
          const hint = hints.find(h => h.name === name);
          const isMissing = missing.has(name);
          return (
            <div key={name} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-mono ${isMissing ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-green-500/40 bg-green-500/10 text-green-300"}`} data-testid={`vibe-secret-${name}`}>
              <Key className="w-3 h-3" />
              {name}
              {isMissing ? <AlertTriangle className="w-3 h-3 ml-0.5" /> : <CheckCircle2 className="w-3 h-3 ml-0.5" />}
              {hint?.reason && <span className="opacity-70 ml-1 font-sans normal-case">— {hint.reason}</span>}
            </div>
          );
        })}
      </div>
      {missing.size > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Add the missing keys in <span className="font-mono">Replit → Secrets</span> or your hosting provider's environment.
        </p>
      )}
    </div>
  );
}

// =================================================================
// TYPECHECK BADGE — inline TS/TSX validator for code blocks
// =================================================================
export function TypecheckBadge({ code, lang = "ts" }: { code: string; lang?: string }) {
  const [result, setResult] = useState<{ ok: boolean; errors: string[] } | null>(null);
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/vibe/typecheck", { code, lang });
      return res.json();
    },
    onSuccess: (data: any) => {
      setResult(data);
      if (!data.ok) toast({ title: `${data.errors.length} TypeScript error(s)`, description: data.errors[0] || "", variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Typecheck failed", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="inline-flex items-center gap-1.5">
      <Button
        size="sm" variant="outline" className="h-6 text-[10px] gap-1"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        data-testid="vibe-typecheck-button"
      >
        {mut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
        Typecheck
      </Button>
      {result && (
        <Badge variant={result.ok ? "secondary" : "destructive"} className="text-[10px]" data-testid="vibe-typecheck-result">
          {result.ok ? "✓ clean" : `${result.errors.length} error${result.errors.length !== 1 ? "s" : ""}`}
        </Badge>
      )}
    </div>
  );
}

// =================================================================
// VIBE PANEL — composes everything for a single assistant message
// =================================================================
export function VibePanel({ text, code }: { text: string; code?: string | null }) {
  const parsed = parseVibeMarkers(text);
  const hasContent = parsed.files.length > 0 || parsed.steps.length > 0 || parsed.secrets.length > 0 || !!code;
  if (!hasContent) return null;
  return (
    <div className="space-y-2 my-2" data-testid="vibe-panel">
      {parsed.steps.length > 0 && <BuildLedger steps={parsed.steps} />}
      {parsed.files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {parsed.files.map((f, i) => <FileChip key={i} path={f.path} start={f.start} end={f.end} />)}
        </div>
      )}
      {(parsed.secrets.length > 0 || code) && <RequiredSecrets code={code || undefined} hints={parsed.secrets} />}
    </div>
  );
}
