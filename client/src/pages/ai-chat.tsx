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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Conversation, Message } from "@shared/schema";

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

function LivePreview({ code, isFullscreen, onToggleFullscreen, onClose, onDownload }: {
  code: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
  onDownload: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <div className={`flex flex-col bg-background border-l ${isFullscreen ? "fixed inset-0 z-50" : ""}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-card/80">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium" data-testid="text-preview-label">Live Preview</span>
        </div>
        <div className="flex items-center gap-1">
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
      <div className="flex-1 bg-white">
        <iframe
          ref={iframeRef}
          srcDoc={code}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-popups"
          title="Live Preview"
          data-testid="iframe-preview"
        />
      </div>
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (!input.trim() || !activeConversation || isStreaming) return;

    const userMessage = input.trim();
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    const optimisticMsg: Message = {
      id: Date.now(),
      conversationId: activeConversation,
      role: "user",
      content: userMessage,
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
        body: JSON.stringify({ content: userMessage }),
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
    }
  };

  const messages = activeConvo?.messages || [];
  const firstName = user?.firstName || "You";

  const renderMessageContent = (content: string, role: string) => {
    if (role !== "assistant") {
      return <p className="whitespace-pre-wrap break-words">{content}</p>;
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

      <div className={`flex-1 flex ${showPreview && previewCode ? "" : ""}`}>
        <div className={`flex flex-col ${showPreview && previewCode ? "w-1/2 min-w-[320px]" : "flex-1"}`}>
          {activeConversation ? (
            <>
              {showPreview && previewCode && (
                <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-card/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Code2 className="w-4 h-4 text-primary" />
                    <span>Building Mode</span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                  </Button>
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
                <div className="max-w-2xl mx-auto flex gap-2">
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
                    disabled={!input.trim() || isStreaming}
                    data-testid="button-send-message"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
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
          <div className={`${isFullscreen ? "" : "w-1/2"} flex`}>
            <LivePreview
              code={previewCode}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              onClose={() => { setShowPreview(false); setIsFullscreen(false); }}
              onDownload={handleDownload}
            />
          </div>
        )}
      </div>
    </div>
  );
}
