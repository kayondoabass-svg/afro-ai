import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Send,
  Terminal,
  Crown,
  Sparkles,
  Loader2,
  Eye,
  Code2,
  X,
  Maximize2,
  Minimize2,
  Rocket,
  Download,
  Globe,
  Check,
  AlertCircle,
  ExternalLink,
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
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CommandMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

function extractHtmlCode(text: string): string | null {
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

  const checkSubdomain = async (value: string) => {
    if (value.length < 3) { setAvailable(null); return; }
    setChecking(true);
    try {
      const res = await fetch(`/api/check-subdomain/${encodeURIComponent(value)}`);
      const data = await res.json();
      setAvailable(data.available);
    } catch { setAvailable(null); }
    finally { setChecking(false); }
  };

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
      toast({ title: "Published!", description: `Live at ${data.url}` });
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            Publish to Web
          </DialogTitle>
          <DialogDescription>
            Deploy this directly to afroaigroup.com
          </DialogDescription>
        </DialogHeader>
        {publishedUrl ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-green-500">
              <Check className="w-5 h-5" />
              <span className="font-medium">Published Successfully!</span>
            </div>
            <div className="bg-card rounded-lg p-4 border">
              <p className="text-sm text-muted-foreground mb-2">Live at:</p>
              <a href={publishedUrl} target="_blank" rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1 font-medium" data-testid="link-admin-published-url">
                {publishedUrl}<ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">App Title</label>
              <Input placeholder="My App" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-admin-publish-title" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subdomain</label>
              <div className="flex items-center gap-1">
                <Input placeholder="my-app" value={subdomain} onChange={(e) => handleSubdomainChange(e.target.value)} className="flex-1" data-testid="input-admin-publish-subdomain" />
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
            <Button onClick={() => onOpenChange(false)} data-testid="button-admin-publish-done">Done</Button>
          ) : (
            <Button onClick={() => publishMutation.mutate()}
              disabled={!subdomain || !title || subdomain.length < 3 || available === false || publishMutation.isPending}
              data-testid="button-admin-publish-confirm">
              {publishMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Publishing...</> : <><Globe className="w-4 h-4" />Publish</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminCommandPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [messages, setMessages] = useState<CommandMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFounder = (user as any)?.isFounder === true;

  useEffect(() => {
    if (!isFounder) setLocation("/dashboard");
  }, [isFounder, setLocation]);

  useEffect(() => {
    if (isFounder) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, isFounder]);

  useEffect(() => {
    if (streamingContent) {
      const code = extractHtmlCode(streamingContent);
      if (code) {
        setPreviewCode(code);
        setShowPreview(true);
      }
    }
  }, [streamingContent]);

  const ensureConversation = async (): Promise<number> => {
    if (conversationId) return conversationId;
    const res = await apiRequest("POST", "/api/conversations", { title: "Founder Command" });
    const convo = await res.json();
    setConversationId(convo.id);
    return convo.id;
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const userMessage = input.trim();
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    const userMsg: CommandMessage = {
      id: Date.now(),
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const convoId = await ensureConversation();
      const response = await fetch(`/api/conversations/${convoId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: userMessage }),
      });

      if (!response.ok) throw new Error("Failed to send");

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
              const code = extractHtmlCode(fullResponse);
              if (code) {
                setPreviewCode(code);
                setShowPreview(true);
              }
              const assistantMsg: CommandMessage = {
                id: Date.now() + 1,
                role: "assistant",
                content: fullResponse,
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, assistantMsg]);
              setStreamingContent("");
              setIsStreaming(false);
            }
          } catch {}
        }
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to process command", variant: "destructive" });
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

  const handleDownload = () => {
    if (!previewCode) return;
    const blob = new Blob([previewCode], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "founder-build.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded!" });
  };

  const renderMessageContent = (content: string, role: string) => {
    if (role !== "assistant") {
      return <p className="whitespace-pre-wrap break-words">{content}</p>;
    }
    const code = extractHtmlCode(content);
    const textOnly = removeCodeBlock(content);
    return (
      <div className="space-y-3">
        {textOnly && <p className="whitespace-pre-wrap break-words">{textOnly}</p>}
        {code && (
          <div className="flex flex-wrap gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={() => { setPreviewCode(code); setShowPreview(true); }} data-testid="button-admin-view-preview">
              <Eye className="w-3 h-3" />Preview
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setPreviewCode(code); handleDownload(); }} data-testid="button-admin-download">
              <Download className="w-3 h-3" />Download
            </Button>
            <Button size="sm" variant="default" onClick={() => { setPreviewCode(code); setShowPublish(true); }} data-testid="button-admin-publish">
              <Rocket className="w-3 h-3" />Publish
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className={`flex flex-col ${showPreview && previewCode ? "w-1/2 min-w-[320px]" : "flex-1"}`}>
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-card/50">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Terminal className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-sm" data-testid="text-command-title">Founder Command Center</h2>
            <p className="text-xs text-muted-foreground">Type what you want to build or change. AI will generate it instantly.</p>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="max-w-2xl mx-auto space-y-6">
            {messages.length === 0 && !streamingContent && (
              <div className="text-center py-16 space-y-6">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Crown className="w-10 h-10 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Welcome, Founder</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
                    Tell me what you want to build or change. I'll generate the code instantly and you can publish it directly to your domain.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                  {[
                    "Build me a landing page for Africa.ai with a signup form",
                    "Create a pricing page with Starter, Pro, and Business plans",
                    "Make a portfolio showcase page for African creators",
                    "Build a mobile-friendly coming soon page for our app",
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(suggestion)}
                      className="text-left p-3 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all text-sm text-muted-foreground hover:text-foreground"
                      data-testid={`button-suggestion-${i}`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-3" data-testid={`admin-message-${msg.id}`}>
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarFallback className={msg.role === "assistant" ? "bg-primary/10 text-primary" : "bg-orange-500/10 text-orange-500"}>
                    {msg.role === "assistant" ? <Sparkles className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    {msg.role === "assistant" ? "Africa.ai" : "Founder"}
                  </p>
                  <div className="text-sm leading-relaxed">
                    {renderMessageContent(msg.content, msg.role)}
                  </div>
                </div>
              </div>
            ))}

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
                    <p className="whitespace-pre-wrap break-words">{removeCodeBlock(streamingContent)}</p>
                    {extractHtmlCode(streamingContent) && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-primary">
                        <Code2 className="w-3 h-3 animate-pulse" />
                        <span>Building your app...</span>
                      </div>
                    )}
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-card/50">
          <div className="max-w-2xl mx-auto flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell me what to build or change..."
              className="min-h-[48px] max-h-[120px] resize-none flex-1"
              disabled={isStreaming}
              data-testid="textarea-admin-command"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              size="icon"
              className="flex-shrink-0 h-12 w-12"
              data-testid="button-admin-send"
            >
              {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {showPreview && previewCode && (
        <div className={`flex flex-col bg-background border-l ${isFullscreen ? "fixed inset-0 z-50" : "flex-1"}`}>
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-card/80">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium" data-testid="text-admin-preview-label">Live Preview</span>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="default" onClick={() => setShowPublish(true)} className="gap-1" data-testid="button-admin-preview-publish">
                <Rocket className="w-3 h-3" />Publish
              </Button>
              <Button size="icon" variant="ghost" onClick={handleDownload} data-testid="button-admin-preview-download">
                <Download className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setIsFullscreen(!isFullscreen)} data-testid="button-admin-preview-fullscreen">
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setShowPreview(false)} data-testid="button-admin-preview-close">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 bg-white">
            <iframe
              srcDoc={previewCode}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-popups"
              title="Admin Preview"
              data-testid="iframe-admin-preview"
            />
          </div>
        </div>
      )}

      {previewCode && (
        <PublishDialog code={previewCode} open={showPublish} onOpenChange={setShowPublish} />
      )}
    </div>
  );
}
