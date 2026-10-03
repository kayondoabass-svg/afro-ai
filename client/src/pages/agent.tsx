import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import {
  ArrowLeft, History, MessageSquarePlus, MoreVertical,
  Brain, Terminal, FileEdit, Search, BookOpen, MoreHorizontal,
  Trash2, ArrowUp, Pencil, X, Plus, ChevronDown, Square,
  Monitor, Sparkles, Globe, ListChecks, PanelRightOpen,
  Copy, Download, LogOut, Settings, Paperclip, Image as ImageIcon,
  Rocket, Undo2, Redo2, RotateCcw, Eye, Clock, CheckCircle2, Layers,
} from "lucide-react";
import { PublishDialog } from "@/pages/ai-chat";
import type { ChatSearchActivity } from "@shared/chat-search";
import { ChatSearchCard, ChatSearchToggle, parseSearchActivity } from "@/components/chat-search";
import { extractWebsiteHtml } from "@shared/html-extraction";
import { FileTreeSidebar, type ProjectFile } from "@/components/file-tree-sidebar";
import { AgentStructuredText } from "@/components/agent-structured-text";
import type { Project } from "@shared/schema";
import { FULLSTACK_SOURCE_NOTICE, isSetupBlocked } from "@/lib/fullstack-project";
import "./agent.css";

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
  role: "user" | "assistant" | "web-search";
  content: string;
  timestamp: number;
  actions?: ActionChip[];
  attachments?: Attachment[];
  searchActivity?: ChatSearchActivity;
}

interface QueuedPrompt { id: string; text: string; webSearch: boolean; mode: "chat" | "plan" | "project"; }

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

