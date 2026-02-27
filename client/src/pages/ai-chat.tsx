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
import afroLogo from "@assets/IMG_5719_1771852498362.png";
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
  RefreshCw,
  ScanSearch,
  Camera,
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

interface CodeTestResult {
  passed: boolean;
  checks: { name: string; passed: boolean; detail?: string }[];
}

function validateHtmlCode(code: string): CodeTestResult {
  const checks: CodeTestResult["checks"] = [];

  checks.push({
    name: "Valid HTML structure",
    passed: code.includes("<!DOCTYPE html") || code.includes("<html") || code.includes("<HTML"),
    detail: "Document has proper HTML structure",
  });

  checks.push({
    name: "Has content",
    passed: (/<body[\s>]/i.test(code) || /<div[\s>]/i.test(code) || /<canvas[\s>]/i.test(code) || /<main[\s>]/i.test(code)),
    detail: "Document has displayable content",
  });

  checks.push({
    name: "Has visible elements",
    passed: (/<h[1-6][\s>]/i.test(code) || /<p[\s>]/i.test(code) || /<div[\s>]/i.test(code) || /<canvas[\s>]/i.test(code) || /<button[\s>]/i.test(code) || /<section[\s>]/i.test(code)),
    detail: "Page has visible elements",
  });

  checks.push({
    name: "No broken image hosts",
    passed: !(/imgur\.com|imgbb\.com|postimg\.cc/i.test(code)),
    detail: "No unreliable external image hosts used",
  });

  checks.push({
    name: "Has styling",
    passed: (/<style[\s>]/i.test(code) || /style="/i.test(code) || /<link.*stylesheet/i.test(code)),
    detail: "Page has CSS styling",
  });

  const passedCount = checks.filter(c => c.passed).length;
  return { passed: passedCount >= 3, checks };
}

type AutoPublishStatus = "idle" | "testing" | "test-passed" | "test-failed" | "publishing" | "published" | "publish-failed";

interface BuildStep {
  label: string;
  done: boolean;
}

function detectBuildSteps(code: string): BuildStep[] {
  const steps: BuildStep[] = [];
  const checks: [RegExp, string][] = [
    [/<html|<!DOCTYPE/i, "Setting up the project structure"],
    [/<style|css/i, "Designing the layout and styles"],
    [/<nav|<header/i, "Building the navigation"],
    [/hero|<main|<section/i, "Creating content sections"],
    [/font-family|google.*font|@import.*font/i, "Adding typography and fonts"],
    [/<img|background-image|picsum|placeholder/i, "Adding images and media"],
    [/<button|<a.*href|cta|btn/i, "Setting up buttons and links"],
    [/<footer/i, "Building the footer"],
    [/animation|@keyframes|transition|transform/i, "Adding animations and effects"],
    [/media.*query|@media|responsive/i, "Making it responsive"],
    [/<script|addEventListener|function\s/i, "Adding interactive features"],
  ];
  for (const [regex, label] of checks) {
    steps.push({ label, done: regex.test(code) });
  }
  return steps;
}

function BuildProgress({ code, isComplete }: { code: string; isComplete: boolean }) {
  const steps = detectBuildSteps(code);
  const doneSteps = steps.filter(s => s.done);
  const progress = isComplete ? 100 : Math.round((doneSteps.length / steps.length) * 100);

  return (
    <div className="space-y-3 bg-card/50 border rounded-lg p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          {isComplete ? "Build complete" : "Building your project..."}
        </span>
        <span className="text-xs text-primary font-semibold">{progress}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="space-y-1">
        {(isComplete ? doneSteps : steps).map((step, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {step.done ? (
              <Check className="w-3 h-3 text-primary flex-shrink-0" />
            ) : (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground flex-shrink-0" />
            )}
            <span className={step.done ? "text-foreground" : "text-muted-foreground"}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StreamingBuildProgress({ content }: { content: string }) {
  const hasHtmlBlock = content.includes("```html");
  const hasHtmlTag = content.includes("<!DOCTYPE") || content.includes("<html");
  const hasGenericBlock = content.includes("```\n") && hasHtmlTag;

  if (!hasHtmlBlock && !hasHtmlTag && !hasGenericBlock) {
    return null;
  }

  let codeContent = content;
  if (hasHtmlBlock) {
    codeContent = content.substring(content.indexOf("```html") + 7);
  } else if (hasGenericBlock) {
    codeContent = content.substring(content.indexOf("```\n") + 4);
  } else if (hasHtmlTag) {
    const idx = content.indexOf("<!DOCTYPE");
    const idx2 = content.indexOf("<html");
    codeContent = content.substring(Math.min(idx >= 0 ? idx : Infinity, idx2 >= 0 ? idx2 : Infinity));
  }

  return <BuildProgress code={codeContent} isComplete={false} />;
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
  const loadedRef = useRef(false);
  const [existingApp, setExistingApp] = useState<{ subdomain: string; title: string } | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  useEffect(() => {
    if (open && !loadedRef.current) {
      loadedRef.current = true;
      setLoadingExisting(true);
      fetch("/api/published-apps")
        .then(res => res.ok ? res.json() : [])
        .then((apps: any[]) => {
          if (apps.length > 0) {
            const latest = apps[0];
            if (latest.title) setTitle(latest.title);
            if (latest.subdomain) {
              setSubdomain(latest.subdomain);
              setAvailable(true);
            }
            if (latest.title && latest.subdomain) {
              setExistingApp({ subdomain: latest.subdomain, title: latest.title });
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingExisting(false));
    }
    if (!open) {
      loadedRef.current = false;
      setPublishedUrl(null);
    }
    return () => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  }, [open]);

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
      setExistingApp({ subdomain, title });
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

  const handleRepublish = () => {
    publishMutation.mutate();
  };

  const isRepublish = existingApp && !loadingExisting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            {publishedUrl ? "Published!" : isRepublish ? "Republish Your App" : "Publish Your App"}
          </DialogTitle>
          <DialogDescription>
            {publishedUrl
              ? "Your app has been updated successfully"
              : isRepublish
                ? `Update your app live at ${existingApp.subdomain}.afroaigroup.com`
                : "Give your app a name and subdomain to publish it live on afroaigroup.com"
            }
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
          </div>
        ) : isRepublish ? (
          <div className="space-y-4 py-4">
            <div className="bg-card rounded-lg p-4 border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Title</span>
                <span className="text-sm font-medium" data-testid="text-republish-title">{existingApp.title}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">URL</span>
                <span className="text-sm font-medium text-primary" data-testid="text-republish-url">{existingApp.subdomain}.afroaigroup.com</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Click Republish to update your live app with the latest changes.
            </p>
            <Button
              variant="ghost"
              className="text-xs p-0 h-auto text-muted-foreground hover:text-primary underline"
              onClick={() => setExistingApp(null)}
              data-testid="button-change-settings"
            >
              Change name or URL instead
            </Button>
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
              <label className="text-sm font-medium">App URL Name</label>
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
          ) : isRepublish ? (
            <Button
              onClick={handleRepublish}
              disabled={publishMutation.isPending}
              data-testid="button-republish-confirm"
            >
              {publishMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Republishing...</>
              ) : (
                <><RefreshCw className="w-4 h-4" />Republish</>
              )}
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
  const [showPreview, setShowPreview] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");
  const [showPublishFromChat, setShowPublishFromChat] = useState(false);
  const [projectInitialized, setProjectInitialized] = useState(false);
  const [autoPublishStatus, setAutoPublishStatus] = useState<AutoPublishStatus>("idle");
  const [testResult, setTestResult] = useState<CodeTestResult | null>(null);
  const [showImageAnalysis, setShowImageAnalysis] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [imageAnalysisResult, setImageAnalysisResult] = useState<string | null>(null);
  const [analysisImagePreview, setAnalysisImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectInitialized) return;
    const params = new URLSearchParams(window.location.search);
    const projectName = params.get("project");
    const projectType = params.get("type");
    const projectDesc = params.get("description");
    const projectId = params.get("projectId");
    if (projectName) {
      setProjectInitialized(true);
      window.history.replaceState({}, "", "/chat");
      (async () => {
        try {
          if (projectId) {
            const existingRes = await fetch(`/api/conversations/project/${projectId}`, { credentials: "include" });
            if (existingRes.ok) {
              const existingConvos = await existingRes.json();
              if (existingConvos.length > 0) {
                queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
                setActiveConversation(existingConvos[0].id);
                return;
              }
            }
          }
          const res = await apiRequest("POST", "/api/conversations", {
            title: projectName,
            projectId: projectId || undefined,
          });
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
        setMobileView("chat");
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

  const handleScanImage = async (file: File) => {
    setAnalyzingImage(true);
    setImageAnalysisResult(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setAnalysisImagePreview(dataUrl);

      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";

      try {
        const res = await fetch("/api/analyze-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ imageBase64: base64, mimeType }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Analysis failed");
        }

        const data = await res.json();
        setImageAnalysisResult(data.analysis);
      } catch (error: any) {
        toast({ title: "Analysis Error", description: error.message, variant: "destructive" });
        setImageAnalysisResult("Failed to analyze the image. Please try again.");
      } finally {
        setAnalyzingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleScanFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setShowImageAnalysis(true);
      handleScanImage(file);
    }
    if (scanFileInputRef.current) scanFileInputRef.current.value = "";
  };

  const runAutoTestAndPublish = async (code: string) => {
    setAutoPublishStatus("testing");
    setTestResult(null);

    await new Promise(r => setTimeout(r, 800));

    const result = validateHtmlCode(code);
    setTestResult(result);

    if (!result.passed) {
      setAutoPublishStatus("idle");
      toast({
        title: "Quality Tips",
        description: `${result.checks.filter(c => !c.passed).length} suggestion(s) found. You can still publish manually.`,
      });
      return;
    }

    setAutoPublishStatus("test-passed");
    toast({ title: "Quality Check Passed", description: "All tests passed! Auto-publishing..." });

    await new Promise(r => setTimeout(r, 1000));

    try {
      const appsRes = await fetch("/api/published-apps", { credentials: "include" });
      if (!appsRes.ok) {
        setAutoPublishStatus("idle");
        return;
      }
      const apps = await appsRes.json();
      if (apps.length === 0) {
        setAutoPublishStatus("test-passed");
        toast({ title: "Ready to Publish", description: "Tests passed! Click 'Publish to Web' to go live." });
        setTimeout(() => setAutoPublishStatus("idle"), 4000);
        return;
      }

      const existingApp = apps[0];
      setAutoPublishStatus("publishing");

      const publishRes = await apiRequest("POST", "/api/publish", {
        subdomain: existingApp.subdomain,
        htmlContent: code,
        title: existingApp.title,
      });

      if (!publishRes.ok) {
        const errData = await publishRes.json();
        throw new Error(errData.message || "Publish failed");
      }

      const publishData = await publishRes.json();
      setAutoPublishStatus("published");
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      toast({
        title: "Auto-Published!",
        description: `Your app has been updated at ${publishData.url}`,
      });
      setTimeout(() => setAutoPublishStatus("idle"), 6000);
    } catch (err: any) {
      setAutoPublishStatus("publish-failed");
      toast({
        title: "Auto-Publish Failed",
        description: err.message || "Could not republish. Try manually.",
        variant: "destructive",
      });
      setTimeout(() => setAutoPublishStatus("idle"), 5000);
    }
  };

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

              const generatedCode = extractAllCodeBlocks(fullResponse);
              if (generatedCode) {
                runAutoTestAndPublish(generatedCode);
              }
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
          <>
            <BuildProgress code={code} isComplete={true} />
            {autoPublishStatus !== "idle" && (
              <div className="bg-card/50 border rounded-lg p-3 space-y-2" data-testid="auto-publish-status">
                <div className="flex items-center gap-2 text-xs font-medium">
                  {autoPublishStatus === "testing" && (
                    <><Loader2 className="w-3 h-3 animate-spin text-primary" /><span>Running quality checks...</span></>
                  )}
                  {autoPublishStatus === "test-passed" && (
                    <><Check className="w-3 h-3 text-green-500" /><span className="text-green-500">All checks passed!</span></>
                  )}
                  {autoPublishStatus === "test-failed" && (
                    <><AlertCircle className="w-3 h-3 text-red-500" /><span className="text-red-500">Quality check failed</span></>
                  )}
                  {autoPublishStatus === "publishing" && (
                    <><Loader2 className="w-3 h-3 animate-spin text-primary" /><span>Auto-publishing to your site...</span></>
                  )}
                  {autoPublishStatus === "published" && (
                    <><Check className="w-3 h-3 text-green-500" /><span className="text-green-500">Auto-published successfully!</span></>
                  )}
                  {autoPublishStatus === "publish-failed" && (
                    <><AlertCircle className="w-3 h-3 text-red-500" /><span className="text-red-500">Auto-publish failed</span></>
                  )}
                </div>
                {testResult && (
                  <div className="space-y-1">
                    {testResult.checks.map((check, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {check.passed ? (
                          <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                        )}
                        <span className={check.passed ? "text-muted-foreground" : "text-red-400"}>{check.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => handleViewCode(content)}
                className="gap-1"
                data-testid="button-view-preview"
              >
                <Eye className="w-3 h-3" />
                View Live Preview
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  handleViewCode(content);
                  setTimeout(() => setShowPublishFromChat(true), 300);
                }}
                className="gap-1 bg-green-600 hover:bg-green-700"
                data-testid="button-publish-from-msg"
              >
                <Rocket className="w-3 h-3" />
                Publish to Web
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
          </>
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
        <div className={`flex flex-col ${previewCode && showPreview ? `${mobileView === "preview" ? "hidden" : "flex"} md:flex md:w-1/2 md:min-w-[320px]` : "flex-1"}`}>
          {activeConversation ? (
            <>
              {previewCode && (
                <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-card/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Code2 className="w-4 h-4 text-primary" />
                    <span>Building Mode</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {mobileView === "chat" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setShowPreview(true); setMobileView("preview"); }}
                        className="gap-1 text-xs md:hidden"
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
                      data-testid="button-toggle-preview"
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
                            {msg.role === "assistant" ? "Afro AI" : firstName}
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
                        <p className="text-xs font-medium text-muted-foreground">Afro AI</p>
                        <div className="text-sm leading-relaxed">
                          <div className="space-y-3">
                            {removeCodeBlock(streamingContent) && (
                              <p className="whitespace-pre-wrap break-words">{removeCodeBlock(streamingContent)}</p>
                            )}
                            <StreamingBuildProgress content={streamingContent} />
                            {!streamingContent.includes("```html") && !streamingContent.includes("<!DOCTYPE") && !streamingContent.includes("<html") && !removeCodeBlock(streamingContent) && (
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                <span className="text-sm text-muted-foreground">Thinking...</span>
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
                    <input
                      ref={scanFileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleScanFileSelect}
                      data-testid="input-scan-upload"
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
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => scanFileInputRef.current?.click()}
                      disabled={isStreaming || analyzingImage}
                      data-testid="button-scan-image"
                      title="Scan & identify an image (Google Lens-like)"
                      className="text-primary"
                    >
                      {analyzingImage ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ScanSearch className="w-4 h-4" />
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
                  <img src={afroLogo} alt="Afro AI" className="w-12 h-12 object-contain" />
                </div>
                <h2 className="text-2xl font-bold font-serif" data-testid="text-chat-welcome">
                  {t("chat.welcome")}
                </h2>
                <p className="text-muted-foreground">
                  {t("chat.welcomeDesc")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { text: "Build me a restaurant website with menu and booking", icon: Globe },
                    { text: "Create a fitness tracking app with progress charts", icon: Smartphone },
                    { text: "Design a portfolio website for a photographer", icon: Eye },
                    { text: "Make an e-commerce store with product catalog", icon: Code2 },
                  ].map((suggestion, i) => (
                    <Card
                      key={i}
                      className="hover-elevate cursor-pointer group"
                      onClick={async () => {
                        try {
                          const res = await apiRequest("POST", "/api/conversations", { title: suggestion.text });
                          const convo = await res.json();
                          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
                          setActiveConversation(convo.id);
                          setTimeout(() => setInput(suggestion.text), 100);
                        } catch {}
                      }}
                      data-testid={`card-suggestion-${i}`}
                    >
                      <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <suggestion.icon className="w-4 h-4 text-primary" />
                        </div>
                        <span>{suggestion.text}</span>
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

        {previewCode && showPreview && (
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
      {previewCode && (
        <PublishDialog
          code={previewCode}
          open={showPublishFromChat}
          onOpenChange={setShowPublishFromChat}
        />
      )}
      <Dialog open={showImageAnalysis} onOpenChange={(open) => {
        setShowImageAnalysis(open);
        if (!open) {
          setImageAnalysisResult(null);
          setAnalysisImagePreview(null);
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanSearch className="w-5 h-5 text-primary" />
              Image Analysis
            </DialogTitle>
            <DialogDescription>
              AI-powered image recognition powered by Google Gemini
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {analysisImagePreview && (
              <div className="rounded-lg overflow-hidden border bg-muted/50">
                <img
                  src={analysisImagePreview}
                  alt="Scanned image"
                  className="w-full max-h-[250px] object-contain"
                  data-testid="img-analysis-preview"
                />
              </div>
            )}
            {analyzingImage && (
              <div className="flex items-center gap-3 p-4 bg-card/50 rounded-lg border">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <div>
                  <p className="text-sm font-medium">Analyzing image...</p>
                  <p className="text-xs text-muted-foreground">Identifying objects, text, and details</p>
                </div>
              </div>
            )}
            {imageAnalysisResult && (
              <div className="prose prose-sm dark:prose-invert max-w-none p-4 bg-card/50 rounded-lg border" data-testid="text-analysis-result">
                <div className="whitespace-pre-wrap text-sm">{imageAnalysisResult}</div>
              </div>
            )}
          </div>
          <DialogFooter className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => scanFileInputRef.current?.click()}
              disabled={analyzingImage}
              data-testid="button-scan-another"
            >
              <Camera className="w-4 h-4 mr-1" />
              Scan Another
            </Button>
            {imageAnalysisResult && imageAnalysisResult !== "Failed to analyze the image. Please try again." && (
              <Button
                variant="outline"
                onClick={() => {
                  setInput(`Based on the image analysis:\n${imageAnalysisResult}\n\nPlease help me build something with this.`);
                  setShowImageAnalysis(false);
                  setImageAnalysisResult(null);
                  setAnalysisImagePreview(null);
                }}
                data-testid="button-use-in-chat"
              >
                <MessageSquare className="w-4 h-4 mr-1" />
                Use in Chat
              </Button>
            )}
            <Button onClick={() => setShowImageAnalysis(false)} data-testid="button-close-analysis">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
