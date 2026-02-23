import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import {
  Send,
  Plus,
  Sparkles,
  MessageSquare,
  Trash2,
  Loader2,
  Eye,
  Code2,
  Download,
  X,
  Maximize2,
  Minimize2,
  PanelRightOpen,
  PanelRightClose,
  Globe,
  Check,
  AlertCircle,
  ExternalLink,
  Rocket,
  Paperclip,
  Image,
  Film,
  Monitor,
  Tablet,
  Smartphone,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Conversation, Message } from "@shared/schema";

interface Attachment {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
}

interface ParsedMessageContent {
  text: string;
  attachments?: Attachment[];
}

interface ConversationWithMessages extends Conversation {
  messages?: Message[];
}

function extractHtmlCode(text: string): string | null {
  const match = text.match(/```html\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

function extractAllCodeBlocks(text: string): string | null {
  const htmlMatch = text.match(/```html\s*\n([\s\S]*?)```/);
  if (htmlMatch) return htmlMatch[1].trim();
  const genericMatch = text.match(/```\s*\n([\s\S]*?)```/);
  if (genericMatch && (genericMatch[1].includes("<!DOCTYPE") || genericMatch[1].includes("<html"))) {
    return genericMatch[1].trim();
  }
  return null;
}

function removeCodeBlock(text: string): string {
  return text.replace(/```(?:html)?\s*\n[\s\S]*?```/g, "").trim();
}

function parseMessageContent(content: string): ParsedMessageContent {
  try {
    const parsed = JSON.parse(content);
    if (parsed.text !== undefined && parsed.attachments) {
      return parsed;
    }
  } catch {}
  return { text: content };
}

function PublishDialog({ code, open, onOpenChange }: {
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [subdomain, setSubdomain] = useState("");
  const [title, setTitle] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  }, []);

  const checkSubdomain = useCallback(async (value: string) => {
    if (value.length < 3) {
      setAvailable(null);
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(`/api/check-subdomain/${encodeURIComponent(value)}`);
      const data = await res.json();
      setAvailable(data.available);
    } catch {
      setAvailable(null);
    } finally {
      setChecking(false);
    }
  }, []);

  const handleSubdomainChange = (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSubdomain(cleaned);
    setAvailable(null);
    setPublishedUrl(null);
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    if (cleaned.length >= 3) {
      checkTimeoutRef.current = setTimeout(() => checkSubdomain(cleaned), 500);
    }
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/publish", { subdomain, htmlContent: code, title });
      return res.json();
    },
    onSuccess: (data: any) => {
      setPublishedUrl(data.url);
      toast({ title: "Published!", description: `Your app is live at ${data.url}` });
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handlePublish = () => {
    if (!subdomain || !title || available === false) return;
    publishMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            Publish Your App
          </DialogTitle>
          <DialogDescription>
            Give your app a name and subdomain to publish it live on afroaigroup.com
          </DialogDescription>
        </DialogHeader>

        {publishedUrl ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-green-500">
              <Check className="w-5 h-5" />
              <span className="font-medium">Published Successfully!</span>
            </div>
            <div className="bg-card rounded-lg p-4 border">
              <p className="text-sm text-muted-foreground mb-2">Your app is live at:</p>
              <a
                href={publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1 font-medium"
                data-testid="link-published-url"
              >
                {publishedUrl}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              DNS may take a few minutes to propagate. You can also preview at /site/{subdomain}
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">App Title</label>
              <Input
                placeholder="My Amazing App"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-publish-title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subdomain</label>
              <div className="flex items-center gap-1">
                <Input
                  placeholder="my-app"
                  value={subdomain}
                  onChange={(e) => handleSubdomainChange(e.target.value)}
                  className="flex-1"
                  data-testid="input-publish-subdomain"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">.afroaigroup.com</span>
              </div>
              {subdomain.length >= 3 && (
                <div className="flex items-center gap-1 text-xs">
                  {checking ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /><span className="text-muted-foreground">Checking...</span></>
                  ) : available === true ? (
                    <><Check className="w-3 h-3 text-green-500" /><span className="text-green-500">Available!</span></>
                  ) : available === false ? (
                    <><AlertCircle className="w-3 h-3 text-red-500" /><span className="text-red-500">Already taken</span></>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {publishedUrl ? (
            <Button onClick={() => onOpenChange(false)} data-testid="button-publish-done">
              Done
            </Button>
          ) : (
            <Button
              onClick={handlePublish}
              disabled={!subdomain || !title || subdomain.length < 3 || available === false || publishMutation.isPending}
              data-testid="button-publish-confirm"
            >
              {publishMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Publishing...</>
              ) : (
                <><Globe className="w-4 h-4" />Publish to Web</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PreviewDevice = "desktop" | "tablet" | "phone";

const deviceSizes: Record<PreviewDevice, { width: string; label: string }> = {
  desktop: { width: "100%", label: "Desktop" },
  tablet: { width: "768px", label: "Tablet" },
  phone: { width: "375px", label: "Phone" },
};

function LivePreview({ code, isFullscreen, onToggleFullscreen, onClose, onDownload, onBackToChat }: {
  code: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
  onDownload: () => void;
  onBackToChat?: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");

  return (
    <div className={`flex flex-col bg-background border-l w-full ${isFullscreen ? "fixed inset-0 z-50" : ""}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-card/80">
        <div className="flex items-center gap-2">
          {onBackToChat && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onBackToChat}
              className="md:hidden gap-1"
              data-testid="button-back-to-chat"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </Button>
          )}
          <Eye className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium hidden sm:inline" data-testid="text-preview-label">Live Preview</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center border rounded-md mr-2">
            <Button
              size="icon"
              variant={previewDevice === "desktop" ? "default" : "ghost"}
              className="h-7 w-7 rounded-r-none"
              onClick={() => setPreviewDevice("desktop")}
              title="Desktop"
              data-testid="button-chat-preview-desktop"
            >
              <Monitor className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant={previewDevice === "tablet" ? "default" : "ghost"}
              className="h-7 w-7 rounded-none border-x"
              onClick={() => setPreviewDevice("tablet")}
              title="Tablet"
              data-testid="button-chat-preview-tablet"
            >
              <Tablet className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant={previewDevice === "phone" ? "default" : "ghost"}
              className="h-7 w-7 rounded-l-none"
              onClick={() => setPreviewDevice("phone")}
              title="Phone"
              data-testid="button-chat-preview-phone"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Button size="sm" variant="default" onClick={() => setShowPublish(true)} className="gap-1" data-testid="button-publish-app">
            <Rocket className="w-3 h-3" />
            Publish
          </Button>
          <Button size="icon" variant="ghost" onClick={onDownload} data-testid="button-download-code">
            <Download className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onToggleFullscreen} data-testid="button-toggle-fullscreen">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-preview">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 bg-white flex justify-center overflow-auto">
        <iframe
          ref={iframeRef}
          srcDoc={code}
          className="h-full border-0 transition-all duration-300"
          style={{
            width: deviceSizes[previewDevice].width,
            maxWidth: "100%",
            boxShadow: previewDevice !== "desktop" ? "0 0 0 1px rgba(0,0,0,0.1), 0 4px 24px rgba(0,0,0,0.15)" : "none",
          }}
          sandbox="allow-scripts allow-popups"
          title="Live Preview"
          data-testid="iframe-preview"
        />
      </div>
      <PublishDialog code={code} open={showPublish} onOpenChange={setShowPublish} />
    </div>
  );
}

