import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, History, MessageSquarePlus, MoreVertical,
  Brain, Terminal, FileEdit, Search, BookOpen, MoreHorizontal,
  Trash2, ArrowUp, Pencil, X, Plus, ChevronDown, Square,
  Monitor, Sparkles, Globe, ListChecks, PanelRightOpen,
  Copy, Download, LogOut, Settings, Paperclip, Image as ImageIcon,
} from "lucide-react";

// ---------- Types ----------

type ActionKind = "reasoning" | "command" | "edit" | "search" | "docs" | "tool";

interface ActionChip { kind: ActionKind; label?: string; }

interface Attachment {
  originalName: string;
  mimetype: string;
  dataUrl: string;
  size: number;
}

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  actions?: ActionChip[];
  attachments?: Attachment[];
}

interface QueuedPrompt { id: string; text: string; }

interface ConversationSummary {
  id: number;
  title: string;
  createdAt: string;
  projectId?: number | null;
}

const ACTION_ICON: Record<ActionKind, any> = {
  reasoning: Brain, command: Terminal, edit: FileEdit,
  search: Search, docs: BookOpen, tool: MoreHorizontal,
};

function inferActions(content: string): ActionChip[] {
  const actions: ActionChip[] = [];
  if (/\blet me\b|\bi'?ll\b|\bi will\b|\bfirst\b|\bthen\b|\bnext\b|\bplan\b|\bthink\b|\banalyz/i.test(content)) actions.push({ kind: "reasoning" });
  const cmdMatches = content.match(/```(?:bash|sh|shell)|^\s*\$\s/gmi);
  if (cmdMatches) for (let i = 0; i < Math.min(cmdMatches.length, 3); i++) actions.push({ kind: "command" });
  const codeBlocks = content.match(/```[\w-]*\n[\s\S]*?```/g);
  if (codeBlocks) for (let i = 0; i < Math.min(codeBlocks.length, 4); i++) actions.push({ kind: "edit" });
  if (/\bsearch\b|\blook for\b|\bgrep\b|\blocate\b/i.test(content)) actions.push({ kind: "search" });
  if (/\bdocs\b|\bdocumentation\b|\breference\b|\bguide\b/i.test(content)) actions.push({ kind: "docs" });
  if (actions.length === 0) actions.push({ kind: "reasoning" });
  return actions.slice(0, 12);
}

function getQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

// ---------- Component ----------

export default function AgentPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/user"] });

  const projectIdParam = getQueryParam("projectId");
  const projectName = getQueryParam("project");
  const initialDescription = getQueryParam("description");

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [queue, setQueue] = useState<QueuedPrompt[]>([]);
  const [queueOpen, setQueueOpen] = useState(true);
  const [planMode, setPlanMode] = useState(false);
  const [powerMode, setPowerMode] = useState<"Power" | "Standard" | "Eco">("Power");
  const [working, setWorking] = useState(false);
  const [workingStatus, setWorkingStatus] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [queueDrainTrigger, setQueueDrainTrigger] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialDescriptionSentRef = useRef(false);

  // Load conversations list (for history drawer)
  const { data: conversations = [], refetch: refetchConvos } = useQuery<ConversationSummary[]>({
    queryKey: ["/api/conversations"],
    enabled: !!user,
  });

  // Create or load a conversation on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: projectName ? `${projectName} session` : "Agent Session",
            projectId: projectIdParam ? parseInt(projectIdParam) : undefined,
          }),
          credentials: "include",
        });
        if (!res.ok) return;
        const conv = await res.json();
        if (!cancelled) {
          setConversationId(conv.id);
          qc.invalidateQueries({ queryKey: ["/api/conversations"] });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-send initial description from URL once conversation is ready
  useEffect(() => {
    if (!conversationId || initialDescriptionSentRef.current) return;
    if (initialDescription && initialDescription.trim().length > 0) {
      initialDescriptionSentRef.current = true;
      sendMessage(initialDescription.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingContent, working]);

  useEffect(() => {
    if (queueDrainTrigger === 0 || working || queue.length === 0) return;
    const next = queue[0];
    setQueue(q => q.slice(1));
    sendMessage(next.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueDrainTrigger]);

  // ---------- Send message ----------

  const sendMessage = async (text: string, attachments: Attachment[] = []) => {
    if ((!text.trim() && attachments.length === 0) || !conversationId || working) return;

    const userMsg: AgentMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
      attachments: attachments.length > 0 ? attachments : undefined,
    };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setPendingAttachments([]);
    setWorking(true);
    setWorkingStatus("Thinking...");
    setStreamingContent("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const statusUpdates = ["Reading context...", "Reasoning...", "Drafting response...", "Finalizing..."];
    let statusIdx = 0;
    const statusTimer = setInterval(() => {
      if (statusIdx < statusUpdates.length) setWorkingStatus(statusUpdates[statusIdx++]);
    }, 800);

    let assistantText = "";
    let serverError: string | null = null;

    const handlePayload = (payload: string) => {
      if (!payload || payload === "[DONE]") return;
      let evt: any;
      try { evt = JSON.parse(payload); }
      catch { assistantText += payload; setStreamingContent(assistantText); return; }
      if (evt && evt.type === "error") { serverError = evt.message || "Agent error"; return; }
      if (evt && typeof evt.error === "string") { serverError = evt.error; return; }
      if (typeof evt === "string") assistantText += evt;
      else if (evt && (evt.type === "text" || evt.type === "chunk" || evt.type === "delta")) assistantText += evt.content || evt.text || evt.delta || "";
      else if (evt && typeof evt.content === "string") assistantText += evt.content;
      else if (evt && typeof evt.text === "string") assistantText += evt.text;
      else if (evt && typeof evt.delta === "string") assistantText += evt.delta;
      setStreamingContent(assistantText);
    };

    try {
      const body: any = { content: planMode ? `[PLAN MODE] ${text}` : text };
      if (attachments.length > 0) body.attachments = attachments;

      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          handlePayload(line.slice(5).trim());
          if (serverError) break;
        }
        if (serverError) break;
      }
      if (!serverError && buffer.startsWith("data:")) handlePayload(buffer.slice(5).trim());
      if (serverError) throw new Error(serverError);

      setMessages(m => [...m, {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: assistantText || "(No response)",
        timestamp: Date.now(),
        actions: inferActions(assistantText),
      }]);
      setQueueDrainTrigger(t => t + 1);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        toast({ title: "Agent error", description: e.message, variant: "destructive" });
      }
    } finally {
      clearInterval(statusTimer);
      setStreamingContent("");
      setWorking(false);
      setWorkingStatus("");
      abortRef.current = null;
    }
  };

  const handleSend = () => {
    if (!input.trim() && pendingAttachments.length === 0) return;
    if (working) {
      setQueue(q => [...q, { id: `q-${Date.now()}`, text: input.trim() }]);
      setInput("");
      toast({ title: "Added to queue", description: "Will run after the current task." });
      return;
    }
    sendMessage(input.trim(), pendingAttachments);
  };

  const stopAgent = () => {
    abortRef.current?.abort();
    setWorking(false);
    setWorkingStatus("");
  };

  // ---------- Attachments ----------

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const next: Attachment[] = [];
    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: `${f.name} exceeds 5MB`, variant: "destructive" });
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      next.push({ originalName: f.name, mimetype: f.type, dataUrl, size: f.size });
    }
    setPendingAttachments(p => [...p, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingAttachment = (idx: number) => {
    setPendingAttachments(p => p.filter((_, i) => i !== idx));
  };

  // ---------- Queue ----------

  const runQueueItem = (id: string) => {
    const item = queue.find(x => x.id === id);
    if (!item || working) return;
    setQueue(q => q.filter(x => x.id !== id));
    sendMessage(item.text);
  };
  const moveQueueItem = (id: string, dir: -1 | 1) => {
    setQueue(q => {
      const idx = q.findIndex(x => x.id === id);
      if (idx < 0) return q;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= q.length) return q;
      const copy = [...q];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };
  const editQueueItem = (id: string) => {
    const item = queue.find(x => x.id === id);
    if (!item) return;
    const updated = window.prompt("Edit prompt:", item.text);
    if (updated && updated.trim()) {
      setQueue(q => q.map(x => x.id === id ? { ...x, text: updated.trim() } : x));
    }
  };
  const deleteQueueItem = (id: string) => setQueue(q => q.filter(x => x.id !== id));
  const clearQueue = () => {
    if (queue.length === 0) return;
    if (window.confirm(`Clear all ${queue.length} queued prompt${queue.length !== 1 ? "s" : ""}?`)) setQueue([]);
  };

  // ---------- History ----------

  const loadConversation = async (id: number) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      const msgs: AgentMessage[] = (data.messages || []).map((m: any) => {
        let content = m.content;
        let attachments: Attachment[] | undefined;
        try {
          const parsed = JSON.parse(m.content);
          if (parsed.text && parsed.attachments) {
            content = parsed.text;
            attachments = parsed.attachments;
          }
        } catch {}
        return {
          id: `db-${m.id}`,
          role: m.role,
          content,
          timestamp: new Date(m.createdAt || Date.now()).getTime(),
          actions: m.role === "assistant" ? inferActions(content) : undefined,
          attachments,
        };
      });
      setMessages(msgs);
      setConversationId(id);
      setHistoryOpen(false);
      toast({ title: "Loaded conversation" });
    } catch (e: any) {
      toast({ title: "Error loading conversation", description: e.message, variant: "destructive" });
    }
  };

  const startNewChat = async () => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New chat" }),
        credentials: "include",
      });
      if (res.ok) {
        const conv = await res.json();
        setConversationId(conv.id);
        setMessages([]);
        setQueue([]);
        refetchConvos();
        toast({ title: "Started new chat" });
      }
    } catch {}
  };

  // ---------- Top menu actions ----------

  const copyShareLink = () => {
    const url = `${window.location.origin}/chat${projectIdParam ? `?projectId=${projectIdParam}` : ""}`;
    navigator.clipboard.writeText(url).then(() => toast({ title: "Link copied" }));
  };

  const exportChat = () => {
    const blob = new Blob([
      messages.map(m => `[${m.role.toUpperCase()}]\n${m.content}\n`).join("\n---\n"),
    ], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chat-${conversationId || "export"}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---------- Bottom nav ----------

  const goToProjectPreview = () => {
    if (projectIdParam) setLocation(`/preview/${projectIdParam}`);
    else setLocation("/dashboard");
  };
  const goToShell = () => setLocation("/shell");
  const goToTasks = () => setLocation("/dashboard");
  const goToWeb = () => window.open("https://afroaigroup.com", "_blank");
  const goToCode = () => setLocation("/chat-classic");

  // ---------- Render ----------

  return (
    <div className="flex flex-col h-full min-h-0 bg-zinc-950 text-zinc-100">
      <input ref={fileInputRef} type="file" accept="image/*,.pdf,.txt,.md,.csv,.json" multiple className="hidden" onChange={handleFileChange} data-testid="input-file" />

      {/* Top bar */}
      <header className="flex items-center justify-between px-3 py-3 border-b border-zinc-800/80 flex-shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Go back" className="h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => setLocation("/dashboard")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Conversation history" className="h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" data-testid="button-history">
                <History className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-zinc-950 border-zinc-800 text-zinc-100 w-80">
              <SheetHeader>
                <SheetTitle className="text-zinc-100">Conversation history</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-1 overflow-y-auto max-h-[calc(100vh-100px)]">
                {conversations.length === 0 && (
                  <p className="text-sm text-zinc-500 px-2 py-3">No conversations yet.</p>
                )}
                {conversations.map(c => (
                  <button
                    key={c.id}
                    onClick={() => loadConversation(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-900 transition-colors ${conversationId === c.id ? "bg-zinc-900 border border-violet-500/30" : ""}`}
                    data-testid={`button-history-conv-${c.id}`}
                  >
                    <p className="text-sm text-zinc-200 truncate">{c.title || "Untitled"}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{new Date(c.createdAt).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-violet-500/20 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-violet-400" />
          </div>
          <span className="font-semibold text-sm">{projectName || "Agent"}</span>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="New chat" className="h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" data-testid="button-new-chat" onClick={startNewChat}>
            <MessageSquarePlus className="w-4 h-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More options" className="h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" data-testid="button-menu">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-100">
              <DropdownMenuItem onClick={copyShareLink} data-testid="menu-copy-link">
                <Copy className="w-4 h-4 mr-2" /> Copy share link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportChat} data-testid="menu-export">
                <Download className="w-4 h-4 mr-2" /> Export chat
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMessages([])} data-testid="menu-clear">
                <Trash2 className="w-4 h-4 mr-2" /> Clear messages
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem onClick={() => setLocation("/dashboard")} data-testid="menu-settings">
                <Settings className="w-4 h-4 mr-2" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.location.href = "/api/logout"} data-testid="menu-logout">
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {messages.length === 0 && !working && (
          <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500 px-6">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-violet-400" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-200 mb-1">Hey {user?.firstName || "there"} 👋</h2>
            <p className="text-sm mb-4">Ask me to build, edit, debug, or explain anything.</p>
            <div className="grid gap-2 w-full max-w-sm">
              {[
                "Build a simple landing page for my business",
                "Create a contact form that sends to my email",
                "Add login with Google to my app",
              ].map(s => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="px-3 py-2 text-left text-sm text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors"
                  data-testid={`button-suggestion-${s.slice(0, 10)}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => <MessageBlock key={msg.id} msg={msg} />)}

        {working && streamingContent && (
          <p className="whitespace-pre-wrap text-sm text-zinc-200 leading-relaxed" data-testid="text-streaming">{streamingContent}</p>
        )}

        {working && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <div className="flex gap-1.5">
              <ActionIcon kind="edit" />
              <ActionIcon kind="reasoning" pulse />
              <ActionIcon kind="docs" />
              <ActionIcon kind="search" />
              <div className="w-6 h-6 rounded-md border border-violet-500/40 bg-violet-500/15 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-violet-400 animate-pulse" />
              </div>
            </div>
            <span data-testid="text-working-status">{workingStatus || "Working..."}</span>
          </div>
        )}
      </div>

      {/* Queue panel */}
      {(queue.length > 0 || queueOpen) && (
        <div className="border-t border-zinc-800/80 bg-zinc-950 flex-shrink-0">
          <button
            onClick={() => setQueueOpen(!queueOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-900/60 transition-colors"
            data-testid="button-toggle-queue"
          >
            <div className="flex items-center gap-2">
              <span>Queue</span>
              {queue.length > 0 && <span className="text-xs text-zinc-500">({queue.length})</span>}
            </div>
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              {queue.length > 0 && (
                <Button variant="ghost" size="icon" aria-label="Clear queue" className="h-7 w-7 text-zinc-500 hover:text-red-400 hover:bg-zinc-800" onClick={clearQueue} data-testid="button-clear-queue">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
              <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${queueOpen ? "" : "-rotate-90"}`} />
            </div>
          </button>

          {queueOpen && queue.length > 0 && (
            <div className="px-3 pb-3 space-y-2 max-h-48 overflow-y-auto">
              {queue.map((item, idx) => (
                <Card key={item.id} className="bg-zinc-900/60 border-zinc-800 rounded-xl" data-testid={`card-queue-${item.id}`}>
                  <CardContent className="p-3 flex items-start gap-2">
                    <p className="flex-1 text-sm text-zinc-300 leading-snug line-clamp-3 min-w-0">{item.text}</p>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => runQueueItem(item.id)} disabled={working} data-testid={`button-queue-next-${item.id}`}>Next</Button>
                      <Button variant="ghost" size="icon" aria-label="Move up" className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => moveQueueItem(item.id, -1)} disabled={idx === 0} data-testid={`button-queue-up-${item.id}`}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Edit prompt" className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => editQueueItem(item.id)} data-testid={`button-queue-edit-${item.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Remove from queue" className="h-7 w-7 text-zinc-400 hover:text-red-400 hover:bg-zinc-800" onClick={() => deleteQueueItem(item.id)} data-testid={`button-queue-delete-${item.id}`}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pending attachments */}
      {pendingAttachments.length > 0 && (
        <div className="border-t border-zinc-800/80 bg-zinc-950 px-3 py-2 flex-shrink-0 flex flex-wrap gap-2">
          {pendingAttachments.map((att, idx) => (
            <div key={idx} className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-300" data-testid={`attachment-pending-${idx}`}>
              {att.mimetype.startsWith("image/") ? <ImageIcon className="w-3 h-3" /> : <Paperclip className="w-3 h-3" />}
              <span className="max-w-[140px] truncate">{att.originalName}</span>
              <button onClick={() => removePendingAttachment(idx)} aria-label="Remove attachment" className="text-zinc-500 hover:text-red-400">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-zinc-800/80 bg-zinc-950 px-3 py-3 flex-shrink-0">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.metaKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Make, test, iterate..."
          className="bg-transparent border-0 text-sm text-zinc-200 placeholder:text-zinc-500 resize-none min-h-[40px] max-h-32 px-1 py-1 focus-visible:ring-0 focus-visible:ring-offset-0"
          rows={1}
          data-testid="input-prompt"
        />

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" aria-label="Attach file" onClick={handleAttachClick} className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-full" data-testid="button-attach">
              <Plus className="w-4 h-4" />
            </Button>

            <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer select-none">
              <Checkbox checked={planMode} onCheckedChange={(v) => setPlanMode(!!v)} className="h-3.5 w-3.5 border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500" data-testid="checkbox-plan-mode" />
              <span>Plan</span>
            </label>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 text-xs text-zinc-300 hover:text-zinc-100" data-testid="button-power-mode">
                  <span>{powerMode}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                {(["Power", "Standard", "Eco"] as const).map(m => (
                  <DropdownMenuItem key={m} onClick={() => setPowerMode(m)} data-testid={`menu-power-${m.toLowerCase()}`}>
                    {m}{powerMode === m ? " ✓" : ""}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {working ? (
            <Button size="icon" aria-label="Stop generation" className="h-9 w-9 rounded-lg bg-blue-500 hover:bg-blue-600 text-white" onClick={stopAgent} data-testid="button-stop">
              <Square className="w-3.5 h-3.5 fill-white" />
            </Button>
          ) : (
            <Button size="icon" aria-label="Send message" className="h-9 w-9 rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:bg-zinc-800 disabled:text-zinc-500" onClick={handleSend} disabled={(!input.trim() && pendingAttachments.length === 0) || !conversationId} data-testid="button-send">
              <ArrowUp className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="flex items-center justify-around px-2 py-2 border-t border-zinc-800/80 bg-zinc-950 flex-shrink-0">
        {[
          { icon: Square, key: "code", label: "Classic chat", testid: "nav-code", action: goToCode },
          { icon: Monitor, key: "preview", label: "Preview", testid: "nav-preview", action: goToProjectPreview },
          { icon: Sparkles, key: "agent", label: "Agent", active: true, testid: "nav-agent", action: () => {} },
          { icon: Globe, key: "web", label: "Open site", testid: "nav-web", action: goToWeb },
          { divider: true, key: "div" },
          { icon: Terminal, key: "shell", label: "Shell", testid: "nav-shell", action: goToShell },
          { icon: ListChecks, key: "tasks", label: "Dashboard", testid: "nav-tasks", action: goToTasks },
          { icon: PanelRightOpen, key: "panel", label: "Toggle queue", testid: "nav-panel", action: () => setQueueOpen(o => !o) },
        ].map(item => (item as any).divider ? (
          <div key={item.key} className="w-px h-5 bg-zinc-800" />
        ) : (
          <button
            key={item.key}
            aria-label={(item as any).label}
            onClick={(item as any).action}
            data-testid={(item as any).testid}
            className={`relative h-9 w-9 flex items-center justify-center rounded-md hover:bg-zinc-800 transition-colors ${(item as any).active ? "text-violet-400" : "text-zinc-400"}`}
          >
            {(item as any).icon && (() => { const I = (item as any).icon; return <I className="w-4 h-4" />; })()}
            {(item as any).active && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-violet-400 rounded-full" />}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ---------- Sub-components ----------

function MessageBlock({ msg }: { msg: AgentMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1" data-testid={`message-user-${msg.id}`}>
        <div className="max-w-[85%] px-3 py-2 rounded-2xl bg-violet-500/15 text-zinc-100 text-sm">
          {msg.content}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {msg.attachments.map((a, i) => a.mimetype.startsWith("image/") ? (
                <img key={i} src={a.dataUrl} alt={a.originalName} className="rounded-md max-w-[140px] max-h-[140px] object-cover" />
              ) : (
                <div key={i} className="flex items-center gap-1 text-xs bg-zinc-900/50 px-2 py-1 rounded">
                  <Paperclip className="w-3 h-3" /> {a.originalName}
                </div>
              ))}
            </div>
          )}
        </div>
        <span className="text-[10px] text-zinc-500 px-1">{timeAgo(msg.timestamp)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid={`message-assistant-${msg.id}`}>
      {msg.actions && msg.actions.length > 0 && <ActionChipsRow actions={msg.actions} />}
      <p className="whitespace-pre-wrap text-sm text-zinc-200 leading-relaxed">{msg.content}</p>
    </div>
  );
}

function ActionChipsRow({ actions }: { actions: ActionChip[] }) {
  const display = actions.slice(0, 6);
  const overflow = actions.length > 6;
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
      {display.map((a, i) => <ActionIcon key={i} kind={a.kind} />)}
      {overflow && (
        <div className="w-6 h-6 rounded-md border border-zinc-700 bg-zinc-900 flex items-center justify-center">
          <MoreHorizontal className="w-3 h-3 text-zinc-500" />
        </div>
      )}
      <span className="ml-1">{actions.length} action{actions.length !== 1 ? "s" : ""}</span>
    </div>
  );
}

function ActionIcon({ kind, pulse = false }: { kind: ActionKind; pulse?: boolean }) {
  const Icon = ACTION_ICON[kind];
  return (
    <div className={`w-6 h-6 rounded-md border border-zinc-700 bg-zinc-900 flex items-center justify-center ${pulse ? "animate-pulse" : ""}`}>
      <Icon className="w-3 h-3 text-zinc-400" />
    </div>
  );
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  return new Date(ts).toLocaleDateString();
}
