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
  Rocket, Undo2, RotateCcw, Eye, Clock, CheckCircle2, Layers,
} from "lucide-react";
import { PublishDialog } from "@/pages/ai-chat";

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

interface AppVersion {
  id: number;
  conversationId: number;
  htmlContent: string;
  label: string | null;
  createdAt: string;
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

  const handleLogout = async () => {
    try {
      await fetch("/cf-auth/logout", { method: "POST", credentials: "include" });
    } catch (err) {
      console.error("Logout request failed", err);
    }
    window.location.href = "/";
  };

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
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [progressStep, setProgressStep] = useState(0); // 0..4
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishCode, setPublishCode] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialDescriptionSentRef = useRef(false);

  // Load conversations list (for history drawer)
  const { data: conversations = [], refetch: refetchConvos } = useQuery<ConversationSummary[]>({
    queryKey: ["/api/conversations"],
    enabled: !!user,
  });

  // Load version history for the current conversation (each AI generation is a snapshot).
  // Backend enforces per-user ownership; another client cannot read these.
  const { data: appVersionsList = [], refetch: refetchVersions } = useQuery<AppVersion[]>({
    queryKey: ["/api/conversations", conversationId, "versions"],
    enabled: !!user && !!conversationId,
    refetchInterval: versionsOpen ? 3000 : false,
  });

  // Refetch versions whenever the assistant finishes a turn (a new snapshot may have been saved).
  useEffect(() => {
    if (!working && conversationId) refetchVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working, conversationId]);

  // Restore a previous version by pushing it back into the chat as the latest
  // assistant response. The existing publish / preview pipeline reads
  // `latestAssistantHtml()`, so this single push makes the old code "current"
  // without any extra plumbing.
  const restoreVersion = (ver: AppVersion, opts: { silent?: boolean } = {}) => {
    setMessages(m => [
      ...m,
      {
        id: `restore-${ver.id}-${Date.now()}`,
        role: "assistant",
        content: `Restored ${ver.label || `version #${ver.id}`} from ${new Date(ver.createdAt).toLocaleString()}.\n\n\`\`\`html\n${ver.htmlContent}\n\`\`\``,
        timestamp: Date.now(),
        actions: [{ kind: "edit", label: "Restored" }],
      },
    ]);
    if (!opts.silent) {
      toast({
        title: "Version restored",
        description: `${ver.label || `Version #${ver.id}`} is now your active app. Click Publish to deploy it.`,
      });
    }
    setVersionsOpen(false);
  };

  // One-click Undo: restore the second-most-recent snapshot (the one before
  // the latest generation). Disabled when there's nothing to undo back to.
  const canUndo = appVersionsList.length >= 2;
  const handleUndo = () => {
    if (!canUndo) return;
    const prior = appVersionsList[1]; // [0] is latest, [1] is the previous one
    restoreVersion(prior);
  };

  // Lazily create a conversation. Called on mount AND on first send (retry).
  const ensureConversation = async (): Promise<number | null> => {
    if (conversationId) return conversationId;
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
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        toast({
          title: "Couldn't start chat",
          description: errBody?.slice(0, 200) || `Server returned ${res.status}. Try refreshing or sign in again.`,
          variant: "destructive",
        });
        return null;
      }
      const conv = await res.json();
      setConversationId(conv.id);
      qc.invalidateQueries({ queryKey: ["/api/conversations"] });
      return conv.id;
    } catch (e: any) {
      toast({
        title: "Couldn't start chat",
        description: e?.message || "Network error. Check your connection and try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  // On mount: if this project already has a conversation, RESUME the latest one
  // (don't start over and don't pre-fill the original description). Only create
  // a fresh conversation when nothing exists yet.
  const resumedExistingRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (projectIdParam) {
          const pid = parseInt(projectIdParam);
          const res = await fetch(`/api/conversations/project/${pid}`, { credentials: "include" });
          if (!cancelled && res.ok) {
            const list: any[] = await res.json();
            if (Array.isArray(list) && list.length > 0) {
              // Newest first if backend already sorts; otherwise pick by createdAt desc
              const sorted = [...list].sort((a, b) =>
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
              );
              const latest = sorted[0];
              if (latest?.id) {
                resumedExistingRef.current = true;
                // Mark initial-description as already handled so it never repopulates
                initialDescriptionSentRef.current = true;
                await loadConversation(latest.id);
                return;
              }
            }
          }
        }
        if (cancelled) return;
        await ensureConversation();
      } catch {
        if (!cancelled) await ensureConversation();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdParam]);

  // Pre-fill (don't auto-send) the initial description from URL so the user
  // can review/edit it before pressing Send. Skipped when an existing
  // conversation was resumed — the user is continuing, not starting over.
  useEffect(() => {
    if (initialDescriptionSentRef.current) return;
    if (resumedExistingRef.current) return;
    if (initialDescription && initialDescription.trim().length > 0) {
      initialDescriptionSentRef.current = true;
      setInput(initialDescription.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDescription]);

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
    if ((!text.trim() && attachments.length === 0) || working) return;

    // Make sure we have a conversation; if mount-time creation failed, retry now.
    const convoId = await ensureConversation();
    if (!convoId) return;

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
    setWorkingStatus("Thinking…");
    setProgressStep(0);
    setStreamingContent("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Step 0: Thinking, 1: Reading, 2: Drafting, 3: Polishing, 4: Done
    const statusUpdates = [
      { step: 1, label: "Reading what you asked…" },
      { step: 2, label: "Drafting a response…" },
      { step: 3, label: "Polishing the words…" },
    ];
    let statusIdx = 0;
    const statusTimer = setInterval(() => {
      if (statusIdx < statusUpdates.length) {
        const s = statusUpdates[statusIdx++];
        setProgressStep(s.step);
        setWorkingStatus(s.label);
      }
    }, 1100);

    let assistantText = "";
    let serverError: string | null = null;

    const handlePayload = (payload: string) => {
      if (!payload || payload === "[DONE]") return;
      let evt: any;
      try { evt = JSON.parse(payload); }
      catch { assistantText += payload; setStreamingContent(assistantText); if (assistantText.length > 0) { setProgressStep(4); setWorkingStatus("Writing response…"); } return; }
      if (evt && evt.type === "error") { serverError = evt.message || "Agent error"; return; }
      if (evt && typeof evt.error === "string") { serverError = evt.error; return; }
      if (typeof evt === "string") assistantText += evt;
      else if (evt && (evt.type === "text" || evt.type === "chunk" || evt.type === "delta")) assistantText += evt.content || evt.text || evt.delta || "";
      else if (evt && typeof evt.content === "string") assistantText += evt.content;
      else if (evt && typeof evt.text === "string") assistantText += evt.text;
      else if (evt && typeof evt.delta === "string") assistantText += evt.delta;
      setStreamingContent(assistantText);
      if (assistantText.length > 0) { setProgressStep(4); setWorkingStatus("Writing response…"); }
    };

    try {
      const body: any = { content: planMode ? `[PLAN MODE] ${text}` : text };
      if (attachments.length > 0) body.attachments = attachments;

      const res = await fetch(`/api/conversations/${convoId}/messages`, {
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
      setProgressStep(0);
      abortRef.current = null;
    }
  };

  const handleSend = () => {
    if (!input.trim() && pendingAttachments.length === 0) return;
    const text = input.trim();

    // Detect publish/deploy intent → open the publish dialog directly
    // instead of asking the AI for instructions.
    if (text && pendingAttachments.length === 0 && isPublishIntent(text)) {
      const html = latestAssistantHtml();
      if (html) {
        setPublishCode(html);
        setPublishOpen(true);
        setInput("");
        return;
      }
      // No website yet — let the AI handle it normally so it can build one.
    }

    if (working) {
      setQueue(q => [...q, { id: `q-${Date.now()}`, text }]);
      setInput("");
      toast({ title: "Added to queue", description: "Will run after the current task." });
      return;
    }
    sendMessage(text, pendingAttachments);
  };

  const latestAssistantHtml = (): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      const html = extractHtml(m.content);
      if (html) return html;
    }
    return null;
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
      // Abort any in-flight generation from the previous conversation so its
      // streaming chunks don't bleed into the one we're loading.
      abortRef.current?.abort();
      setMessages(msgs);
      setConversationId(id);
      setHistoryOpen(false);
      // Reset composer + queue when switching conversations so the previous
      // chat's typed-but-unsent prompt (often the URL-based project
      // description) and queued prompts don't leak into the new context.
      setInput("");
      setStreamingContent("");
      setPendingAttachments([]);
      setQueue([]);
      initialDescriptionSentRef.current = true;
      if (msgs.length === 0) {
        toast({
          title: "Empty conversation",
          description: "No messages yet — type below to start.",
        });
      } else {
        toast({ title: "Loaded conversation", description: `${msgs.length} message${msgs.length === 1 ? "" : "s"}` });
      }
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
        // Abort any in-flight generation from the prior chat first.
        abortRef.current?.abort();
        setConversationId(conv.id);
        setMessages([]);
        setQueue([]);
        // Clear the composer and any in-flight UI so the user gets a truly
        // blank slate. Without this the previous project description
        // (set from the URL ?description= param) sticks in the textarea.
        setInput("");
        setStreamingContent("");
        setPendingAttachments([]);
        initialDescriptionSentRef.current = true;
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
  const goToWeb = async () => {
    try {
      const res = await fetch("/api/published-apps", { credentials: "include" });
      if (!res.ok) throw new Error("not signed in");
      const apps: any[] = await res.json();
      // Try to match by current project (title or projectId)
      let match: any | undefined;
      if (projectName) match = apps.find(a => (a.title || "").toLowerCase() === projectName.toLowerCase());
      if (!match && apps.length > 0) match = apps[apps.length - 1]; // most recent
      if (!match) {
        toast({ title: "Nothing published yet", description: "Press the publish button after you build to put your site online.", });
        return;
      }
      const url = match.customDomain
        ? `https://${match.customDomain}`
        : `https://${match.subdomain}.afroaigroup.com`;
      window.open(url, "_blank");
    } catch {
      toast({ title: "Sign in to view your site", variant: "destructive" });
    }
  };
  const goToCode = () => setLocation("/chat-classic");

  // ---------- Publish ----------

  const openPublishFromLatest = () => {
    // Find the most recent assistant message that contains a website
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      const html = extractHtml(m.content);
      if (html) {
        setPublishCode(html);
        setPublishOpen(true);
        return;
      }
    }
    toast({
      title: "Build something first",
      description: "Ask me to create a website, then press Publish to put it online.",
    });
  };

  const openPublishFor = (content: string) => {
    const html = extractHtml(content);
    if (!html) {
      toast({
        title: "No website to publish",
        description: "This message doesn't contain a complete website yet.",
        variant: "destructive",
      });
      return;
    }
    setPublishCode(html);
    setPublishOpen(true);
  };

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

          {/* One-click Undo — restores the previous code snapshot */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Undo last change"
            title={canUndo ? "Undo last change — restore previous version" : "Nothing to undo yet"}
            className="h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
            disabled={!canUndo}
            onClick={handleUndo}
            data-testid="button-undo"
          >
            <Undo2 className="w-4 h-4" />
          </Button>

          {/* Versions panel trigger */}
          <Sheet open={versionsOpen} onOpenChange={setVersionsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Version history"
                title="Version history"
                className="h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 relative"
                data-testid="button-versions"
              >
                <Layers className="w-4 h-4" />
                {appVersionsList.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-violet-500 text-[10px] font-semibold text-white flex items-center justify-center">
                    {appVersionsList.length}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-zinc-950 border-zinc-800 text-zinc-100 w-full sm:w-96 p-0 flex flex-col">
              <SheetHeader className="px-4 py-3 border-b border-zinc-800">
                <SheetTitle className="text-zinc-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-400" />
                  Version history
                  {appVersionsList.length > 0 && (
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full font-normal">
                      {appVersionsList.length}
                    </span>
                  )}
                </SheetTitle>
              </SheetHeader>
              <div className="px-4 py-2 bg-violet-500/5 border-b border-zinc-800 text-xs text-zinc-400">
                Every time the AI generates an app, a snapshot is saved here. Only you can see these — they're tied to your account.
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {appVersionsList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
                    <Clock className="w-10 h-10 text-zinc-700" />
                    <div>
                      <div className="font-medium text-zinc-400 text-sm">No versions yet</div>
                      <div className="text-xs text-zinc-600 mt-1">Versions are saved automatically each time the AI generates a new app.</div>
                    </div>
                  </div>
                ) : (
                  appVersionsList.map((ver, idx) => {
                    const date = new Date(ver.createdAt);
                    const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
                    const isLatest = idx === 0;
                    return (
                      <div
                        key={ver.id}
                        className={`rounded-xl border p-3 space-y-2 transition-all ${isLatest ? "border-violet-500/40 bg-violet-500/5" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"}`}
                        data-testid={`card-version-${ver.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${isLatest ? "bg-violet-500" : "bg-zinc-700"}`} />
                            <span className="font-medium text-sm text-zinc-100 truncate">
                              {ver.label || `Version ${appVersionsList.length - idx}`}
                            </span>
                            {isLatest && (
                              <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                                Latest
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-zinc-500 shrink-0">{timeStr}</span>
                        </div>
                        <div className="text-xs text-zinc-500">{dateStr} · {(ver.htmlContent.length / 1024).toFixed(1)} KB</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const w = window.open("", "_blank", "noopener,noreferrer");
                              if (w) { w.document.open(); w.document.write(ver.htmlContent); w.document.close(); }
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-700 hover:border-violet-500/40 hover:text-violet-300 text-xs font-medium text-zinc-300 transition-all"
                            data-testid={`button-preview-version-${ver.id}`}
                          >
                            <Eye className="w-3 h-3" />
                            Preview
                          </button>
                          {isLatest ? (
                            <div className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 text-xs font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              Current
                            </div>
                          ) : (
                            <button
                              onClick={() => restoreVersion(ver)}
                              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-all"
                              data-testid={`button-restore-version-${ver.id}`}
                            >
                              <RotateCcw className="w-3 h-3" />
                              Restore
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
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
          <Button
            size="sm"
            className="h-9 px-3 bg-violet-600 hover:bg-violet-500 text-white gap-1.5"
            onClick={openPublishFromLatest}
            data-testid="button-publish"
          >
            <Rocket className="w-4 h-4" />
            <span className="hidden sm:inline">Publish</span>
          </Button>
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
              <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
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

        {messages.map(msg => <MessageBlock key={msg.id} msg={msg} onPublish={openPublishFor} />)}

        {working && streamingContent && (
          <div data-testid="text-streaming">
            <MarkdownText text={streamingContent} />
          </div>
        )}

        {working && (
          <ProgressSteps step={progressStep} status={workingStatus} hasStreamed={streamingContent.length > 0} />
        )}
      </div>

      {/* Queue panel */}
      {queue.length > 0 && (
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
            <Button size="icon" aria-label="Send message" className="h-9 w-9 rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:bg-zinc-800 disabled:text-zinc-500" onClick={handleSend} disabled={!input.trim() && pendingAttachments.length === 0} data-testid="button-send">
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

      <PublishDialog
        code={publishCode}
        open={publishOpen}
        onOpenChange={setPublishOpen}
      />
    </div>
  );
}

// ---------- Helpers ----------

function extractHtml(content: string): string | null {
  // Look for triple-backtick code blocks; prefer html/htm fenced
  const fenceRe = /```(\w+)?\n([\s\S]*?)```/g;
  const candidates: { lang: string; code: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(content)) !== null) {
    candidates.push({ lang: (m[1] || "").toLowerCase(), code: m[2] });
  }
  // Prefer explicit html block
  const htmlBlock = candidates.find(c => c.lang === "html" || c.lang === "htm");
  if (htmlBlock) return htmlBlock.code.trim();
  // Otherwise any block whose body looks like HTML (contains <html or <!doctype)
  const looksHtml = candidates.find(c => /<!doctype html|<html\b/i.test(c.code));
  if (looksHtml) return looksHtml.code.trim();
  // No fence: maybe the message itself is raw HTML
  if (/<!doctype html|<html\b/i.test(content)) return content.trim();
  return null;
}

function messageHasWebsite(content: string): boolean {
  return extractHtml(content) !== null;
}

const PUBLISH_INTENT_RE = /^\s*(please\s+)?(publish|deploy|go\s*live|make\s+(it|this)\s+live|put\s+(it|this)\s+(online|live|on\s+the\s+web)|launch\s+(it|this|the\s+(site|website|app))|ship\s+(it|this))\s*[!.?]*\s*$/i;
function isPublishIntent(text: string): boolean {
  return PUBLISH_INTENT_RE.test(text);
}

// ---------- Sub-components ----------

function renderInline(text: string): React.ReactNode {
  const regex = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
  const parts = text.split(regex);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} className="text-zinc-100 font-semibold">{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return <code key={i} className="px-1 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-[0.8em] font-mono text-violet-300">{p.slice(1, -1)}</code>;
    }
    return p;
  });
}

function MarkdownText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className={className ?? "text-sm text-zinc-200 leading-relaxed space-y-2"}>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```") && part.length >= 6) {
          const inner = part.slice(3, -3);
          const firstNl = inner.indexOf("\n");
          const code = firstNl > 0 ? inner.slice(firstNl + 1) : inner;
          return (
            <pre key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 overflow-x-auto text-xs font-mono text-zinc-200 whitespace-pre" data-testid={`code-block-${i}`}>
              <code>{code.replace(/\n+$/, "")}</code>
            </pre>
          );
        }
        if (!part) return null;
        return part.split(/\n{2,}/).map((para, j) => (
          <p key={`${i}-${j}`} className="whitespace-pre-wrap">{renderInline(para)}</p>
        ));
      })}
    </div>
  );
}

function MessageBlock({ msg, onPublish }: { msg: AgentMessage; onPublish?: (content: string) => void }) {
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

  const showPublish = onPublish && messageHasWebsite(msg.content);
  return (
    <div className="space-y-2" data-testid={`message-assistant-${msg.id}`}>
      {msg.actions && msg.actions.length > 0 && <ActionChipsRow actions={msg.actions} />}
      <MarkdownText text={msg.content} />
      {showPublish && (
        <div className="pt-1">
          <Button
            size="sm"
            className="h-8 px-3 bg-violet-600 hover:bg-violet-500 text-white gap-1.5"
            onClick={() => onPublish!(msg.content)}
            data-testid={`button-publish-message-${msg.id}`}
          >
            <Rocket className="w-3.5 h-3.5" />
            Publish this site
          </Button>
        </div>
      )}
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

function ProgressSteps({ step, status, hasStreamed }: { step: number; status: string; hasStreamed: boolean }) {
  const [open, setOpen] = useState(false);
  const steps = [
    { icon: Brain, label: "Thinking", desc: "Understanding your request" },
    { icon: Search, label: "Reading", desc: "Looking at the context" },
    { icon: FileEdit, label: "Drafting", desc: "Writing the first version" },
    { icon: BookOpen, label: "Polishing", desc: "Improving the wording" },
    { icon: Sparkles, label: "Writing", desc: "Sending the response to you" },
  ];
  return (
    <div className="space-y-2" data-testid="progress-steps">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 p-2 -m-2 rounded-lg hover:bg-zinc-900/60 transition-colors text-left"
        aria-expanded={open}
        data-testid="button-progress-toggle"
      >
        <div className="flex items-center gap-1.5">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={i} className="flex items-center gap-1.5">
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center transition-all duration-300 ${
                    isActive
                      ? "border border-violet-500/60 bg-violet-500/20 scale-110"
                      : isDone
                      ? "border border-emerald-500/40 bg-emerald-500/10"
                      : "border border-zinc-800 bg-zinc-900/50"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isActive
                        ? "text-violet-300 animate-pulse"
                        : isDone
                        ? "text-emerald-400"
                        : "text-zinc-600"
                    }`}
                  />
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`h-0.5 w-3 rounded-full transition-colors duration-300 ${
                      isDone ? "bg-emerald-500/50" : "bg-zinc-800"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <span className="text-sm text-violet-400 font-medium ml-1 flex-1 truncate" data-testid="text-working-status">
          {status || "Working…"}
        </span>
        {!hasStreamed && (
          <span className="flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="ml-1 pl-4 border-l border-zinc-800 space-y-2.5 py-2" data-testid="progress-dropdown">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            const stateLabel = isDone ? "Done" : isActive ? "In progress…" : "Waiting";
            const stateColor = isDone ? "text-emerald-400" : isActive ? "text-violet-300" : "text-zinc-500";
            return (
              <div key={i} className="flex items-start gap-2.5" data-testid={`progress-item-${i}`}>
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isActive
                      ? "bg-violet-500/20 border border-violet-500/50"
                      : isDone
                      ? "bg-emerald-500/15 border border-emerald-500/40"
                      : "bg-zinc-900 border border-zinc-800"
                  }`}
                >
                  <Icon
                    className={`w-3 h-3 ${
                      isActive ? "text-violet-300" : isDone ? "text-emerald-400" : "text-zinc-600"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isActive ? "text-zinc-100" : isDone ? "text-zinc-300" : "text-zinc-500"}`}>
                      {s.label}
                    </span>
                    <span className={`text-[11px] ${stateColor}`}>{stateLabel}</span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-snug">{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!hasStreamed && !open && (
        <div className="space-y-1.5 mt-1.5">
          <div className="h-2 w-full rounded bg-zinc-900 overflow-hidden">
            <div className="h-full w-1/3 bg-gradient-to-r from-violet-500/40 to-transparent animate-pulse" />
          </div>
          <div className="h-2 w-4/5 rounded bg-zinc-900 overflow-hidden">
            <div className="h-full w-1/4 bg-gradient-to-r from-violet-500/30 to-transparent animate-pulse" style={{ animationDelay: "200ms" }} />
          </div>
        </div>
      )}
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