export default function AIChatPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeConversation, setActiveConversation] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");
  const [projectInitialized, setProjectInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectInitialized) return;
    const params = new URLSearchParams(window.location.search);
    const projectName = params.get("project");
    const projectType = params.get("type");
    const projectDesc = params.get("description");
    if (projectName) {
      setProjectInitialized(true);
      window.history.replaceState({}, "", "/chat");
      (async () => {
        try {
          const res = await apiRequest("POST", "/api/conversations", { title: projectName });
          const convo = await res.json();
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          setActiveConversation(convo.id);
          const prompt = `Build me a ${projectType === "mobile_app" ? "mobile app" : "website"} called "${projectName}"${projectDesc ? `. Description: ${projectDesc}` : ""}`;
          setTimeout(() => setInput(prompt), 300);
        } catch {
          toast({ title: "Error", description: "Failed to open project", variant: "destructive" });
        }
      })();
    }
  }, [projectInitialized]);

  const { data: conversations, isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: activeConvo, isLoading: loadingMessages } = useQuery<ConversationWithMessages>({
    queryKey: ["/api/conversations", activeConversation],
    enabled: !!activeConversation,
  });

  const createConvoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/conversations", { title: t("chat.newChat") });
      return res.json();
    },
    onSuccess: (data: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setActiveConversation(data.id);
    },
  });

  const deleteConvoMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (activeConversation === deletedId) {
        setActiveConversation(null);
        setPreviewCode(null);
        setShowPreview(false);
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConvo?.messages, streamingContent]);

  useEffect(() => {
    if (streamingContent) {
      const code = extractAllCodeBlocks(streamingContent);
      if (code) {
        setPreviewCode(code);
        setShowPreview(true);
        setMobileView("preview");
      }
    }
  }, [streamingContent]);

  useEffect(() => {
    if (activeConvo?.messages) {
      const lastAssistantMsg = [...(activeConvo.messages || [])].reverse().find(m => m.role === "assistant");
      if (lastAssistantMsg) {
        const code = extractAllCodeBlocks(lastAssistantMsg.content);
        if (code) {
          setPreviewCode(code);
          setShowPreview(true);
        }
      }
    }
  }, [activeConvo?.messages]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      const res = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      const uploaded: Attachment[] = await res.json();
      setPendingAttachments((prev) => [...prev, ...uploaded]);
    } catch (error: any) {
      toast({ title: "Upload Error", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDownload = useCallback(() => {
    if (!previewCode) return;
    const blob = new Blob([previewCode], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "africa-ai-project.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded!", description: "Your project has been downloaded as an HTML file." });
  }, [previewCode, toast]);

  const handleSend = async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || !activeConversation || isStreaming) return;

    const userMessage = input.trim() || "Check these attachments";
    const currentAttachments = [...pendingAttachments];
    setInput("");
    setPendingAttachments([]);
    setIsStreaming(true);
    setStreamingContent("");

    const messageContent = currentAttachments.length > 0
      ? JSON.stringify({ text: userMessage, attachments: currentAttachments })
      : userMessage;

    const optimisticMsg: Message = {
      id: Date.now(),
      conversationId: activeConversation,
      role: "user",
      content: messageContent,
      createdAt: new Date(),
    };

    queryClient.setQueryData<ConversationWithMessages>(
      ["/api/conversations", activeConversation],
      (old) => {
        if (!old) return old;
        return { ...old, messages: [...(old.messages || []), optimisticMsg] };
      }
    );

    try {
      const response = await fetch(`/api/conversations/${activeConversation}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content: userMessage,
          attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
        }),
      });

      if (!response.ok) throw new Error("Failed to send message");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullResponse = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              fullResponse += data.content;
              setStreamingContent(fullResponse);
            }
            if (data.done) {
              setStreamingContent("");
              setIsStreaming(false);
              queryClient.invalidateQueries({ queryKey: ["/api/conversations", activeConversation] });
              queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
            }
          } catch {}
        }
      }
    } catch (error) {
      toast({ title: t("dashboard.error"), description: t("chat.error"), variant: "destructive" });
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleViewCode = (content: string) => {
    const code = extractAllCodeBlocks(content);
    if (code) {
      setPreviewCode(code);
      setShowPreview(true);
      setMobileView("preview");
    }
  };

  const messages = activeConvo?.messages || [];
  const firstName = user?.firstName || "You";

  const renderMessageContent = (content: string, role: string) => {
    if (role !== "assistant") {
      const parsed = parseMessageContent(content);
      return (
        <div className="space-y-2">
          {parsed.text && <p className="whitespace-pre-wrap break-words">{parsed.text}</p>}
          {parsed.attachments && parsed.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {parsed.attachments.map((att, i) => (
                <div key={i} className="relative">
                  {att.mimetype.startsWith("image/") ? (
                    <img
                      src={att.url}
                      alt={att.originalName}
                      className="max-w-[200px] max-h-[150px] rounded-lg border object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(att.url, "_blank")}
                      data-testid={`img-attachment-${i}`}
                    />
                  ) : att.mimetype.startsWith("video/") ? (
                    <video
                      src={att.url}
                      controls
                      className="max-w-[250px] max-h-[150px] rounded-lg border"
                      data-testid={`video-attachment-${i}`}
                    />
                  ) : (
                    <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-xs">
                      <Paperclip className="w-3 h-3" />
                      {att.originalName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    const code = extractAllCodeBlocks(content);
    const textOnly = removeCodeBlock(content);

    return (
      <div className="space-y-3">
        {textOnly && <p className="whitespace-pre-wrap break-words">{textOnly}</p>}
        {code && (
          <div className="flex flex-wrap gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleViewCode(content)}
              data-testid="button-view-preview"
            >
              <Eye className="w-3 h-3" />
              View Live Preview
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPreviewCode(code);
                handleDownload();
              }}
              data-testid="button-download-from-msg"
            >
              <Download className="w-3 h-3" />
              Download
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-56 border-r bg-card/50 flex flex-col flex-shrink-0 hidden md:flex">
        <div className="p-3 border-b">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => createConvoMutation.mutate()}
            disabled={createConvoMutation.isPending}
            data-testid="button-new-chat"
          >
            <Plus className="w-4 h-4" />
            {t("chat.newChat")}
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {loadingConversations ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))
            ) : conversations && conversations.length > 0 ? (
              conversations.map((convo) => (
                <div
                  key={convo.id}
                  className={`group flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer transition-colors ${
                    activeConversation === convo.id
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setActiveConversation(convo.id)}
                  data-testid={`chat-item-${convo.id}`}
                >
                  <MessageSquare className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate flex-1 text-xs">{convo.title}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0"
                    style={{ visibility: "visible" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConvoMutation.mutate(convo.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4 px-2">
                {t("chat.noConversations")}
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex">
        <div className={`flex flex-col ${showPreview && previewCode ? `${mobileView === "preview" ? "hidden" : "flex"} md:flex md:w-1/2 md:min-w-[320px]` : "flex-1"}`}>
          {activeConversation ? (
            <>
              {previewCode && (
                <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-card/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Code2 className="w-4 h-4 text-primary" />
                    <span>Building Mode</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {(!showPreview || mobileView === "chat") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setShowPreview(true); setMobileView("preview"); }}
                        className="gap-1 text-xs"
                        data-testid="button-show-preview"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Preview
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setShowPreview(!showPreview)}
                      className="hidden md:flex"
                    >
                      {showPreview ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              )}

              <ScrollArea className="flex-1 p-4">
                <div className="max-w-2xl mx-auto space-y-6">
                  {loadingMessages ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex gap-3">
                          <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-16 w-full rounded-md" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className="flex gap-3" data-testid={`message-${msg.id}`}>
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          <AvatarFallback className={msg.role === "assistant" ? "bg-primary/10 text-primary" : "bg-secondary"}>
                            {msg.role === "assistant" ? (
                              <Sparkles className="w-4 h-4" />
                            ) : (
                              firstName.charAt(0).toUpperCase()
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-1 min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {msg.role === "assistant" ? "Africa.ai" : firstName}
                          </p>
                          <div className="text-sm leading-relaxed">
                            {renderMessageContent(msg.content, msg.role)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {streamingContent && (
                    <div className="flex gap-3">
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <Sparkles className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-1 min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">Africa.ai</p>
                        <div className="text-sm leading-relaxed">
                          <div className="space-y-2">
                            <p className="whitespace-pre-wrap break-words">{removeCodeBlock(streamingContent)}</p>
                            {extractAllCodeBlocks(streamingContent) && (
                              <div className="flex items-center gap-2 py-2">
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                <span className="text-sm text-primary font-medium">Building your project...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {isStreaming && !streamingContent && (
                    <div className="flex gap-3">
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <Sparkles className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">{t("chat.thinking")}</span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="border-t p-3 bg-background">
                <div className="max-w-2xl mx-auto space-y-2">
                  {pendingAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-1">
                      {pendingAttachments.map((att, i) => (
                        <div key={i} className="relative group">
                          {att.mimetype.startsWith("image/") ? (
                            <img
                              src={att.url}
                              alt={att.originalName}
                              className="w-16 h-16 rounded-lg border object-cover"
                              data-testid={`img-pending-${i}`}
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg border bg-muted flex flex-col items-center justify-center gap-1">
                              <Film className="w-5 h-5 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground truncate max-w-[56px]">{att.originalName}</span>
                            </div>
                          )}
                          <button
                            onClick={() => removePendingAttachment(i)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`button-remove-attachment-${i}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                      data-testid="input-file-upload"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isStreaming || isUploading}
                      data-testid="button-attach-file"
                      title="Attach photo, video, or screenshot"
                    >
                      {isUploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Paperclip className="w-4 h-4" />
                      )}
                    </Button>
                    <Textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t("chat.placeholder")}
                      disabled={isStreaming}
                      className="resize-none min-h-[44px] max-h-[120px]"
                      rows={1}
                      data-testid="input-chat-message"
                    />
                    <Button
                      onClick={handleSend}
                      disabled={(!input.trim() && pendingAttachments.length === 0) || isStreaming}
                      data-testid="button-send-message"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-6 max-w-md">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Sparkles className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-2xl font-bold font-serif" data-testid="text-chat-welcome">
                  {t("chat.welcome")}
                </h2>
                <p className="text-muted-foreground">
                  {t("chat.welcomeDesc")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    "Build me a restaurant website",
                    "Create a fitness tracking app",
                    "Design a portfolio website",
                    "Make an e-commerce store",
                  ].map((suggestion, i) => (
                    <Card
                      key={i}
                      className="hover-elevate cursor-pointer"
                      onClick={async () => {
                        try {
                          const res = await apiRequest("POST", "/api/conversations", { title: suggestion });
                          const convo = await res.json();
                          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
                          setActiveConversation(convo.id);
                          setTimeout(() => setInput(suggestion), 100);
                        } catch {}
                      }}
                      data-testid={`card-suggestion-${i}`}
                    >
                      <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                        <Code2 className="w-4 h-4 text-primary flex-shrink-0" />
                        {suggestion}
                      </div>
                    </Card>
                  ))}
                </div>
                <Button
                  onClick={() => createConvoMutation.mutate()}
                  disabled={createConvoMutation.isPending}
                  data-testid="button-start-chat"
                >
                  <MessageSquare className="w-4 h-4" />
                  {t("chat.startChat")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {showPreview && previewCode && (
          <div className={`${isFullscreen ? "" : "w-full md:w-1/2"} ${mobileView === "chat" ? "hidden md:flex" : "flex"}`}>
            <LivePreview
              code={previewCode}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              onClose={() => { setShowPreview(false); setIsFullscreen(false); setMobileView("chat"); }}
              onDownload={handleDownload}
              onBackToChat={() => setMobileView("chat")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