interface ProjectProposal {
  token: string;
  id: string;
  expires: number;
  changes: { file: Pick<ProjectFile, "path" | "content" | "language">; before: Pick<ProjectFile, "path" | "content" | "language"> | null }[];
}
interface ProjectToolActivity {
  tool: string; callId: string; status: "started" | "completed" | "failed";
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

function mapAgentMessages(records: any[]): AgentMessage[] {
  return records.flatMap((m: any): AgentMessage[] => {
    if (m.role === "web-search") {
      const activity = parseSearchActivity(m.content);
      return activity ? [{
        id: `db-${m.id}`, role: "web-search", content: "",
        timestamp: new Date(m.createdAt || Date.now()).getTime(), searchActivity: activity,
      }] : [];
    }
    if (m.role !== "user" && m.role !== "assistant") return [];
    let content = m.content;
    let attachments: Attachment[] | undefined;
    if (m.role === "user") {
      try {
        const parsed = JSON.parse(m.content);
        if (typeof parsed.text === "string" && Array.isArray(parsed.attachments)) {
          content = parsed.text;
          attachments = parsed.attachments;
        }
      } catch {}
    }
    return [{
      id: `db-${m.id}`, role: m.role, content,
      timestamp: new Date(m.createdAt || Date.now()).getTime(), attachments,
    }];
  });
}

// ---------- Component ----------

export default function AgentPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
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
  const projectMode = getQueryParam("projectMode");
  const [activeProjectId, setActiveProjectId] = useState<number | null>(projectIdParam ? Number(projectIdParam) : null);
  const projectMetadata = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!user && activeProjectId !== null,
    staleTime: 0,
  });
  const activeProject = projectMetadata.data?.find(project => project.id === activeProjectId);
  const metadataUnverified = activeProjectId !== null && (!projectMetadata.isSuccess || !activeProject);
  const isFullstack = activeProject?.type === "fullstack" || (!activeProject && activeProjectId === Number(projectIdParam) && projectMode === "fullstack");
  const setupBlocked = !!activeProject && isSetupBlocked(activeProject);
  const staticControlsBlocked = isFullstack || metadataUnverified || setupBlocked;
  const projectBlocked = metadataUnverified || setupBlocked;

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [queue, setQueue] = useState<QueuedPrompt[]>([]);
  const [queueOpen, setQueueOpen] = useState(true);
  const [planMode, setPlanMode] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [searchActivity, setSearchActivity] = useState<ChatSearchActivity | null>(null);
  const [working, setWorking] = useState(false);
  const [workingStatus, setWorkingStatus] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [queueDrainTrigger, setQueueDrainTrigger] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  // Cursor into appVersionsList. 0 = latest. N = N steps back into history.
  // Undo increments, Redo decrements. Reset to 0 whenever a brand-new version lands.
  const [historyCursor, setHistoryCursor] = useState(0);
  const prevVersionsLenRef = useRef(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishCode, setPublishCode] = useState("");
  const [manualProjectAgent, setProjectAgent] = useState(false);
  const projectAgent = isFullstack || manualProjectAgent;
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [toolActivity, setToolActivity] = useState<ProjectToolActivity[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [openedProjectFile, setOpenedProjectFile] = useState<ProjectFile | null>(null);
  const conversationRef = useRef<number | null>(null);
  conversationRef.current = conversationId;
  const loadSequenceRef = useRef(0);
  const { data: projectProposal, error: proposalLoadError } = useQuery<ProjectProposal | null>({
    queryKey: ["/api/conversations", conversationId, "project-proposal"],
    enabled: !!user && !!conversationId,
    queryFn: async () => {
      const response = await fetch(`/api/conversations/${conversationId}/project-proposal`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load pending project review");
      return response.json();
    },
  });

  const finishReview = async (cancel: boolean) => {
    if (!conversationId || !projectProposal || reviewBusy || working) return;
    const id = conversationId;
    setReviewBusy(true);
    try {
      const response = await fetch(`/api/conversations/${id}/project-proposal`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: projectProposal.token, cancel }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not complete review");
      qc.setQueryData(["/api/conversations", id, "project-proposal"], null);
      if (!cancel) {
        qc.invalidateQueries({ queryKey: ["/api/d1/project-files", id] });
        if (conversationRef.current === id) setOpenedProjectFile(null);
      }
      toast({ title: cancel ? "Proposal cancelled" : "Project files saved" });
    } catch (error: any) {
      toast({ title: "Project review failed", description: error.message, variant: "destructive" });
      qc.invalidateQueries({ queryKey: ["/api/conversations", id, "project-proposal"] });
      qc.invalidateQueries({ queryKey: ["/api/d1/project-files", id] });
    } finally { setReviewBusy(false); }
  };

  const abortRef = useRef<AbortController | null>(null);
  const activeRequestRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialDescriptionSentRef = useRef(false);

  useEffect(() => {
    if (!isFullstack || projectBlocked) return;
    setProjectAgent(true);
    setProjectPanelOpen(true);
    setWebSearch(false);
    setPlanMode(false);
    setPendingAttachments([]);
  }, [isFullstack, activeProjectId, projectBlocked]);

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
    if (staticControlsBlocked) return;
    setMessages(m => [
      ...m,
      {
        id: `restore-${ver.id}-${Date.now()}`,
        role: "assistant",
        content: `${t("chat.restoredContent", { label: ver.label || t("chat.versionNum", { id: ver.id }), date: new Date(ver.createdAt).toLocaleString() })}\n\n\`\`\`html\n${ver.htmlContent}\n\`\`\``,
        timestamp: Date.now(),
        actions: [{ kind: "edit", label: t("chat.actionRestored") }],
      },
    ]);
    if (!opts.silent) {
      toast({
        title: t("chat.toastVersionRestored"),
        description: t("chat.toastVersionRestoredDesc", { label: ver.label || t("chat.versionNum", { id: ver.id }) }),
      });
    }
    setVersionsOpen(false);
  };

  // Undo/Redo walk a cursor through appVersionsList. [0] is the newest snapshot.
  // historyCursor = N means "we're viewing the snapshot N steps back from latest".
  // Undo moves further into the past; Redo walks back toward the latest.
  const canUndo = appVersionsList.length > historyCursor + 1;
  const canRedo = historyCursor > 0;
  const handleUndo = () => {
    if (!canUndo) return;
    const nextCursor = historyCursor + 1;
    setHistoryCursor(nextCursor);
    restoreVersion(appVersionsList[nextCursor]);
  };
  const handleRedo = () => {
    if (!canRedo) return;
    const nextCursor = historyCursor - 1;
    setHistoryCursor(nextCursor);
    restoreVersion(appVersionsList[nextCursor]);
  };

  // Whenever a brand-new snapshot lands (length grew), the user has just
  // generated something fresh — that becomes the new "latest", so reset the
  // cursor to 0 and drop any stale redo stack.
  useEffect(() => {
    const len = appVersionsList.length;
    if (len > prevVersionsLenRef.current) setHistoryCursor(0);
    prevVersionsLenRef.current = len;
  }, [appVersionsList.length]);

  // Lazily create a conversation. Called on mount AND on first send (retry).
  const ensureConversation = async (): Promise<number | null> => {
    if (projectBlocked) return null;
    if (conversationId) return conversationId;
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectName ? t("chat.sessionTitle", { name: projectName }) : t("chat.agentSession"),
          projectId: activeProjectId ?? undefined,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        toast({
          title: t("chat.toastCouldntStart"),
          description: errBody?.slice(0, 200) || t("chat.errServerReturned", { status: res.status }),
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
        title: t("chat.toastCouldntStart"),
        description: e?.message || t("chat.errNetwork"),
        variant: "destructive",
      });
      return null;
    }
  };

  // On mount: if this project already has a conversation, RESUME the latest one
  // (don't start over and don't pre-fill the original description). Only create
  // a fresh conversation when nothing exists yet.
  const resumedExistingRef = useRef(false);
  const initialProjectLoadStartedRef = useRef(false);
  useEffect(() => {
    if (projectIdParam && projectBlocked) return;
    if (initialProjectLoadStartedRef.current) return;
    initialProjectLoadStartedRef.current = true;
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
                await loadConversation(latest.id, pid);
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
  }, [projectIdParam, projectBlocked]);

  // Pre-fill (don't auto-send) the initial description from URL so the user
  // can review/edit it before pressing Send. Skipped when an existing
  // conversation was resumed — the user is continuing, not starting over.
  useEffect(() => {
    if (isFullstack || metadataUnverified) return;
    if (initialDescriptionSentRef.current) return;
    if (resumedExistingRef.current) return;
    if (initialDescription && initialDescription.trim().length > 0) {
      initialDescriptionSentRef.current = true;
      setInput(initialDescription.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDescription, isFullstack, metadataUnverified]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingContent, working]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const syncHeight = () => {
      const el = shellRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top - viewport.offsetTop;
      el.style.setProperty("--agent-visual-height", `${Math.max(160, viewport.height - Math.max(0, top))}px`);
    };
    syncHeight();
    viewport.addEventListener("resize", syncHeight);
    viewport.addEventListener("scroll", syncHeight);
    return () => {
      viewport.removeEventListener("resize", syncHeight);
      viewport.removeEventListener("scroll", syncHeight);
    };
  }, []);

  useEffect(() => {
    if (queueDrainTrigger === 0 || working || queue.length === 0) return;
    const next = queue[0];
    setQueue(q => q.slice(1));
    sendMessage(next.text, [], next.webSearch, next.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueDrainTrigger, working]);

  // ---------- Send message ----------

  const sendMessage = async (text: string, attachments: Attachment[] = [], search = webSearch, mode: "chat" | "plan" | "project" = projectAgent ? "project" : planMode ? "plan" : "chat") => {
    if (projectBlocked) {
      toast({ title: "Project is not ready", description: setupBlocked ? "Return to the dashboard and use Retry setup on this project." : "Verify project metadata before sending. Retry the project check.", variant: "destructive" });
      return;
    }
    if (isFullstack) mode = "project";
    if ((!text.trim() && attachments.length === 0) || working) return;
    if (mode === "project" && attachments.length) {
      toast({ title: "Project agent accepts text only", variant: "destructive" });
      return;
    }

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
    setWorkingStatus(t("chat.statusThinking"));
    setSearchActivity(null);
    setStreamingContent("");
    setToolActivity([]);

    const ctrl = new AbortController();
    const requestId = ++activeRequestRef.current;
    abortRef.current = ctrl;

    let assistantText = "";
    let serverError: string | null = null;
    let currentSearchActivity: ChatSearchActivity | null = null;

    const handlePayload = (payload: string) => {
      if (requestId !== activeRequestRef.current || ctrl.signal.aborted) return;
      if (!payload || payload === "[DONE]") return;
      let evt: any;
      try { evt = JSON.parse(payload); }
      catch { serverError = "Invalid response from the server"; return; }
      if (evt?.type === "project-tool") {
        setToolActivity(list => [...list.filter(a => a.callId !== evt.callId), evt].slice(-10));
        return;
      }
      if (evt?.type === "project-proposal") {
        qc.setQueryData(["/api/conversations", convoId, "project-proposal"], evt.proposal);
        setProjectPanelOpen(true);
        return;
      }
      const activity = parseSearchActivity(evt);
      if (activity) { currentSearchActivity = activity; setSearchActivity(activity); return; }
      if (evt && evt.type === "error") { serverError = evt.message || t("chat.toastAgentError"); return; }
      if (evt && typeof evt.error === "string") { serverError = evt.error; return; }
      if (evt?.type === "status" && typeof evt.message === "string") {
        setWorkingStatus(evt.message);
        return;
      }
      if (evt && evt.type === "version-saved") {
        // Server tells us whether a snapshot was saved. Refetch immediately so
        // Undo lights up without waiting for the 3s panel poll.
        if (evt.saved) refetchVersions();
        return;
      }
      if (evt?.done) return;
      if (typeof evt === "string") assistantText += evt;
      else if (evt && (evt.type === "text" || evt.type === "chunk" || evt.type === "delta")) assistantText += evt.content || evt.text || evt.delta || "";
      else if (evt && typeof evt.content === "string") assistantText += evt.content;
      else if (evt && typeof evt.text === "string") assistantText += evt.text;
      else if (evt && typeof evt.delta === "string") assistantText += evt.delta;
      setStreamingContent(assistantText);
      if (assistantText.length > 0) setWorkingStatus(t("chat.statusWriting"));
    };

    try {
      const body: any = { content: mode === "plan" ? `[PLAN MODE] ${text}` : text, webSearch: mode === "chat" ? search : false };
      if (mode === "project") body.projectAgent = true;
      if (attachments.length > 0) body.attachments = attachments;

      const res = await fetch(`/api/conversations/${convoId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const errorText = await res.text().catch(() => "");
        let detail = errorText;
        try { detail = JSON.parse(errorText).message || JSON.parse(errorText).error || errorText; } catch {}
        throw new Error(detail.slice(0, 200) || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) { buffer += decoder.decode(); break; }
        if (ctrl.signal.aborted || requestId !== activeRequestRef.current) return;
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
      if (ctrl.signal.aborted || requestId !== activeRequestRef.current) return;

      // Reload authoritative history: the server persists the web-search role
      // separately and the model's complete answer (which may differ from chunks).
      let reloaded = false;
      try {
        const historyRes = await fetch(`/api/conversations/${convoId}`, { credentials: "include", signal: ctrl.signal });
        if (historyRes.ok) {
          const history = await historyRes.json();
          if (Array.isArray(history.messages) && requestId === activeRequestRef.current && !ctrl.signal.aborted) {
            setMessages(mapAgentMessages(history.messages));
            reloaded = true;
          }
        }
      } catch (historyError) {
        if (ctrl.signal.aborted) return;
      }
      if (!reloaded && !ctrl.signal.aborted && requestId === activeRequestRef.current) {
        setMessages(m => [...m, ...(currentSearchActivity ? [{ id: `s-${Date.now()}`, role: "web-search" as const, content: "", timestamp: Date.now(), searchActivity: currentSearchActivity }] : []), {
          id: `a-${Date.now()}`, role: "assistant", content: assistantText || t("chat.noResponse"), timestamp: Date.now(),
        }]);
      }
      setQueueDrainTrigger(t => t + 1);
    } catch (e: any) {
      if (e.name !== "AbortError" && !ctrl.signal.aborted && requestId === activeRequestRef.current) {
        toast({ title: t("chat.toastAgentError"), description: e.message, variant: "destructive" });
      }
    } finally {
      if (requestId === activeRequestRef.current) {
        setStreamingContent("");
        setSearchActivity(null);
        setWorking(false);
        setWorkingStatus("");
        abortRef.current = null;
      }
    }
  };

  const handleSend = () => {
    if (projectBlocked) return;
    if (!input.trim() && pendingAttachments.length === 0) return;
    const text = input.trim();
    if (projectAgent && pendingAttachments.length) {
      toast({ title: "Project agent accepts text only", description: "Remove attachments or turn off Project agent.", variant: "destructive" });
      return;
    }

    // Detect publish/deploy intent → open the publish dialog directly
    // instead of asking the AI for instructions.
    if (!projectAgent && text && pendingAttachments.length === 0 && isPublishIntent(text)) {
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
      if (pendingAttachments.length) {
        toast({ title: "Wait to send attachments", description: "Attachments cannot be queued. Stop or wait for the current reply.", variant: "destructive" });
        return;
      }
      setQueue(q => [...q, { id: `q-${Date.now()}`, text, webSearch, mode: projectAgent ? "project" : planMode ? "plan" : "chat" }]);
      setInput("");
      toast({ title: t("chat.toastQueued"), description: t("chat.toastQueuedDesc") });
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
    ++activeRequestRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    setWorking(false);
    setWorkingStatus("");
    setStreamingContent("");
    setSearchActivity(null);
    setToolActivity([]);
  };

  // ---------- Attachments ----------

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const next: Attachment[] = [];
    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) {
        toast({ title: t("chat.toastFileTooLarge"), description: t("chat.toastFileTooLargeDesc", { name: f.name }), variant: "destructive" });
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
    sendMessage(item.text, [], item.webSearch, item.mode);
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
    const updated = window.prompt(t("chat.promptEditPrompt"), item.text);
    if (updated && updated.trim()) {
      setQueue(q => q.map(x => x.id === id ? { ...x, text: updated.trim() } : x));
    }
  };
  const deleteQueueItem = (id: string) => setQueue(q => q.filter(x => x.id !== id));
  const clearQueue = () => {
    if (queue.length === 0) return;
    if (window.confirm(t("chat.confirmClearQueue", { n: queue.length }))) setQueue([]);
  };

  // ---------- History ----------

  const loadConversation = async (id: number, knownProjectId?: number | null) => {
    const sequence = ++loadSequenceRef.current;
    try {
      const res = await fetch(`/api/conversations/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(t("chat.errFailedLoad"));
      const data = await res.json();
      if (sequence !== loadSequenceRef.current) return;
      const msgs = mapAgentMessages(data.messages || []);
      // Abort any in-flight generation from the previous conversation so its
      // streaming chunks don't bleed into the one we're loading.
      ++activeRequestRef.current;
      abortRef.current?.abort();
      abortRef.current = null;
      setWorking(false);
      setWorkingStatus("");
      setSearchActivity(null);
      setToolActivity([]);
      setOpenedProjectFile(null);
      const loadedProjectId = data.projectId ?? data.conversation?.projectId ?? knownProjectId ?? conversations.find(c => c.id === id)?.projectId ?? null;
      setActiveProjectId(loadedProjectId);
      setProjectAgent(projectMetadata.data?.find(p => p.id === loadedProjectId)?.type === "fullstack");
      setWebSearch(false);
      setPlanMode(false);
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
          title: t("chat.toastEmptyConv"),
          description: t("chat.toastEmptyConvDesc"),
        });
      } else {
        toast({ title: t("chat.toastLoadedConv"), description: t("chat.toastLoadedConvDesc", { n: msgs.length }) });
      }
    } catch (e: any) {
      toast({ title: t("chat.toastErrLoadConv"), description: e.message, variant: "destructive" });
    }
  };

  const startNewChat = async () => {
    ++loadSequenceRef.current;
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t("chat.agentNewChat") }),
        credentials: "include",
      });
      if (res.ok) {
        const conv = await res.json();
        // Abort any in-flight generation from the prior chat first.
        ++activeRequestRef.current;
        abortRef.current?.abort();
        abortRef.current = null;
        setWorking(false);
        setWorkingStatus("");
        setSearchActivity(null);
        setToolActivity([]);
        setOpenedProjectFile(null);
        setActiveProjectId(null);
        setProjectPanelOpen(false);
        setProjectAgent(false);
        setWebSearch(false);
        setPlanMode(false);
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
        toast({ title: t("chat.toastStartedNew") });
      }
    } catch {}
  };

  // ---------- Top menu actions ----------

  const copyShareLink = () => {
    const url = `${window.location.origin}/chat${activeProjectId ? `?projectId=${activeProjectId}${isFullstack ? "&projectMode=fullstack" : ""}` : ""}`;
    if (!navigator.clipboard?.writeText) {
      toast({ title: "Copy unavailable", description: "Your browser does not support copying links here.", variant: "destructive" });
      return;
    }
    navigator.clipboard.writeText(url).then(() => toast({ title: t("chat.toastLinkCopied") })).catch(() => toast({ title: "Could not copy link", variant: "destructive" }));
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
    if (staticControlsBlocked) return;
    if (activeProjectId) setLocation(`/preview/${activeProjectId}`);
    else setLocation("/dashboard");
  };
  const goToShell = () => setLocation("/shell");
  const goToTasks = () => setLocation("/dashboard");
  const goToWeb = async () => {
    if (staticControlsBlocked) return;
    try {
      const res = await fetch("/api/published-apps", { credentials: "include" });
      if (!res.ok) throw new Error("not signed in");
      const apps: any[] = await res.json();
      // Try to match by current project (title or projectId)
      let match: any | undefined;
      if (projectName) match = apps.find(a => (a.title || "").toLowerCase() === projectName.toLowerCase());
      if (!match) {
        toast({ title: t("chat.toastNothingPublished"), description: t("chat.toastNothingPublishedDesc"), });
        return;
      }
      const url = match.customDomain
        ? `https://${match.customDomain}`
        : `https://${match.subdomain}.afroaigroup.com`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: t("chat.toastSignInView"), variant: "destructive" });
    }
  };
  const goToCode = () => {
    if (staticControlsBlocked) {
      setProjectPanelOpen(true);
      return;
    }
    setLocation("/chat-classic");
  };
  const toggleProjectAgent = () => {
    if (isFullstack) {
      setProjectPanelOpen(true);
      return;
    }
    setProjectAgent(value => !value);
    setWebSearch(false);
    setPlanMode(false);
    setPendingAttachments([]);
  };

  // ---------- Publish ----------

  const openPublishFromLatest = () => {
    if (staticControlsBlocked) {
      toast({ title: "Static publishing unavailable", description: isFullstack ? FULLSTACK_SOURCE_NOTICE : "Verify project metadata before publishing.", variant: "destructive" });
      return;
    }
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
      title: t("chat.toastBuildFirst"),
      description: t("chat.toastBuildFirstDesc"),
    });
  };

  const openPublishFor = (content: string) => {
    if (staticControlsBlocked) return;
    const html = extractHtml(content);
    if (!html) {
      toast({
        title: t("chat.toastNoWebsite"),
        description: t("chat.toastNoWebsiteDesc"),
        variant: "destructive",
      });
      return;
    }
    setPublishCode(html);
    setPublishOpen(true);
  };

  // ---------- Render ----------

  return (
    <div ref={shellRef} className="agent-shell flex flex-col bg-zinc-950 text-zinc-100" data-testid="agent-shell">
      <input ref={fileInputRef} type="file" accept="image/*,.pdf,.txt,.md,.csv,.json" multiple className="hidden" onChange={handleFileChange} data-testid="input-file" />

      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800/80 flex-shrink-0 min-w-0">
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" aria-label={t("chat.goBack")} title={t("chat.goBack")} className="agent-tooltip h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" data-hint="Back to dashboard" onClick={() => setLocation("/dashboard")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("chat.conversationHistory")} title={t("chat.conversationHistory")} data-hint="Conversation history" className="agent-tooltip hidden md:inline-flex h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" data-testid="button-history">
                <History className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-zinc-950 border-zinc-800 text-zinc-100 w-80">
              <SheetHeader>
                <SheetTitle className="text-zinc-100">{t("chat.conversationHistory")}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-1 overflow-y-auto max-h-[calc(100vh-100px)]">
                {conversations.length === 0 && (
                  <p className="text-sm text-zinc-500 px-2 py-3">{t("chat.agentNoConversations")}</p>
                )}
                {conversations.map(c => (
                  <button
                    key={c.id}
                    onClick={() => loadConversation(c.id, c.projectId)}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-900 transition-colors ${conversationId === c.id ? "bg-zinc-900 border border-violet-500/30" : ""}`}
                    data-testid={`button-history-conv-${c.id}`}
                  >
                    <p className="text-sm text-zinc-200 truncate">{c.title || t("chat.untitled")}</p>
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
            aria-label={t("chat.undoLabel")}
            title={canUndo ? t("chat.undoTitle") : t("chat.undoNothing")}
            data-hint={canUndo ? "Undo version" : "No earlier version"}
            className="agent-tooltip hidden md:inline-flex h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
            disabled={!canUndo || staticControlsBlocked}
            onClick={handleUndo}
            data-testid="button-undo"
          >
            <Undo2 className="w-4 h-4" />
          </Button>

          {/* Redo — re-applies a version you just undid */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("chat.redoLabel")}
            title={canRedo ? t("chat.redoTitle") : t("chat.redoNothing")}
            data-hint={canRedo ? "Redo version" : "No version to redo"}
            className="agent-tooltip hidden md:inline-flex h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
            disabled={!canRedo || staticControlsBlocked}
            onClick={handleRedo}
            data-testid="button-redo"
          >
            <Redo2 className="w-4 h-4" />
          </Button>

          {/* Versions panel trigger */}
          <Sheet open={versionsOpen} onOpenChange={setVersionsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("chat.versionHistory")}
                title={t("chat.versionHistory")}
                data-hint="Version history"
                className="agent-tooltip hidden md:inline-flex h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 relative"
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
                  {t("chat.versionHistory")}
                  {appVersionsList.length > 0 && (
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full font-normal">
                      {appVersionsList.length}
                    </span>
                  )}
                </SheetTitle>
              </SheetHeader>
              <div className="px-4 py-2 bg-violet-500/5 border-b border-zinc-800 text-xs text-zinc-400">
                {t("chat.versionsNote")}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {appVersionsList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
                    <Clock className="w-10 h-10 text-zinc-700" />
                    <div>
                      <div className="font-medium text-zinc-400 text-sm">{t("chat.noVersions")}</div>
                      <div className="text-xs text-zinc-600 mt-1">{t("chat.noVersionsDesc")}</div>
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
                              {ver.label || t("chat.version", { n: appVersionsList.length - idx })}
                            </span>
                            {isLatest && (
                              <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                                {t("chat.latest")}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-zinc-500 shrink-0">{timeStr}</span>
                        </div>
                        <div className="text-xs text-zinc-500">{dateStr} · {(ver.htmlContent.length / 1024).toFixed(1)} KB</div>
                        <div className="flex gap-2">
                          <button
                            disabled={staticControlsBlocked}
                            onClick={() => {
                              if (staticControlsBlocked) return;
                              const w = window.open("", "_blank", "noopener,noreferrer");
                              if (w) { w.document.open(); w.document.write(extractWebsiteHtml(ver.htmlContent) ?? ver.htmlContent); w.document.close(); }
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-700 hover:border-violet-500/40 hover:text-violet-300 text-xs font-medium text-zinc-300 transition-all"
                            data-testid={`button-preview-version-${ver.id}`}
                          >
                            <Eye className="w-3 h-3" />
                            {t("chat.versionPreview")}
                          </button>
                          {isLatest ? (
                            <div className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 text-xs font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              {t("chat.current")}
                            </div>
                          ) : (
                            <button
                              disabled={staticControlsBlocked}
                              onClick={() => restoreVersion(ver)}
                              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-all"
                              data-testid={`button-restore-version-${ver.id}`}
                            >
                              <RotateCcw className="w-3 h-3" />
                              {t("chat.restore")}
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

        <div className="flex items-center gap-2 min-w-0 md:flex-1 md:justify-center">
          <Button
            variant={projectAgent ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={projectAgent}
            onClick={toggleProjectAgent}
            title={isFullstack ? "Full-stack projects use project tools. Review changes before saving." : "Opt in to review-only project tools. No files are saved until you apply."}
            data-testid="button-project-agent"
            className="hidden md:inline-flex shrink-0"
          >Project agent {projectAgent ? "on" : "off"}</Button>
          <Sheet open={projectPanelOpen} onOpenChange={setProjectPanelOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="hidden md:inline-flex" data-testid="button-project-files">Files {projectProposal ? "• Review" : ""}</Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-zinc-950 text-zinc-100 border-zinc-800 w-full sm:w-[560px] flex flex-col overflow-hidden">
              <SheetHeader><SheetTitle className="text-zinc-100">Project files &amp; review</SheetTitle></SheetHeader>
              {isFullstack && !projectBlocked && <p className="rounded-md border border-amber-400/25 bg-amber-400/5 p-3 text-xs text-amber-200">{FULLSTACK_SOURCE_NOTICE}</p>}
              <p className="text-xs text-zinc-400">Project agent only reads and proposes text changes. It never runs commands or saves automatically.</p>
              {proposalLoadError && <p role="alert" className="text-xs text-red-400">{proposalLoadError.message}</p>}
              <div className="min-h-0 flex-1 overflow-y-auto space-y-4">
                <div className="h-64 border border-zinc-800 rounded-md overflow-hidden">
                  <FileTreeSidebar conversationId={conversationId} openedFileId={openedProjectFile?.id ?? null}
                    onFileOpen={setOpenedProjectFile} onClose={() => setProjectPanelOpen(false)} />
                </div>
                {openedProjectFile && <div className="text-xs">
                  <strong>{openedProjectFile.path}</strong>
                  <pre className="whitespace-pre-wrap break-all max-h-40 overflow-auto border border-zinc-800 p-2">{openedProjectFile.encoding === "base64" ? "Binary asset (not readable by project agent)" : openedProjectFile.content}</pre>
                </div>}
                {toolActivity.length > 0 && <section aria-label="Project tool activity" className="text-xs space-y-1">
                  <strong>Tool activity</strong>
                  {toolActivity.map(item => <div key={item.callId}>{item.tool}: {item.status}</div>)}
                </section>}
                {projectProposal && <section aria-label="Pending project proposal" className="space-y-3">
                  <strong>Review changes before saving</strong>
                  <p className="text-xs text-zinc-400">Expires {new Date(projectProposal.expires).toLocaleString()}. A changed file will block the entire apply.</p>
                  {projectProposal.changes.map(change => <div key={change.file.path} className="border border-zinc-800 rounded p-2 text-xs">
                    <strong>{change.file.path} ({change.before ? "update" : "new"})</strong>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 min-w-0">
                      <div><span>Before</span><pre className="whitespace-pre-wrap break-all overflow-auto max-h-64 bg-zinc-900 p-2">{change.before?.content ?? "(new file)"}</pre></div>
                      <div><span>After</span><pre className="whitespace-pre-wrap break-all overflow-auto max-h-64 bg-zinc-900 p-2">{change.file.content}</pre></div>
                    </div>
                  </div>)}
                  <div className="flex gap-2">
                    <Button disabled={reviewBusy || working} onClick={() => finishReview(false)} data-testid="button-apply-proposal">Apply changes</Button>
                    <Button variant="outline" disabled={reviewBusy || working} onClick={() => finishReview(true)} data-testid="button-cancel-proposal">Cancel proposal</Button>
                  </div>
                </section>}
              </div>
            </SheetContent>
          </Sheet>
          <div className="hidden sm:flex w-5 h-5 rounded bg-violet-500/20 items-center justify-center shrink-0">
            <Sparkles className="w-3 h-3 text-violet-400" />
          </div>
          <span className="font-semibold text-sm truncate">{projectName || t("chat.agent")}</span>
          {projectProposal && <span className="shrink-0 text-[10px] rounded bg-amber-400/15 px-1.5 py-1 text-amber-300">Review pending</span>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            className="hidden md:inline-flex h-9 px-3 bg-violet-600 hover:bg-violet-500 text-white gap-1.5"
            onClick={openPublishFromLatest}
            disabled={staticControlsBlocked}
            title={isFullstack ? "Source-only: deploy the Workers backend and provision D1 separately. Static Publish is unavailable." : undefined}
            data-testid="button-publish"
          >
            <Rocket className="w-4 h-4" />
            <span className="hidden sm:inline">{t("chat.publish")}</span>
          </Button>
          <Button variant="ghost" size="icon" aria-label={t("chat.agentNewChat")} title={t("chat.agentNewChat")} data-hint="New chat" className="agent-tooltip hidden md:inline-flex h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" data-testid="button-new-chat" onClick={startNewChat}>
            <MessageSquarePlus className="w-4 h-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("chat.moreOptions")} title={t("chat.moreOptions")} data-hint="More options" className="agent-tooltip hidden md:inline-flex h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" data-testid="button-menu">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-100">
              <DropdownMenuItem onClick={copyShareLink} data-testid="menu-copy-link">
                <Copy className="w-4 h-4 mr-2" /> {t("chat.copyLink")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportChat} data-testid="menu-export">
                <Download className="w-4 h-4 mr-2" /> {t("chat.exportChat")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem onClick={() => setLocation("/settings")} data-testid="menu-settings">
                <Settings className="w-4 h-4 mr-2" /> {t("chat.settings")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
                <LogOut className="w-4 h-4 mr-2" /> {t("chat.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Open chat menu" className="md:hidden h-10 gap-1 px-2 text-amber-200" data-testid="button-mobile-menu">
                <MoreVertical className="h-4 w-4" /> Menu
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(88vw,340px)] bg-zinc-950 border-zinc-800 text-zinc-100 overflow-y-auto">
              <SheetHeader><SheetTitle className="text-zinc-100">Chat menu</SheetTitle></SheetHeader>
              <div className="mt-6 grid gap-2">
                <Button variant={projectAgent ? "secondary" : "ghost"} aria-pressed={projectAgent} onClick={toggleProjectAgent} className="h-11 w-full justify-start" data-testid="button-mobile-project-agent">
                  Project agent: {projectAgent ? "on" : "off"} · review before saving
                </Button>
                {([
                  ["New chat", () => startNewChat()],
                  ["Conversation history", () => setHistoryOpen(true)],
                  ["Version history", () => setVersionsOpen(true)],
                  ["Undo previous version", handleUndo],
                  ["Redo version", handleRedo],
                  ["Project files & review", () => setProjectPanelOpen(true)],
                  ["Publish site", openPublishFromLatest],
                  ["Classic builder", goToCode],
                  ["Open published site", goToWeb],
                  ["Shell", goToShell],
                  ["Dashboard", goToTasks],
                  ["Copy project link", copyShareLink],
                  ["Export chat", exportChat],
                  ["Settings", () => setLocation("/settings")],
                  ["Sign out", handleLogout],
                ] as [string, () => void][]).map(([label, action]) => (
                  <Button key={label} variant="ghost" className="h-11 w-full justify-start text-zinc-200 hover:bg-zinc-800" disabled={(label === "Undo previous version" && !canUndo) || (label === "Redo version" && !canRedo) || (staticControlsBlocked && ["Undo previous version", "Redo version", "Publish site", "Open published site"].includes(label))} onClick={() => { setMobileMenuOpen(false); action(); }}>{label}</Button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {isFullstack && !projectBlocked && <div className="shrink-0 border-b border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs text-amber-200" role="note" data-testid="fullstack-source-notice">
        <strong className="block mb-1">Full-stack project · source only</strong>
        {FULLSTACK_SOURCE_NOTICE}
      </div>}
      {projectBlocked && <div className="shrink-0 border-b border-violet-500/25 bg-violet-500/5 px-4 py-3 text-xs text-zinc-300" role="status">
        {setupBlocked ? activeProject?.status === "initializing" ? "Starter setup is still initializing. Return to the dashboard to check progress." : "Starter setup failed. Return to the dashboard and use Retry setup on this project." : projectMetadata.isError ? "Could not verify project metadata. Sending, Preview and Publish are blocked until verified." : projectMetadata.isSuccess ? "Project not found. Return to the dashboard or retry the project check." : "Checking project metadata…"}
        {(projectMetadata.isError || projectMetadata.isSuccess) && !setupBlocked && <Button size="sm" variant="ghost" className="ml-2" onClick={() => projectMetadata.refetch()}>Retry project check</Button>}
        {setupBlocked && <Button size="sm" variant="ghost" className="ml-2" onClick={() => setLocation("/dashboard")}>Back to dashboard</Button>}
      </div>}

      {/* Messages */}
      <div ref={scrollRef} className="agent-scroll flex-1 overflow-y-auto px-4 py-4 space-y-5" data-testid="agent-messages">
        {messages.length === 0 && !working && (
          <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500 px-6">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-violet-400" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-200 mb-1">{t("chat.greeting", { name: user?.firstName || t("chat.there") })}</h2>
            <p className="text-sm mb-4">{t("chat.emptyPrompt")}</p>
            <div className="grid gap-2 w-full max-w-sm">
              {[
                t("chat.agentSuggestion1"),
                t("chat.agentSuggestion2"),
                t("chat.agentSuggestion3"),
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

        {messages.map(msg => msg.role === "web-search" ? (
          msg.searchActivity && <ChatSearchCard key={msg.id} activity={msg.searchActivity} />
        ) : <MessageBlock key={msg.id} msg={msg} onPublish={staticControlsBlocked ? undefined : openPublishFor} />)}

        {working && searchActivity && <ChatSearchCard activity={searchActivity} />}
        {working && streamingContent && (
          <div data-testid="text-streaming">
            <AgentStructuredText text={streamingContent} renderText={(value) => <MarkdownText text={value} />} />
          </div>
        )}

        {toolActivity.length > 0 && (
          <section aria-label="Project activity" className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs">
            <button type="button" aria-expanded={activityExpanded} onClick={() => setActivityExpanded(v => !v)} className="flex w-full items-center justify-between text-left font-medium text-amber-200">
              <span>Project activity · {toolActivity.length} {toolActivity.length === 1 ? "operation" : "operations"}</span>
              <span>{activityExpanded ? "Show less" : "Show details"}</span>
            </button>
            {activityExpanded && <ul className="mt-2 space-y-1 text-zinc-300">
              {toolActivity.map(item => <li key={item.callId} className="flex justify-between gap-2"><span className="truncate">{item.tool.replace(/_/g, " ")}</span><span className="shrink-0">{item.status}</span></li>)}
            </ul>}
            <span className="sr-only">{toolActivity.map(item => `${item.tool}: ${item.status}`).join(", ")}</span>
          </section>
        )}
        {working && (
          <div className="text-sm text-violet-400" role="status" data-testid="text-working-status">
            {workingStatus || t("chat.working")}
          </div>
        )}
      </div>

      {/* Queue panel */}
      {queue.length > 0 && (
        <div className="border-t border-zinc-800/80 bg-zinc-950 flex-shrink-0">
          <div
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-zinc-300"
          >
            <button type="button" onClick={() => setQueueOpen(!queueOpen)} aria-expanded={queueOpen} className="flex items-center gap-2 hover:text-amber-200" data-testid="button-toggle-queue">
              <span>{t("chat.queue")}</span>
              {queue.length > 0 && <span className="text-xs text-zinc-500">({queue.length})</span>}
              <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${queueOpen ? "" : "-rotate-90"}`} />
            </button>
            <div className="flex items-center gap-1">
              {queue.length > 0 && (
                <Button variant="ghost" size="icon" aria-label={t("chat.clearQueue")} title={t("chat.clearQueue")} data-hint="Clear queued messages" className="agent-tooltip h-7 w-7 text-zinc-500 hover:text-red-400 hover:bg-zinc-800" onClick={clearQueue} data-testid="button-clear-queue">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {queueOpen && queue.length > 0 && (
            <div className="px-3 pb-3 space-y-2 max-h-48 overflow-y-auto">
              {queue.map((item, idx) => (
                <Card key={item.id} className="bg-zinc-900/60 border-zinc-800 rounded-xl" data-testid={`card-queue-${item.id}`}>
                  <CardContent className="p-3 flex items-start gap-2">
                    <p className="flex-1 text-sm text-zinc-300 leading-snug line-clamp-3 min-w-0">{item.text}</p>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => runQueueItem(item.id)} disabled={working} data-testid={`button-queue-next-${item.id}`}>{t("chat.next")}</Button>
                      <Button variant="ghost" size="icon" aria-label={t("chat.moveUp")} title={t("chat.moveUp")} data-hint="Move up" className="agent-tooltip h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => moveQueueItem(item.id, -1)} disabled={idx === 0} data-testid={`button-queue-up-${item.id}`}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={t("chat.editPrompt")} title={t("chat.editPrompt")} data-hint="Edit queued message" className="agent-tooltip h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => editQueueItem(item.id)} data-testid={`button-queue-edit-${item.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={t("chat.removeFromQueue")} title={t("chat.removeFromQueue")} data-hint="Remove from queue" className="agent-tooltip h-7 w-7 text-zinc-400 hover:text-red-400 hover:bg-zinc-800" onClick={() => deleteQueueItem(item.id)} data-testid={`button-queue-delete-${item.id}`}>
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
              <button onClick={() => removePendingAttachment(idx)} aria-label={t("chat.removeAttachment")} title={t("chat.removeAttachment")} data-hint="Remove attachment" className="agent-tooltip text-zinc-500 hover:text-red-400">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="agent-composer border-t border-zinc-800/80 bg-zinc-950 px-3 py-3 flex-shrink-0 min-w-0">
        {projectAgent && <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-amber-400/25 bg-amber-400/5 px-2.5 py-1.5 text-xs text-amber-200">
          <span>Project agent · text only · review before saving</span>
          <button type="button" onClick={toggleProjectAgent} className="shrink-0 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">{isFullstack ? "Open files" : "Turn off"}</button>
        </div>}
        <Textarea
          disabled={projectBlocked}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.metaKey) { e.preventDefault(); handleSend(); } }}
          placeholder={t("chat.inputPlaceholder")}
          aria-label="Message to Afro AI"
          className="bg-transparent border-0 text-sm text-zinc-200 placeholder:text-zinc-500 resize-none min-h-[40px] max-h-32 px-1 py-1 focus-visible:ring-0 focus-visible:ring-offset-0"
          rows={1}
          data-testid="input-prompt"
        />

        <div className="flex items-end justify-between gap-2 mt-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" aria-label={t("chat.attachFile")} title={t("chat.attachFile")} onClick={handleAttachClick} disabled={projectAgent} className="agent-tooltip h-9 px-2 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800" data-hint="Attach file" data-testid="button-attach">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">Attach</span>
            </Button>

            <button type="button" disabled={isFullstack || projectBlocked} aria-label="Plan before building" aria-pressed={planMode} onClick={() => { setPlanMode(v => !v); setWebSearch(false); setProjectAgent(false); }} className={`agent-control rounded-md border px-2.5 h-9 text-xs font-medium ${planMode ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-zinc-700 text-zinc-300"}`} data-testid="checkbox-plan-mode">
              Plan {planMode ? "on" : "off"}
            </button>
            {!isFullstack && <ChatSearchToggle enabled={webSearch} onChange={(enabled) => { setWebSearch(enabled); if (enabled) { setPlanMode(false); setProjectAgent(false); } }} />}
          </div>

          {working ? (
            <Button size="icon" aria-label={t("chat.stopGeneration")} title={t("chat.stopGeneration")} className="agent-tooltip h-10 w-10 shrink-0 rounded-lg bg-violet-600 hover:bg-violet-500 text-white" data-hint="Stop generation" onClick={stopAgent} data-testid="button-stop">
              <Square className="w-3.5 h-3.5 fill-white" />
            </Button>
          ) : (
            <Button size="icon" aria-label={t("chat.sendMessage")} title={t("chat.sendMessage")} className="agent-tooltip h-10 w-10 shrink-0 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:bg-zinc-800 disabled:text-zinc-500" data-hint="Send message" onClick={handleSend} disabled={projectBlocked || (!input.trim() && pendingAttachments.length === 0)} data-testid="button-send">
              <ArrowUp className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <nav aria-label="Builder navigation" className="hidden md:flex items-center justify-around px-2 py-2 border-t border-zinc-800/80 bg-zinc-950 flex-shrink-0">
        {[
          { icon: Square, key: "code", label: t("chat.nav.classic"), testid: "nav-code", action: goToCode },
          { icon: Monitor, key: "preview", label: isFullstack ? "Preview unavailable · source-only full-stack project" : activeProjectId ? t("chat.nav.preview") : "Preview (open a project first)", testid: "nav-preview", action: activeProjectId && !staticControlsBlocked ? goToProjectPreview : undefined },
          { icon: Sparkles, key: "agent", label: t("chat.agent"), active: true, testid: "nav-agent", action: undefined },
          { icon: Globe, key: "web", label: t("chat.nav.openSite"), testid: "nav-web", action: staticControlsBlocked ? undefined : goToWeb },
          { divider: true, key: "div" },
          { icon: Terminal, key: "shell", label: t("chat.nav.shell"), testid: "nav-shell", action: goToShell },
          { icon: ListChecks, key: "tasks", label: t("chat.nav.dashboard"), testid: "nav-tasks", action: goToTasks },
          { icon: PanelRightOpen, key: "panel", label: "Project files & review", testid: "nav-panel", action: () => setProjectPanelOpen(true) },
        ].map(item => (item as any).divider ? (
          <div key={item.key} className="w-px h-5 bg-zinc-800" />
        ) : (
          <button
            key={item.key}
            aria-label={(item as any).label}
            title={(item as any).label}
            data-hint={(item as any).label}
            aria-current={(item as any).active ? "page" : undefined}
            onClick={(item as any).action}
            disabled={!(item as any).action}
            data-testid={(item as any).testid}
            className={`agent-tooltip relative h-9 w-9 flex items-center justify-center rounded-md hover:bg-zinc-800 transition-colors ${(item as any).active ? "text-violet-400" : "text-zinc-400"}`}
          >
            {(item as any).icon && (() => { const I = (item as any).icon; return <I className="w-4 h-4" />; })()}
            <span className="sr-only">{(item as any).label}</span>
            {(item as any).active && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-violet-400 rounded-full" />}
          </button>
        ))}
      </nav>
      <nav aria-label="Builder navigation" className="md:hidden flex items-stretch justify-around gap-1 px-2 py-2 border-t border-zinc-800/80 bg-zinc-950 shrink-0">
        <button onClick={() => setLocation("/dashboard")} className="agent-control flex-1 min-w-0 flex flex-col items-center gap-1 rounded-md py-1 text-xs text-zinc-300"><ListChecks className="w-4 h-4" />Dashboard</button>
        <button aria-current="page" className="agent-control flex-1 min-w-0 flex flex-col items-center gap-1 rounded-md py-1 text-xs text-amber-300" disabled><Sparkles className="w-4 h-4" />Builder</button>
        <button onClick={goToProjectPreview} disabled={!activeProjectId || staticControlsBlocked} title={isFullstack ? "Source only: no runtime or database provisioned" : activeProjectId ? "Preview project" : "Open a project first to preview"} className="agent-control flex-1 min-w-0 flex flex-col items-center gap-1 rounded-md py-1 text-xs text-zinc-300 disabled:opacity-40"><Monitor className="w-4 h-4" />Preview</button>
        <button onClick={() => setProjectPanelOpen(true)} className="agent-control flex-1 min-w-0 flex flex-col items-center gap-1 rounded-md py-1 text-xs text-zinc-300"><FileEdit className="w-4 h-4" />{projectProposal ? "Review" : "Files"}</button>
      </nav>

      <PublishDialog
        code={publishCode}
        open={publishOpen && !staticControlsBlocked}
        onOpenChange={setPublishOpen}
      />
    </div>
  );
}

// ---------- Helpers ----------

function extractHtml(content: string): string | null {
  return extractWebsiteHtml(content);
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
  const { t } = useLanguage();
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
        <span className="text-[10px] text-zinc-500 px-1">{timeAgo(msg.timestamp, t)}</span>
      </div>
    );
  }

  const showPublish = onPublish && messageHasWebsite(msg.content);
  return (
    <div className="space-y-2" data-testid={`message-assistant-${msg.id}`}>
      {msg.actions && msg.actions.length > 0 && <ActionChipsRow actions={msg.actions} />}
      <AgentStructuredText text={msg.content} renderText={(value) => <MarkdownText text={value} />} />
      {showPublish && (
        <div className="pt-1">
          <Button
            size="sm"
            className="h-8 px-3 bg-violet-600 hover:bg-violet-500 text-white gap-1.5"
            onClick={() => onPublish!(msg.content)}
            data-testid={`button-publish-message-${msg.id}`}
          >
            <Rocket className="w-3.5 h-3.5" />
            {t("chat.publishThisSite")}
          </Button>
        </div>
      )}
    </div>
  );
}

function ActionChipsRow({ actions }: { actions: ActionChip[] }) {
  const { t } = useLanguage();
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
      <span className="ml-1">{t("chat.actionsCount", { count: actions.length })}</span>
    </div>
  );
}

function ProgressSteps({ step, status, hasStreamed }: { step: number; status: string; hasStreamed: boolean }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const steps = [
    { icon: Brain, label: t("chat.stepThinking"), desc: t("chat.stepThinkingDesc") },
    { icon: Search, label: t("chat.stepReading"), desc: t("chat.stepReadingDesc") },
    { icon: FileEdit, label: t("chat.stepDrafting"), desc: t("chat.stepDraftingDesc") },
    { icon: BookOpen, label: t("chat.stepPolishing"), desc: t("chat.stepPolishingDesc") },
    { icon: Sparkles, label: t("chat.stepWriting"), desc: t("chat.stepWritingDesc") },
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
          {status || t("chat.working")}
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
            const stateLabel = isDone ? t("chat.stateDone") : isActive ? t("chat.stateInProgress") : t("chat.stateWaiting");
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

function timeAgo(ts: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return t("chat.justNow");
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return t("chat.minAgo", { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("chat.hourAgo", { n: hrs });
  return new Date(ts).toLocaleDateString();
}
