import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
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
  Undo2,
  Gamepad2,
  Swords,
  ShieldAlert,
  Key,
  Upload,
  Link2,
  FileArchive,
  FolderOpen,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
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

function looksLikeSecret(text: string): boolean {
  if (text.length < 16) return false;
  const patterns = [
    /\bsk[-_][A-Za-z0-9]{20,}/,                        // OpenAI / Stripe secret key
    /\bpk[-_][A-Za-z0-9]{20,}/,                        // Stripe publishable key
    /\bAIza[A-Za-z0-9_-]{20,}/,                        // Google API key
    /\bAKIA[A-Z0-9]{16}/,                              // AWS Access Key
    /\bghp_[A-Za-z0-9]{36}/,                           // GitHub personal access token
    /\bghs_[A-Za-z0-9]{36}/,                           // GitHub server token
    /\bgho_[A-Za-z0-9]{36}/,                           // GitHub OAuth token
    /\bxoxb-[0-9]+-[0-9A-Za-z-]+/,                    // Slack Bot token
    /\bxoxp-[0-9]+-[0-9A-Za-z-]+/,                    // Slack User token
    /\beya[A-Za-z0-9_-]{40,}/,                         // JWT access token
    /Bearer\s+[A-Za-z0-9_.~+/=-]{20,}/i,              // Bearer token
    /\bSG\.[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{43,}/,   // SendGrid API key
    /[A-Fa-f0-9]{32,}/,                                // Long hex string (API keys, secrets)
    /[A-Za-z0-9+/]{40,}={0,2}/,                        // Base64 encoded secret
  ];
  return patterns.some(p => p.test(text));
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

interface PublishStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

const PUBLISH_STEPS: { id: string; label: string }[] = [
  { id: "validate", label: "Validating input" },
  { id: "check", label: "Checking subdomain" },
  { id: "dns", label: "Configuring DNS" },
  { id: "deploy", label: "Deploying app" },
  { id: "live", label: "Going live" },
];

function PublishDialog({ code, open, onOpenChange }: {
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [subdomain, setSubdomain] = useState("");
  const [title, setTitle] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSteps, setPublishSteps] = useState<PublishStep[]>([]);
  const [publishError, setPublishError] = useState<string | null>(null);
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
      setPublishSteps([]);
      setPublishError(null);
      setIsPublishing(false);
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

  const startPublish = async () => {
    setIsPublishing(true);
    setPublishError(null);
    setPublishSteps(PUBLISH_STEPS.map(s => ({ ...s, status: "pending" as const })));

    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subdomain, htmlContent: code, title }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
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
            if (data.type === "step") {
              setPublishSteps(prev => prev.map(s =>
                s.id === data.step ? { ...s, status: data.status, detail: data.detail } : s
              ));
            } else if (data.type === "result") {
              setPublishedUrl(data.url);
              setExistingApp({ subdomain: data.subdomain || subdomain, title });
              toast({ title: "Published!", description: `Your app is live at ${data.url}` });
              queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
            } else if (data.type === "error") {
              setPublishError(data.message);
              toast({ title: "Error", description: data.message, variant: "destructive" });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setPublishError(err.message || "Publishing failed");
      toast({ title: "Error", description: err.message || "Publishing failed", variant: "destructive" });
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublish = () => {
    if (!subdomain || !title || available === false) return;
    startPublish();
  };

  const handleRepublish = () => {
    startPublish();
  };

  const isRepublish = existingApp && !loadingExisting;
  const showProgress = publishSteps.length > 0;

  return (
    <Dialog open={open} onOpenChange={isPublishing ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            {publishedUrl ? "Published!" : showProgress ? "Publishing..." : isRepublish ? "Republish Your App" : "Publish Your App"}
          </DialogTitle>
          <DialogDescription>
            {publishedUrl
              ? "Your app has been deployed successfully"
              : showProgress
                ? "Deploying your app to the web..."
                : isRepublish
                  ? `Update your app live at ${existingApp.subdomain}.afroaigroup.com`
                  : "Give your app a name and subdomain to publish it live on afroaigroup.com"
            }
          </DialogDescription>
        </DialogHeader>

        {showProgress ? (
          <div className="space-y-3 py-4" data-testid="publish-progress">
            {publishSteps.map((step) => (
              <div key={step.id} className="flex items-start gap-3" data-testid={`publish-step-${step.id}`}>
                <div className="mt-0.5 flex-shrink-0">
                  {step.status === "done" ? (
                    <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    </div>
                  ) : step.status === "active" ? (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                    </div>
                  ) : step.status === "error" ? (
                    <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${step.status === "done" ? "text-green-500" : step.status === "active" ? "text-foreground" : step.status === "error" ? "text-red-500" : "text-muted-foreground"}`}>
                    {step.label}
                  </p>
                  {step.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                  )}
                </div>
              </div>
            ))}
            {publishError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-2">
                <p className="text-sm text-red-500">{publishError}</p>
              </div>
            )}
            {publishedUrl && (
              <div className="space-y-3 mt-2">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-sm font-semibold text-green-600 dark:text-green-400">Your app is live!</p>
                  </div>
                  <a
                    href={publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 font-medium text-sm"
                    data-testid="link-published-url"
                  >
                    {publishedUrl}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                    <p className="text-sm font-semibold">Want a custom domain?</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Replace <span className="font-mono text-primary">.afroaigroup.com</span> with your own domain like <span className="font-mono">mybusiness.com</span> — free to connect, SSL included.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Buy a domain at <strong>Namecheap</strong> or <strong>Truehost Africa</strong> (accepts mobile money), then connect it in Deployments.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-1 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => { onOpenChange(false); setLocation("/deployments"); }}
                    data-testid="button-connect-domain-cta"
                  >
                    <Globe className="w-3.5 h-3.5 mr-1" />
                    Connect Custom Domain
                  </Button>
                </div>
              </div>
            )}
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

        {!publishedUrl && !showProgress && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-2">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Before publishing, review all phone numbers, prices, addresses, and contact details — AI may have used example values.
            </p>
          </div>
        )}
        <DialogFooter>
          {publishedUrl ? (
            <Button onClick={() => onOpenChange(false)} data-testid="button-publish-done">
              Done
            </Button>
          ) : isRepublish && !showProgress ? (
            <Button
              onClick={handleRepublish}
              disabled={isPublishing}
              data-testid="button-republish-confirm"
            >
              {isPublishing ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Republishing...</>
              ) : (
                <><RefreshCw className="w-4 h-4" />Republish</>
              )}
            </Button>
          ) : !showProgress ? (
            <Button
              onClick={handlePublish}
              disabled={!subdomain || !title || subdomain.length < 3 || available === false || isPublishing}
              data-testid="button-publish-confirm"
            >
              {isPublishing ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Publishing...</>
              ) : (
                <><Globe className="w-4 h-4" />Publish to Web</>
              )}
            </Button>
          ) : null}
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

function LivePreview({ code, isFullscreen, onToggleFullscreen, onClose, onDownload, onBackToChat, onUndo, canUndo, onAutoFix, onVerify }: {
  code: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
  onDownload: () => void;
  onBackToChat?: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onAutoFix?: (errors: string[]) => void;
  onVerify?: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [iframeErrors, setIframeErrors] = useState<string[]>([]);
  const [errorsDismissed, setErrorsDismissed] = useState(false);

  // Reset errors when new code arrives
  useEffect(() => {
    setIframeErrors([]);
    setErrorsDismissed(false);
  }, [code]);

  // Listen for JS errors from inside the iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "afroai-iframe-error") {
        const msg = String(e.data.message || "Unknown error");
        setIframeErrors(prev => prev.includes(msg) ? prev : [...prev, msg]);
        setErrorsDismissed(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Inject error-catcher script so iframe errors bubble up
  const instrumentedCode = useMemo(() => {
    const errorScript = `<script>(function(){function s(m){try{window.parent.postMessage({type:'afroai-iframe-error',message:m},'*')}catch(e){}}window.addEventListener('error',function(e){s(e.message||'Script error')});window.addEventListener('unhandledrejection',function(e){s(e.reason&&e.reason.message?e.reason.message:String(e.reason))})})();<\/script>`;
    if (code.includes('<head>')) return code.replace('<head>', '<head>' + errorScript);
    if (/<html/i.test(code)) return code.replace(/<html[^>]*>/i, m => m + errorScript);
    return errorScript + code;
  }, [code]);

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
          {onVerify && (
            <Button
              size="sm"
              variant="outline"
              onClick={onVerify}
              className="gap-1 border-primary/30 text-primary hover:bg-primary/10"
              title="Verify app for broken code, phantom functions, and hallucinated content"
              data-testid="button-verify-app"
            >
              <ShieldCheck className="w-3 h-3" />
              <span className="hidden sm:inline">Verify</span>
            </Button>
          )}
          <Button size="sm" variant="default" onClick={() => setShowPublish(true)} className="gap-1" data-testid="button-publish-app">
            <Rocket className="w-3 h-3" />
            Publish
          </Button>
          {canUndo && onUndo && (
            <Button size="icon" variant="ghost" onClick={onUndo} title="Undo last change" data-testid="button-undo-preview">
              <Undo2 className="w-4 h-4" />
            </Button>
          )}
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
      {iframeErrors.length > 0 && !errorsDismissed && (
        <div className="mx-3 mt-2 mb-1 p-2 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2" data-testid="banner-iframe-error">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-red-400">JavaScript error detected in your app</p>
            <p className="text-xs text-red-400/70 truncate">{iframeErrors[iframeErrors.length - 1]}</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {onAutoFix && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2 border-red-500/40 text-red-400 hover:bg-red-500/10"
                onClick={() => { onAutoFix(iframeErrors); setErrorsDismissed(true); }}
                data-testid="button-auto-fix"
              >
                Auto-Fix
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setErrorsDismissed(true)} data-testid="button-dismiss-error">
              <X className="w-3 h-3 text-red-400" />
            </Button>
          </div>
        </div>
      )}
      <div className="flex-1 bg-white flex justify-center overflow-auto">
        <iframe
          ref={iframeRef}
          srcDoc={instrumentedCode}
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

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^### /.test(line)) {
      elements.push(<h3 key={i} className="text-sm font-bold mt-3 mb-1 text-foreground">{renderInline(line.slice(4))}</h3>);
    } else if (/^## /.test(line)) {
      elements.push(<h2 key={i} className="text-base font-bold mt-3 mb-1 text-foreground">{renderInline(line.slice(3))}</h2>);
    } else if (/^# /.test(line)) {
      elements.push(<h1 key={i} className="text-lg font-bold mt-3 mb-1 text-foreground">{renderInline(line.slice(2))}</h1>);
    } else if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="border-border/50 my-2" />);
    } else if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 my-1 ml-2">{items.map((it, j) => <li key={j} className="text-sm">{renderInline(it)}</li>)}</ul>);
      continue;
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className="list-decimal list-inside space-y-0.5 my-1 ml-2">{items.map((it, j) => <li key={j} className="text-sm">{renderInline(it)}</li>)}</ol>);
      continue;
    } else if (line.trim() === "") {
      if (elements.length > 0) elements.push(<div key={`sp-${i}`} className="h-1" />);
    } else {
      elements.push(<p key={i} className="text-sm leading-relaxed break-words">{renderInline(line)}</p>);
    }
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0, m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={key++} className="font-semibold">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={key++} className="italic">{m[3]}</em>);
    else if (m[4]) parts.push(<code key={key++} className="bg-muted/60 rounded px-1 py-0.5 text-xs font-mono">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
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
  const [previousCode, setPreviousCode] = useState<string | null>(null);
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
  const [secretWarningDismissed, setSecretWarningDismissed] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importZipFile, setImportZipFile] = useState<File | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importZipRef = useRef<HTMLInputElement>(null);

  function handleInputChange(val: string) {
    setInput(val);
    if (!looksLikeSecret(val)) setSecretWarningDismissed(false);
  }

  const showSecretWarning = looksLikeSecret(input) && !secretWarningDismissed;

  const SecretWarningBanner = (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/60 px-4 py-3 text-sm animate-in fade-in slide-in-from-bottom-2 duration-200" data-testid="banner-secret-warning">
      <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-300 flex items-center gap-1.5"><Key className="w-3.5 h-3.5" /> Security Warning</p>
        <p className="text-amber-200/80 text-xs mt-0.5 leading-relaxed">This looks like a secret or API key. Never paste credentials directly in chat. Store it securely in <strong>API Integrations</strong>.</p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => { setLocation("/integrations"); setSecretWarningDismissed(true); }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-colors"
            data-testid="button-secret-add-integration"
          >
            <Key className="w-3 h-3" /> Add to Integrations
          </button>
          <button
            onClick={() => setSecretWarningDismissed(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors"
            data-testid="button-secret-dismiss"
          >
            <X className="w-3 h-3" /> Dismiss
          </button>
        </div>
      </div>
    </div>
  );

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

  // Handle prompts from Block Builder and Email Marketing
  useEffect(() => {
    const builderPrompt = sessionStorage.getItem("builder_prompt");
    const emailContext = sessionStorage.getItem("email_campaign_context");
    if (builderPrompt || emailContext) {
      sessionStorage.removeItem("builder_prompt");
      sessionStorage.removeItem("email_campaign_context");
      const promptText = builderPrompt || "Write me a professional HTML email newsletter. Make it beautiful, mobile-responsive, with a header logo area, hero section with headline and CTA button, content section, and a footer with unsubscribe link. Use inline CSS so it works in all email clients. Output complete HTML only.";
      (async () => {
        try {
          const res = await apiRequest("POST", "/api/conversations", { title: builderPrompt ? "Block Builder Page" : "Email Campaign" });
          const convo = await res.json();
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          setActiveConversation(convo.id);
          setTimeout(() => setInput(promptText), 400);
        } catch {}
      })();
    }
  }, []);

  const [pendingWelcomeSend, setPendingWelcomeSend] = useState(false);

  const createConvoMutation = useMutation({
    mutationFn: async () => {
      const title = input.trim() || t("chat.newChat");
      const res = await apiRequest("POST", "/api/conversations", { title });
      return res.json();
    },
    onSuccess: (data: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setActiveConversation(data.id);
    },
  });

  const saveExperienceMutation = useMutation({
    mutationFn: async (level: string) => {
      const res = await apiRequest("PATCH", "/api/user/experience", { level });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

  // Auto-send input after welcome screen creates a conversation
  useEffect(() => {
    if (pendingWelcomeSend && activeConversation && input.trim() && !isStreaming) {
      setPendingWelcomeSend(false);
      setTimeout(() => handleSend(), 50);
    }
  }, [activeConversation, pendingWelcomeSend]);

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
        if (previewCode && previewCode !== code) {
          setPreviousCode(previewCode);
        }
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

    const titleMatch = previewCode.match(/<title>([^<]+)<\/title>/i);
    const projectName = titleMatch ? titleMatch[1].replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-").toLowerCase() : "afro-ai-project";

    const styleMatch = previewCode.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const scriptMatch = previewCode.match(/<script[^>]*>([\s\S]*?)<\/script>/i);

    if (styleMatch && scriptMatch && previewCode.length > 3000) {
      const css = styleMatch[1].trim();
      const js = scriptMatch[1].trim();

      let htmlContent = previewCode;
      htmlContent = htmlContent.replace(/<style[^>]*>[\s\S]*?<\/style>/i, '<link rel="stylesheet" href="styles.css">');
      htmlContent = htmlContent.replace(/<script[^>]*>[\s\S]*?<\/script>/i, '<script src="script.js"></script>');

      const files = [
        { name: "index.html", content: htmlContent },
        { name: "styles.css", content: css },
        { name: "script.js", content: js },
        { name: "README.md", content: `# ${titleMatch?.[1] || "My Project"}\n\nBuilt with Afro AI — afroaigroup.com\n\n## How to Use\n1. Open index.html in your browser\n2. Or deploy to any web hosting service\n\n## Files\n- index.html — Main page\n- styles.css — Styling\n- script.js — Functionality` },
      ];

      const folderPrefix = projectName + "/";
      const textEncoder = new TextEncoder();
      const fileEntries: { name: string; data: Uint8Array }[] = files.map(f => ({
        name: folderPrefix + f.name,
        data: textEncoder.encode(f.content),
      }));

      const zipParts: Uint8Array[] = [];
      const centralDir: Uint8Array[] = [];
      let offset = 0;

      for (const entry of fileEntries) {
        const nameBytes = textEncoder.encode(entry.name);
        const localHeader = new Uint8Array(30 + nameBytes.length);
        const view = new DataView(localHeader.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(8, 0, true);
        view.setUint32(18, entry.data.length, true);
        view.setUint32(22, entry.data.length, true);
        view.setUint16(26, nameBytes.length, true);
        localHeader.set(nameBytes, 30);

        zipParts.push(localHeader, entry.data);

        const cdEntry = new Uint8Array(46 + nameBytes.length);
        const cdView = new DataView(cdEntry.buffer);
        cdView.setUint32(0, 0x02014b50, true);
        cdView.setUint16(4, 20, true);
        cdView.setUint16(6, 20, true);
        cdView.setUint16(12, 0, true);
        cdView.setUint32(20, entry.data.length, true);
        cdView.setUint32(24, entry.data.length, true);
        cdView.setUint16(28, nameBytes.length, true);
        cdView.setUint32(42, offset, true);
        cdEntry.set(nameBytes, 46);
        centralDir.push(cdEntry);

        offset += localHeader.length + entry.data.length;
      }

      const cdOffset = offset;
      let cdSize = 0;
      centralDir.forEach(cd => { zipParts.push(cd); cdSize += cd.length; });

      const endRecord = new Uint8Array(22);
      const endView = new DataView(endRecord.buffer);
      endView.setUint32(0, 0x06054b50, true);
      endView.setUint16(8, fileEntries.length, true);
      endView.setUint16(10, fileEntries.length, true);
      endView.setUint32(12, cdSize, true);
      endView.setUint32(16, cdOffset, true);
      zipParts.push(endRecord);

      const zipBlob = new Blob(zipParts, { type: "application/zip" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Project Downloaded!", description: `${projectName}.zip — includes HTML, CSS, JS, and README files.` });
    } else {
      const blob = new Blob([previewCode], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded!", description: "Your project has been downloaded as an HTML file." });
    }
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

      // Extract title from generated HTML to find the correct matching app
      const titleMatch = code.match(/<title[^>]*>([^<]+)<\/title>/i);
      const generatedTitle = titleMatch ? titleMatch[1].trim() : "";

      // Find a published app whose title matches the generated app's title (case-insensitive)
      const matchedApp = apps.find((a: any) =>
        generatedTitle && a.title && a.title.toLowerCase() === generatedTitle.toLowerCase()
      );

      // Only auto-publish if we found a matching app — never overwrite a different project
      if (!matchedApp) {
        setAutoPublishStatus("test-passed");
        toast({ title: "Ready to Publish", description: "Tests passed! Click 'Publish to Web' to go live." });
        setTimeout(() => setAutoPublishStatus("idle"), 4000);
        return;
      }

      const existingApp = matchedApp;
      setAutoPublishStatus("publishing");

      const publishRes = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subdomain: existingApp.subdomain,
          htmlContent: code,
          title: existingApp.title,
        }),
      });

      const reader = publishRes.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let publishUrl = "";

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
            if (data.type === "result") publishUrl = data.url;
            if (data.type === "error") throw new Error(data.message);
          } catch (e: any) {
            if (e.message && e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }

      if (!publishUrl) throw new Error("Publish failed — no URL returned");

      setAutoPublishStatus("published");
      queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
      toast({
        title: "Auto-Published!",
        description: `Your app has been updated at ${publishUrl}`,
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

  const handleImportUrl = async () => {
    if (!importUrl.trim()) return;
    setImportLoading(true);
    try {
      const res = await apiRequest("POST", "/api/import/url", { url: importUrl.trim() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setPreviewCode(data.html);
      setShowPreview(true);
      const label = data.title || importUrl;
      setImportSuccess(`Loaded "${label}" — ${data.html.length.toLocaleString()} characters`);
      setInput(`I've imported my website from ${importUrl}. Please help me redesign and improve it.`);
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportZip = async () => {
    if (!importZipFile) return;
    setImportLoading(true);
    try {
      const form = new FormData();
      form.append("file", importZipFile);
      const res = await fetch("/api/import/zip", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setPreviewCode(data.html);
      setShowPreview(true);
      setImportSuccess(`Extracted "${data.filename}" from ${data.fileCount} file(s) in the ZIP`);
      setInput(`I've uploaded my existing website as a ZIP. Please help me redesign and improve it.`);
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setImportLoading(false);
    }
  };

  const handleVerify = () => {
    setInput("Verify my app thoroughly: check for any undefined functions that are called but never declared, phantom CDN links that may not exist, broken onclick/onsubmit handlers, undefined variables, and any placeholder content (fake phone numbers, example addresses, made-up prices). List every issue you find, then fix them all in one complete corrected HTML file.");
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>("[data-testid='input-chat-message']");
      if (el) el.focus();
    }, 50);
  };

  const handleAutoFix = (errors: string[]) => {
    const errorList = errors.slice(0, 5).map(e => `- ${e}`).join("\n");
    setInput(`Fix these JavaScript errors detected in my app:\n${errorList}\n\nFind the root cause of each error and fix it without changing the design or layout. Return the complete corrected HTML file.`);
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>("[data-testid='input-chat-message']");
      if (el) el.focus();
    }, 50);
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
        {textOnly && <MarkdownText text={textOnly} />}
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

      {/* Experience Level Onboarding — shown once for all users until they set a level */}
      {user && user.experienceLevel == null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-card shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground">Quick question!</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                To give you the best experience, tell us how familiar you are with building digital products.
                <br />
                <span className="text-xs text-muted-foreground/70">You can change this anytime in your profile settings.</span>
              </p>
            </div>

            <div className="grid gap-3">
              {[
                {
                  level: "beginner",
                  emoji: "🌱",
                  title: "First timer",
                  desc: "I've never built a website or app before. I need guidance.",
                },
                {
                  level: "intermediate",
                  emoji: "⚡",
                  title: "Have tried before",
                  desc: "I've built something before or have an existing project to improve.",
                },
                {
                  level: "expert",
                  emoji: "🚀",
                  title: "Developer / Power user",
                  desc: "I code or build regularly. Just build — I'll take it from there.",
                },
              ].map(({ level, emoji, title, desc }) => (
                <button
                  key={level}
                  onClick={() => saveExperienceMutation.mutate(level)}
                  disabled={saveExperienceMutation.isPending}
                  className="group w-full flex items-start gap-4 p-4 rounded-xl border border-border/60 bg-background hover:bg-primary/5 hover:border-primary/40 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid={`button-experience-${level}`}
                >
                  <span className="text-2xl mt-0.5 shrink-0">{emoji}</span>
                  <div className="space-y-0.5">
                    <div className="font-semibold text-foreground group-hover:text-primary transition-colors">{title}</div>
                    <div className="text-sm text-muted-foreground">{desc}</div>
                  </div>
                  {saveExperienceMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin text-primary ml-auto shrink-0 mt-1" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
                    <div className="flex-1 flex flex-col gap-1.5">
                      {showSecretWarning && SecretWarningBanner}
                      <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => handleInputChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t("chat.placeholder")}
                        disabled={isStreaming}
                        className="resize-none min-h-[44px] max-h-[120px]"
                        rows={1}
                        data-testid="input-chat-message"
                      />
                    </div>
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
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8" data-testid="welcome-screen">

              {/* Greeting */}
              <div className="text-center space-y-2">
                <h1 className="text-3xl md:text-4xl font-light text-foreground/90 tracking-tight" data-testid="text-chat-welcome">
                  Hi {user?.name?.split(" ")[0] || "there"},
                </h1>
                <h2 className="text-3xl md:text-4xl font-light text-foreground/60 tracking-tight">
                  what do you want to make?
                </h2>
              </div>

              {/* Category chips — horizontally scrollable */}
              <div className="w-full max-w-xl overflow-x-auto pb-1 scrollbar-none">
                <div className="flex gap-2 w-max mx-auto px-2">
                  {[
                    { label: "Website", icon: Globe },
                    { label: "App", icon: Smartphone },
                    { label: "Game", icon: Gamepad2 },
                    { label: "Dashboard", icon: Monitor },
                    { label: "Tool", icon: Code2 },
                    { label: "Portfolio", icon: Eye },
                  ].map((cat) => (
                    <button
                      key={cat.label}
                      onClick={() => setInput((prev) => prev ? prev : `Build me a ${cat.label.toLowerCase()}: `)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full border border-border/50 bg-card/40 hover:bg-card/80 hover:border-primary/40 transition-all text-sm text-foreground/70 hover:text-foreground whitespace-nowrap"
                      data-testid={`chip-category-${cat.label.toLowerCase()}`}
                    >
                      <cat.icon className="w-3.5 h-3.5" />
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main input box */}
              <div className="w-full max-w-xl">
                <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-4 space-y-3 shadow-lg">
                  {showSecretWarning && SecretWarningBanner}
                  <Textarea
                    value={input}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (input.trim()) { setPendingWelcomeSend(true); createConvoMutation.mutate(); }
                      }
                    }}
                    placeholder="Describe your idea, Afro AI will bring it to life..."
                    className="min-h-[80px] border-0 bg-transparent resize-none focus-visible:ring-0 p-0 text-base placeholder:text-muted-foreground/50"
                    data-testid="input-welcome-message"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <label className="cursor-pointer p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground" title="Attach image">
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) { const reader = new FileReader(); reader.onload = (ev) => { const base64 = (ev.target?.result as string)?.split(",")[1]; if (base64) setPendingAttachments([{ type: "image", data: base64, mimeType: file.type, name: file.name }]); }; reader.readAsDataURL(file); }
                        }} />
                        <Plus className="w-5 h-5" />
                      </label>
                      <button
                        onClick={() => { setImportSuccess(null); setImportUrl(""); setImportZipFile(null); setShowImportDialog(true); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-primary text-xs font-medium"
                        title="Import existing website"
                        data-testid="button-import-website"
                      >
                        <Upload className="w-4 h-4" />
                        Import
                      </button>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => { if (input.trim()) { setPendingWelcomeSend(true); createConvoMutation.mutate(); } }}
                      disabled={!input.trim() || createConvoMutation.isPending}
                      className="rounded-xl px-4"
                      data-testid="button-welcome-send"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Quick suggestions — subtle, below input */}
              <div className="w-full max-w-xl space-y-2">
                <p className="text-xs text-muted-foreground/50 text-center">Try one of these</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { text: "Build a football penalty shootout game", icon: Gamepad2 },
                    { text: "Restaurant website with menu & booking", icon: Globe },
                    { text: "African endless runner game", icon: Swords },
                    { text: "Fitness tracking app with charts", icon: Smartphone },
                  ].map((s, i) => (
                    <button
                      key={i}
                      onClick={async () => {
                        setInput(s.text);
                        try {
                          const res = await apiRequest("POST", "/api/conversations", { title: s.text });
                          const convo = await res.json();
                          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
                          setActiveConversation(convo.id);
                          setTimeout(() => setInput(s.text), 100);
                        } catch {}
                      }}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/30 bg-card/20 hover:bg-card/60 hover:border-border/60 transition-all text-left text-sm text-muted-foreground hover:text-foreground"
                      data-testid={`suggestion-${i}`}
                    >
                      <s.icon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <span className="truncate">{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {!previewCode && mobileView === "preview" && (
          <div className="flex flex-col items-center justify-center w-full h-full bg-muted/20 gap-4 text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center">
              <Monitor className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">No preview yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Ask Afro AI to build something and it will appear here</p>
            </div>
            <button
              onClick={() => setMobileView("chat")}
              className="text-xs text-primary underline underline-offset-2"
            >
              Back to chat
            </button>
          </div>
        )}

        {previewCode && showPreview && (
          <div className={`${isFullscreen ? "" : "w-full md:w-1/2"} ${mobileView === "chat" ? "hidden md:flex" : "flex"}`}>
            <LivePreview
              code={previewCode}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              onClose={() => { setShowPreview(false); setIsFullscreen(false); setMobileView("chat"); }}
              onDownload={handleDownload}
              onBackToChat={() => setMobileView("chat")}
              canUndo={!!previousCode}
              onUndo={() => {
                if (previousCode) {
                  setPreviewCode(previousCode);
                  setPreviousCode(null);
                  toast({ title: "Reverted", description: "Restored your previous version." });
                }
              }}
              onVerify={handleVerify}
              onAutoFix={handleAutoFix}
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

      {/* ===== IMPORT WEBSITE DIALOG ===== */}
      <Dialog open={showImportDialog} onOpenChange={(o) => { setShowImportDialog(o); if (!o) { setImportSuccess(null); setImportZipFile(null); setImportUrl(""); } }}>
        <DialogContent className="max-w-lg" data-testid="dialog-import-website">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Import Existing Website
            </DialogTitle>
            <DialogDescription>
              Load your existing website into the editor — then ask Afro AI to redesign, update, or improve it.
            </DialogDescription>
          </DialogHeader>

          {importSuccess ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <CheckCircle2 className="w-14 h-14 text-green-500" />
              <div>
                <p className="text-lg font-semibold">Website imported!</p>
                <p className="text-sm text-muted-foreground mt-1">{importSuccess}</p>
              </div>
              <p className="text-sm text-muted-foreground">Your website is now loaded in the preview. Type a message to start editing it with AI.</p>
              <Button onClick={() => setShowImportDialog(false)} className="mt-2" data-testid="button-import-done">
                Start Editing
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="url" className="mt-2">
              <TabsList className="w-full">
                <TabsTrigger value="url" className="flex-1 gap-2" data-testid="tab-import-url">
                  <Link2 className="w-4 h-4" /> From URL
                </TabsTrigger>
                <TabsTrigger value="zip" className="flex-1 gap-2" data-testid="tab-import-zip">
                  <FileArchive className="w-4 h-4" /> Upload ZIP
                </TabsTrigger>
              </TabsList>

              {/* ---- URL TAB ---- */}
              <TabsContent value="url" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="import-url-input">Website URL</Label>
                  <Input
                    id="import-url-input"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://yourwebsite.com"
                    data-testid="input-import-url"
                    onKeyDown={(e) => e.key === "Enter" && importUrl.trim() && handleImportUrl()}
                  />
                  <p className="text-xs text-muted-foreground">We'll fetch the page HTML and load it into the editor. Works best on public pages without login walls.</p>
                </div>
                <Button
                  className="w-full"
                  disabled={!importUrl.trim() || importLoading}
                  onClick={handleImportUrl}
                  data-testid="button-import-url-submit"
                >
                  {importLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Fetching…</> : <><Globe className="w-4 h-4 mr-2" />Import from URL</>}
                </Button>
              </TabsContent>

              {/* ---- ZIP TAB ---- */}
              <TabsContent value="zip" className="space-y-4 pt-4">
                <div
                  className="border-2 border-dashed border-border/60 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all"
                  onClick={() => importZipRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.endsWith(".zip")) setImportZipFile(f); }}
                  data-testid="dropzone-import-zip"
                >
                  {importZipFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileArchive className="w-10 h-10 text-primary" />
                      <p className="font-medium text-sm">{importZipFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(importZipFile.size / 1024).toFixed(0)} KB — click to change</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FolderOpen className="w-10 h-10" />
                      <p className="font-medium text-sm">Drag & drop your ZIP here</p>
                      <p className="text-xs">or click to browse files</p>
                    </div>
                  )}
                  <input ref={importZipRef} type="file" accept=".zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportZipFile(f); }} data-testid="input-import-zip" />
                </div>
                <p className="text-xs text-muted-foreground text-center">ZIP must contain an <code className="bg-muted px-1 rounded">index.html</code> file. CSS files will be embedded automatically.</p>
                <Button
                  className="w-full"
                  disabled={!importZipFile || importLoading}
                  onClick={handleImportZip}
                  data-testid="button-import-zip-submit"
                >
                  {importLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Extracting…</> : <><Upload className="w-4 h-4 mr-2" />Import ZIP</>}
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
