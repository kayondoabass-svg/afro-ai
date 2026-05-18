import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient, inspectQuota } from "@/lib/queryClient";
import { FileTreeSidebar, saveProjectFiles, type ProjectFile } from "@/components/file-tree-sidebar";
import { VibePanel, parseVibeMarkers } from "@/components/vibe-chips";
import { NextStepsCard } from "@/components/next-steps-card";
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
  Users,
  Key,
  Upload,
  Link2,
  FileArchive,
  FolderOpen,
  CheckCircle2,
  ShieldCheck,
  History,
  Clock,
  RotateCcw,
  ChevronRight,
  Lock,
  LogIn,
  Mail,
  UserCheck,
  KeyRound,
  ArrowRight,
  Copy,
  Github,
  GitBranch,
  ChevronDown,
  BookMarked,
  MoreHorizontal,
  MousePointerClick,
  Palette,
  Type,
  Wand2,
  Zap,
  PanelBottom,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    /\bsk[-_][A-Za-z0-9]{20,}/,                        // OpenAI secret key
    /\bpk[-_][A-Za-z0-9]{20,}/,                        // Generic publishable key
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
  // Strip closed code fences first.
  let out = text.replace(/```(?:html)?\s*\n[\s\S]*?```/g, "");
  // Then strip any DANGLING open fence (truncated reply or mid-stream): everything from
  // an unclosed ```html / ``` to end-of-string.
  out = out.replace(/```(?:html)?\s*[\s\S]*$/i, "");
  return out.trim();
}

// Strip our own structured markers ([BUILD PLAN]…[/BUILD PLAN], etc.) so they
// never leak into the visible chat bubble — even when the message is still
// streaming and only the opening tag has arrived.
function stripStructuredMarkers(text: string): string {
  let out = text;
  for (const tag of ["BUILD PLAN", "REQUIREMENTS CHECK"]) {
    // Closed pair → drop entirely (the card renderer handles it separately).
    out = out.replace(new RegExp(`\\[${tag}\\][\\s\\S]*?\\[/${tag}\\]`, "g"), "");
    // Dangling open tag mid-stream → drop everything from the open tag onwards
    // so the user never sees "[BUILD PLAN] Building: …" in raw form.
    out = out.replace(new RegExp(`\\[${tag}\\][\\s\\S]*$`), "");
  }
  return out.trim();
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

type StepIcon = typeof FolderOpen;
interface StepDef {
  key: string;
  icon: StepIcon;
  label: string;
  regex: RegExp;
}

const STEP_DEFS: StepDef[] = [
  { key: "setup", icon: FolderOpen, label: "Opening your project file", regex: /<html|<!DOCTYPE/i },
  { key: "design", icon: Palette, label: "Designing the look and feel", regex: /<style|css/i },
  { key: "nav", icon: PanelBottom, label: "Building the top navigation", regex: /<nav|<header/i },
  { key: "sections", icon: Code2, label: "Creating the main sections", regex: /hero|<main|<section/i },
  { key: "fonts", icon: Type, label: "Picking the fonts", regex: /font-family|google.*font|@import.*font/i },
  { key: "images", icon: Image, label: "Placing the photos and images", regex: /<img|background-image|picsum|placeholder/i },
  { key: "buttons", icon: MousePointerClick, label: "Wiring up the buttons", regex: /<button|<a.*href|cta|btn/i },
  { key: "footer", icon: PanelBottom, label: "Building the footer", regex: /<footer/i },
  { key: "animation", icon: Wand2, label: "Adding smooth animations", regex: /animation|@keyframes|transition|transform/i },
  { key: "responsive", icon: Smartphone, label: "Making it work on every phone", regex: /media.*query|@media|responsive/i },
  { key: "interactive", icon: Zap, label: "Adding the smart features", regex: /<script|addEventListener|function\s/i },
];

interface LiveActivityTimelineProps {
  code: string;
  isComplete: boolean;
  onStepClick?: () => void;
}

function LiveActivityTimeline({ code, isComplete, onStepClick }: LiveActivityTimelineProps) {
  const doneStates = STEP_DEFS.map(s => s.regex.test(code));
  const doneCount = doneStates.filter(Boolean).length;

  // Sequential reveal: only show steps that are done + 1 in-progress step
  const revealCount = isComplete
    ? STEP_DEFS.length
    : Math.min(STEP_DEFS.length, doneCount + 1);

  const visibleSteps = STEP_DEFS.slice(0, revealCount).map((s, i) => ({
    ...s,
    done: isComplete ? doneStates[i] : doneStates[i],
    active: !isComplete && i === doneCount,
  }));

  const progress = isComplete
    ? 100
    : Math.round((doneCount / STEP_DEFS.length) * 100);

  return (
    <div className="space-y-3 bg-gradient-to-br from-card/80 to-card/40 border border-border/60 rounded-xl p-3.5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <span className="relative flex items-center justify-center w-4 h-4">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            {!isComplete && (
              <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
            )}
          </span>
          {isComplete ? "Build complete" : "Building your project…"}
        </span>
        <span className="text-xs text-primary font-bold tabular-nums">{progress}%</span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-primary via-amber-500 to-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <div className="space-y-0.5">
        <AnimatePresence initial={false}>
          {visibleSteps.map((step) => {
            const Icon = step.icon;
            const clickable = !!onStepClick && (step.done || step.active);
            return (
              <motion.button
                key={step.key}
                type="button"
                layout
                initial={{ opacity: 0, x: -8, height: 0 }}
                animate={{ opacity: 1, x: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                disabled={!clickable}
                onClick={() => clickable && onStepClick && onStepClick()}
                data-testid={`activity-step-${step.key}`}
                className={[
                  "group w-full flex items-center gap-2.5 text-left text-xs rounded-md px-2 py-1.5 transition-all",
                  clickable
                    ? "hover-elevate active-elevate-2 cursor-pointer"
                    : "cursor-default opacity-90",
                  step.active ? "bg-primary/5" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 transition-colors",
                    step.done
                      ? "bg-primary/15 text-primary"
                      : step.active
                      ? "bg-primary/10 text-primary ring-2 ring-primary/20"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {step.done ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : step.active ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </span>
                <Icon
                  className={[
                    "w-3.5 h-3.5 flex-shrink-0",
                    step.done
                      ? "text-primary/80"
                      : step.active
                      ? "text-primary"
                      : "text-muted-foreground/70",
                  ].join(" ")}
                />
                <span
                  className={[
                    "flex-1 truncate",
                    step.done
                      ? "text-foreground"
                      : step.active
                      ? "text-foreground font-medium"
                      : "text-muted-foreground",
                  ].join(" ")}
                >
                  {step.label}
                </span>
                {clickable && (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
      {onStepClick && (doneCount > 0 || isComplete) && (
        <div className="text-[10px] text-muted-foreground/70 pt-0.5 italic">
          {isComplete ? "Tap any step to see what was built" : "Tap a step to peek at what's been built so far"}
        </div>
      )}
    </div>
  );
}

function BuildProgress({ code, isComplete, onStepClick }: { code: string; isComplete: boolean; onStepClick?: () => void }) {
  return <LiveActivityTimeline code={code} isComplete={isComplete} onStepClick={onStepClick} />;
}

function StreamingBuildProgress({ content, onStepClick }: { content: string; onStepClick?: () => void }) {
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

  return <LiveActivityTimeline code={codeContent} isComplete={false} onStepClick={onStepClick} />;
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

function FeedbackPanel({ appId, publishedUrl, feedbackCopied, setFeedbackCopied, showInbox, setShowInbox, onApplyFeedback }: {
  appId: number;
  publishedUrl: string;
  feedbackCopied: boolean;
  setFeedbackCopied: (v: boolean) => void;
  showInbox: boolean;
  setShowInbox: (v: boolean) => void;
  onApplyFeedback: (text: string) => void;
}) {
  const { toast } = useToast();
  const feedbackUrl = publishedUrl + (publishedUrl.includes("?") ? "&" : "?") + "feedback=1";
  const { data, isLoading } = useQuery<{ items: any[]; openCount: number }>({
    queryKey: ["/api/published-apps", appId, "feedback"],
    queryFn: async () => {
      const r = await fetch(`/api/published-apps/${appId}/feedback`);
      if (!r.ok) throw new Error("Failed to load feedback");
      return r.json();
    },
    refetchInterval: showInbox ? 8000 : 30000,
  });
  const items = data?.items || [];
  const openCount = data?.openCount || 0;

  const resolveMut = useMutation({
    mutationFn: async ({ id, resolved }: { id: number; resolved: boolean }) => {
      return apiRequest("PATCH", `/api/published-apps/${appId}/feedback/${id}`, { resolved });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/published-apps", appId, "feedback"] }),
  });
  const deleteMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/published-apps/${appId}/feedback/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/published-apps", appId, "feedback"] }),
  });

  return (
    <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4 space-y-3" data-testid="panel-feedback">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-500 flex-shrink-0" />
          <p className="text-sm font-semibold">Get feedback from clients & friends</p>
        </div>
        {openCount > 0 && (
          <span className="bg-purple-500 text-white text-[11px] font-bold rounded-full px-2 py-0.5" data-testid="badge-feedback-count">
            {openCount} new
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Send this special link. Anyone who opens it can leave comments — no account needed. You'll see them here and Afro AI can apply them in one click.
      </p>
      <div className="flex items-center gap-2 bg-background/60 border rounded-md px-3 py-2">
        <span className="text-xs font-mono truncate flex-1 text-muted-foreground" data-testid="text-feedback-url">{feedbackUrl}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 gap-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(feedbackUrl);
              setFeedbackCopied(true);
              toast({ title: "Feedback link copied!", description: "Send it on WhatsApp to get instant feedback." });
              setTimeout(() => setFeedbackCopied(false), 2000);
            } catch {
              toast({ title: "Couldn't copy", variant: "destructive" });
            }
          }}
          data-testid="button-copy-feedback-url"
        >
          {feedbackCopied ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent("I'd love your feedback on my new site: " + feedbackUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-green-500/10 hover:bg-green-500/20 text-green-700 dark:text-green-400 text-xs font-medium"
          data-testid="link-share-feedback-whatsapp"
        >
          📲 Ask on WhatsApp
        </a>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-xs"
          onClick={() => setShowInbox(!showInbox)}
          data-testid="button-toggle-feedback-inbox"
        >
          {showInbox ? "Hide inbox" : `View inbox${items.length ? ` (${items.length})` : ""}`}
        </Button>
      </div>
      {showInbox && (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1" data-testid="list-feedback">
          {isLoading && <div className="text-xs text-muted-foreground py-3 text-center">Loading…</div>}
          {!isLoading && items.length === 0 && (
            <div className="text-xs text-muted-foreground py-4 text-center bg-background/40 rounded-md border border-dashed">
              No feedback yet. Share the link above to get the first one.
            </div>
          )}
          {items.map((fb: any) => (
            <div
              key={fb.id}
              className={`p-3 rounded-md border text-xs space-y-2 ${fb.resolved ? "bg-muted/30 border-border opacity-70" : "bg-background border-purple-500/30"}`}
              data-testid={`card-feedback-${fb.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground" data-testid={`text-feedback-name-${fb.id}`}>
                    {fb.visitorName || "Anonymous"}
                    <span className="ml-2 text-muted-foreground font-normal text-[10px]">
                      {new Date(fb.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-foreground/90 whitespace-pre-wrap break-words" data-testid={`text-feedback-msg-${fb.id}`}>{fb.message}</div>
                  {fb.elementSelector && (
                    <div className="mt-1 text-[10px] text-purple-600 dark:text-purple-400 font-mono break-all">
                      📍 {fb.elementSelector}
                    </div>
                  )}
                </div>
              </div>
              {!fb.resolved && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs bg-purple-500 hover:bg-purple-600 text-white gap-1"
                    onClick={() => {
                      const hint = `[CUSTOMER FEEDBACK] A visitor left this feedback on the published site${fb.elementSelector ? ` (about element "${fb.elementSelector}")` : ""}: "${fb.message}". Apply this change to the current code while keeping everything else identical and on-theme.`;
                      onApplyFeedback(hint);
                      resolveMut.mutate({ id: fb.id, resolved: true });
                    }}
                    data-testid={`button-apply-feedback-${fb.id}`}
                  >
                    <Sparkles className="w-3 h-3" /> Apply with AI
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => resolveMut.mutate({ id: fb.id, resolved: true })}
                    disabled={resolveMut.isPending}
                    data-testid={`button-resolve-feedback-${fb.id}`}
                  >
                    <Check className="w-3 h-3" /> Mark done
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => deleteMut.mutate(fb.id)}
                    disabled={deleteMut.isPending}
                    data-testid={`button-delete-feedback-${fb.id}`}
                  >
                    Delete
                  </Button>
                </div>
              )}
              {fb.resolved && (
                <div className="flex gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => resolveMut.mutate({ id: fb.id, resolved: false })}
                    data-testid={`button-reopen-feedback-${fb.id}`}
                  >
                    Reopen
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
                    onClick={() => deleteMut.mutate(fb.id)}
                    data-testid={`button-delete-feedback-${fb.id}`}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PublishDialog({ code, open, onOpenChange, onAutoFixSecurity }: {
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAutoFixSecurity?: (hint: string) => void;
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
  const [securityBlock, setSecurityBlock] = useState<{ warnings: { name: string; friendly: string }[]; autoFixHint: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  const [existingApp, setExistingApp] = useState<{ id?: number; subdomain: string; title: string } | null>(null);
  const [feedbackCopied, setFeedbackCopied] = useState(false);
  const [showFeedbackInbox, setShowFeedbackInbox] = useState(false);
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
              setExistingApp({ id: latest.id, subdomain: latest.subdomain, title: latest.title });
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
      setSecurityBlock(null);
      setLinkCopied(false);
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
              setExistingApp({ id: data.id, subdomain: data.subdomain || subdomain, title });
              toast({ title: "Published!", description: `Your app is live at ${data.url}` });
              queryClient.invalidateQueries({ queryKey: ["/api/published-apps"] });
            } else if (data.type === "error") {
              setPublishError(data.message);
              if (data.kind === "security" && Array.isArray(data.warnings) && data.autoFixHint) {
                setSecurityBlock({ warnings: data.warnings, autoFixHint: data.autoFixHint });
              }
              toast({ title: "We couldn't publish yet", description: data.message, variant: "destructive" });
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
            {publishError && !securityBlock && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-2">
                <p className="text-sm text-red-500" data-testid="text-publish-error">{publishError}</p>
              </div>
            )}
            {securityBlock && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mt-2 space-y-3" data-testid="block-security-fix">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                      Almost there — your app uses a few features we can't allow on the open web for safety:
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-amber-700/90 dark:text-amber-300/90 list-disc list-inside">
                      {securityBlock.warnings.map((w, i) => (
                        <li key={i}><strong>{w.name}</strong> — {w.friendly}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-2">
                      Don't worry — Afro AI can fix this for you in a few seconds.
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => {
                    if (onAutoFixSecurity && securityBlock.autoFixHint) {
                      onAutoFixSecurity(securityBlock.autoFixHint);
                      onOpenChange(false);
                    }
                  }}
                  data-testid="button-auto-fix-security"
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  Let Afro AI fix this for me
                </Button>
              </div>
            )}
            {publishedUrl && (
              <div className="space-y-3 mt-2">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-sm font-semibold text-green-600 dark:text-green-400">Your app is live!</p>
                  </div>
                  <div className="flex items-center gap-2 bg-background/60 border rounded-md px-3 py-2">
                    <a
                      href={publishedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium text-sm truncate flex-1"
                      data-testid="link-published-url"
                    >
                      {publishedUrl}
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 gap-1"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(publishedUrl);
                          setLinkCopied(true);
                          toast({ title: "Link copied!", description: "Paste it anywhere to share." });
                          setTimeout(() => setLinkCopied(false), 2000);
                        } catch {
                          toast({ title: "Couldn't copy", description: "Long-press the link to copy it manually.", variant: "destructive" });
                        }
                      }}
                      data-testid="button-copy-published-url"
                    >
                      {linkCopied ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                    </Button>
                    <a
                      href={publishedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary"
                      title="Open in new tab"
                      data-testid="link-open-published-url"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 items-center">
                    <div className="bg-white p-2 rounded-md border flex-shrink-0" data-testid="img-published-qr">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&data=${encodeURIComponent(publishedUrl)}`}
                        alt="QR code to open your app"
                        width={120}
                        height={120}
                        className="w-[120px] h-[120px] block"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex-1 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground mb-1">📱 Scan to open on a phone</p>
                      <p>Show this code to a friend or customer — they just point their phone camera at it and your app opens. No typing.</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent("Check out my new site: " + publishedUrl)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-500/10 hover:bg-green-500/20 text-green-700 dark:text-green-400 text-xs font-medium"
                          data-testid="link-share-whatsapp"
                        >
                          Share on WhatsApp
                        </a>
                        <a
                          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publishedUrl)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-medium"
                          data-testid="link-share-facebook"
                        >
                          Share on Facebook
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
                {existingApp?.id && (
                  <FeedbackPanel
                    appId={existingApp.id}
                    publishedUrl={publishedUrl}
                    feedbackCopied={feedbackCopied}
                    setFeedbackCopied={setFeedbackCopied}
                    showInbox={showFeedbackInbox}
                    setShowInbox={setShowFeedbackInbox}
                    onApplyFeedback={(text) => {
                      if (onAutoFixSecurity) {
                        onAutoFixSecurity(text);
                        onOpenChange(false);
                      }
                    }}
                  />
                )}
                <NextStepsCard
                  appId={existingApp?.id}
                  publishedUrl={publishedUrl}
                  appCode={code}
                  onClose={() => onOpenChange(false)}
                />
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

function LivePreview({ code, isFullscreen, onToggleFullscreen, onClose, onDownload, onBackToChat, onUndo, canUndo, onAutoFix, onVerify, onShowHistory, historyCount, onAddAuth, onGithubExport, onSelectElement, isSelectMode, onToggleSelectMode }: {
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
  onShowHistory?: () => void;
  historyCount?: number;
  onAddAuth?: () => void;
  onGithubExport?: (mode: "gist" | "repo") => void;
  onSelectElement?: (sel: { selector: string; tagName: string; textPreview: string; outerHtmlPreview: string }) => void;
  isSelectMode?: boolean;
  onToggleSelectMode?: () => void;
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

  // Listen for JS errors AND element-selection messages from inside the iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "afroai-iframe-error") {
        const msg = String(e.data.message || "Unknown error");
        setIframeErrors(prev => prev.includes(msg) ? prev : [...prev, msg]);
        setErrorsDismissed(false);
      } else if (e.data?.type === "afroai-element-selected" && onSelectElement) {
        onSelectElement({
          selector: String(e.data.selector || ""),
          tagName: String(e.data.tagName || ""),
          textPreview: String(e.data.textPreview || ""),
          outerHtmlPreview: String(e.data.outerHtmlPreview || ""),
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSelectElement]);

  // Toggle select-mode inside the iframe via postMessage when prop changes
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: "afroai-set-select-mode", enabled: !!isSelectMode }, "*");
  }, [isSelectMode, code]);

  // Inject error-catcher + element-picker scripts so iframe errors and clicks bubble up
  const instrumentedCode = useMemo(() => {
    const errorScript = `<script>(function(){function s(m){try{window.parent.postMessage({type:'afroai-iframe-error',message:m},'*')}catch(e){}}window.addEventListener('error',function(e){var msg=e.message||'';if(!msg||msg==='Script error'||msg==='Script error.')return;if(!e.filename||e.filename.indexOf(location.origin)===-1&&e.filename!=='')return;s(msg)});window.addEventListener('unhandledrejection',function(e){var r=e.reason;if(!r)return;var m=r.message?r.message:String(r);if(m==='Script error'||m==='Script error.')return;s(m)})})();<\/script>`;
    const pickerScript = `<script>(function(){var on=false,hov=null;var st=document.createElement('style');st.textContent='[data-afroai-hover]{outline:2px dashed #F59E0B!important;outline-offset:2px!important;cursor:crosshair!important;background:rgba(245,158,11,0.08)!important}html.afroai-pick *{cursor:crosshair!important}';document.head.appendChild(st);function sel(el){if(el.id)return el.tagName.toLowerCase()+'#'+el.id;var p=[],n=el,depth=0;while(n&&n.nodeType===1&&depth<5){var s=n.tagName.toLowerCase();if(n.className&&typeof n.className==='string'){var c=n.className.trim().split(/\\s+/).slice(0,2).join('.');if(c)s+='.'+c}var par=n.parentNode;if(par&&par.children){var sib=Array.prototype.filter.call(par.children,function(x){return x.tagName===n.tagName});if(sib.length>1)s+=':nth-of-type('+(Array.prototype.indexOf.call(sib,n)+1)+')'}p.unshift(s);n=n.parentElement;depth++}return p.join(' > ')}function clr(){if(hov){hov.removeAttribute('data-afroai-hover');hov=null}}function over(e){if(!on)return;clr();hov=e.target;hov.setAttribute('data-afroai-hover','1')}function out(){if(!on)return;clr()}function clk(e){if(!on)return;e.preventDefault();e.stopPropagation();var el=e.target;var oh=el.outerHTML||'';if(oh.length>500)oh=oh.slice(0,500)+'...';var tx=(el.innerText||el.textContent||'').trim().slice(0,140);try{window.parent.postMessage({type:'afroai-element-selected',selector:sel(el),tagName:el.tagName.toLowerCase(),textPreview:tx,outerHtmlPreview:oh},'*')}catch(_){}clr();on=false;document.documentElement.classList.remove('afroai-pick')}document.addEventListener('mouseover',over,true);document.addEventListener('mouseout',out,true);document.addEventListener('click',clk,true);window.addEventListener('message',function(e){if(e.data&&e.data.type==='afroai-set-select-mode'){on=!!e.data.enabled;if(on)document.documentElement.classList.add('afroai-pick');else{document.documentElement.classList.remove('afroai-pick');clr()}}})})();<\/script>`;
    const inject = errorScript + pickerScript;
    if (code.includes('<head>')) return code.replace('<head>', '<head>' + inject);
    if (/<html/i.test(code)) return code.replace(/<html[^>]*>/i, m => m + inject);
    return inject + code;
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
          {/* Desktop toolbar — hidden on mobile */}
          <div className="hidden sm:flex items-center gap-1">
            <div className="flex items-center border rounded-md mr-2">
              <Button size="icon" variant={previewDevice === "desktop" ? "default" : "ghost"} className="h-7 w-7 rounded-r-none" onClick={() => setPreviewDevice("desktop")} title="Desktop" data-testid="button-chat-preview-desktop">
                <Monitor className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant={previewDevice === "tablet" ? "default" : "ghost"} className="h-7 w-7 rounded-none border-x" onClick={() => setPreviewDevice("tablet")} title="Tablet" data-testid="button-chat-preview-tablet">
                <Tablet className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant={previewDevice === "phone" ? "default" : "ghost"} className="h-7 w-7 rounded-l-none" onClick={() => setPreviewDevice("phone")} title="Phone" data-testid="button-chat-preview-phone">
                <Smartphone className="w-3.5 h-3.5" />
              </Button>
            </div>
            {onToggleSelectMode && (
              <Button
                size="sm"
                variant={isSelectMode ? "default" : "outline"}
                onClick={onToggleSelectMode}
                className={`gap-1 ${isSelectMode ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500" : "border-border/60 hover:border-amber-400/60 hover:text-amber-500"}`}
                title={isSelectMode ? "Click an element on the page (or press here to cancel)" : "Click any part of your page to edit just that section"}
                data-testid="button-toggle-select-element"
              >
                <MousePointerClick className="w-3 h-3" />
                <span className="hidden lg:inline">{isSelectMode ? "Click an element..." : "Edit Section"}</span>
              </Button>
            )}
            {onAddAuth && (
              <Button size="sm" variant="outline" onClick={onAddAuth} className="gap-1 border-border/60 hover:border-amber-400/60 hover:text-amber-500" title="Add login" data-testid="button-add-auth">
                <Lock className="w-3 h-3" /><span className="hidden lg:inline">Add Login</span>
              </Button>
            )}
            {onShowHistory && (
              <Button size="sm" variant="outline" onClick={onShowHistory} className="gap-1 border-border/60 hover:border-primary/40 hover:text-primary relative" title="Version history" data-testid="button-version-history">
                <History className="w-3 h-3" /><span className="hidden lg:inline">History</span>
                {historyCount != null && historyCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {historyCount > 9 ? "9+" : historyCount}
                  </span>
                )}
              </Button>
            )}
            {onVerify && (
              <Button size="sm" variant="outline" onClick={onVerify} className="gap-1 border-primary/30 text-primary hover:bg-primary/10" title="Verify" data-testid="button-verify-app">
                <ShieldCheck className="w-3 h-3" /><span className="hidden lg:inline">Verify</span>
              </Button>
            )}
            {canUndo && onUndo && (
              <Button size="icon" variant="ghost" onClick={onUndo} title="Undo" data-testid="button-undo-preview">
                <Undo2 className="w-4 h-4" />
              </Button>
            )}
            {onGithubExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" title="GitHub" data-testid="button-github-dropdown">
                    <Github className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => onGithubExport("gist")} data-testid="menu-github-gist">
                    <BookMarked className="w-4 h-4 mr-2 text-muted-foreground" />Export as Gist
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onGithubExport("repo")} data-testid="menu-github-repo">
                    <GitBranch className="w-4 h-4 mr-2 text-muted-foreground" />Push to Repository
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="icon" variant="ghost" onClick={onDownload} title="Download" data-testid="button-download-code">
              <Download className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onToggleFullscreen} title="Fullscreen" data-testid="button-toggle-fullscreen">
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-preview">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Always visible: Publish */}
          <Button size="sm" variant="default" onClick={() => setShowPublish(true)} className="gap-1" data-testid="button-publish-app">
            <Rocket className="w-3 h-3" />
            Publish
          </Button>

          {/* Mobile-only: "More" dropdown with all extra actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="sm:hidden" data-testid="button-more-actions">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setPreviewDevice("desktop")} data-testid="menu-device-desktop">
                <Monitor className="w-4 h-4 mr-2" />Desktop preview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPreviewDevice("tablet")} data-testid="menu-device-tablet">
                <Tablet className="w-4 h-4 mr-2" />Tablet preview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPreviewDevice("phone")} data-testid="menu-device-phone">
                <Smartphone className="w-4 h-4 mr-2" />Phone preview
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onAddAuth && (
                <DropdownMenuItem onClick={onAddAuth} data-testid="menu-add-auth">
                  <Lock className="w-4 h-4 mr-2" />Add Login
                </DropdownMenuItem>
              )}
              {onShowHistory && (
                <DropdownMenuItem onClick={onShowHistory} data-testid="menu-history">
                  <History className="w-4 h-4 mr-2" />Version History {historyCount ? `(${historyCount})` : ""}
                </DropdownMenuItem>
              )}
              {onVerify && (
                <DropdownMenuItem onClick={onVerify} data-testid="menu-verify">
                  <ShieldCheck className="w-4 h-4 mr-2" />Verify App
                </DropdownMenuItem>
              )}
              {canUndo && onUndo && (
                <DropdownMenuItem onClick={onUndo} data-testid="menu-undo">
                  <Undo2 className="w-4 h-4 mr-2" />Undo Last Change
                </DropdownMenuItem>
              )}
              {onGithubExport && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onGithubExport("gist")} data-testid="menu-github-gist-mobile">
                    <BookMarked className="w-4 h-4 mr-2" />Export as GitHub Gist
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onGithubExport("repo")} data-testid="menu-github-repo-mobile">
                    <GitBranch className="w-4 h-4 mr-2" />Push to Repository
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDownload} data-testid="menu-download">
                <Download className="w-4 h-4 mr-2" />Download HTML
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleFullscreen} data-testid="menu-fullscreen">
                {isFullscreen ? <Minimize2 className="w-4 h-4 mr-2" /> : <Maximize2 className="w-4 h-4 mr-2" />}
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClose} data-testid="menu-close-preview">
                <X className="w-4 h-4 mr-2" />Close Preview
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

// === FIX 3: Parse structured AI output blocks into visual cards ===
function extractBlock(text: string, tag: string): { content: string; rest: string } {
  const openTag = `[${tag}]`;
  const closeTag = `[/${tag}]`;
  const start = text.indexOf(openTag);
  const end = text.indexOf(closeTag);
  if (start === -1 || end === -1) return { content: "", rest: text };
  const content = text.slice(start + openTag.length, end).trim();
  const rest = text.slice(0, start) + text.slice(end + closeTag.length);
  return { content, rest: rest.trim() };
}

function BuildPlanCard({ content }: { content: string }) {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon !== -1) {
      const key = line.slice(0, colon).trim().toLowerCase();
      const val = line.slice(colon + 1).trim();
      fields[key] = val;
    }
  }
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2 my-2" data-testid="card-build-plan">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <span className="text-xs font-semibold text-primary uppercase tracking-wider">Build Plan</span>
      </div>
      {fields.building && (
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground font-medium">Building</p>
          <p className="text-sm text-foreground">{fields.building}</p>
        </div>
      )}
      {fields.sections && (
        <div className="flex flex-wrap gap-1">
          {fields.sections.split(",").map((s, i) => (
            <span key={i} className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 border border-primary/20">{s.trim()}</span>
          ))}
        </div>
      )}
      {fields.preserving && (
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground font-medium">Preserving</p>
          <p className="text-xs text-muted-foreground">{fields.preserving}</p>
        </div>
      )}
    </div>
  );
}

function RequirementsCheckCard({ content }: { content: string }) {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  const items = lines.filter(l => l.startsWith("•") || l.startsWith("-"));
  const footer = lines.find(l => l.startsWith("⚡"));
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 my-2" data-testid="card-requirements-check">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Requirements Check</span>
      </div>
      <p className="text-xs text-muted-foreground">To fully activate this build, you'll need:</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const clean = item.replace(/^[•\-]\s*/, "");
          const parts = clean.split(" — ");
          return (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="text-amber-400 mt-0.5 flex-shrink-0">→</span>
              <span className="text-foreground">
                <strong>{parts[0]}</strong>
                {parts[1] && <span className="text-muted-foreground"> — {parts[1]}</span>}
                {parts[2] && <span className="text-primary"> · {parts[2]}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {footer && <p className="text-xs text-amber-400/80 font-medium pt-1 border-t border-amber-500/20">{footer}</p>}
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
      elements.push(<h2 key={i} className="text-lg font-bold mt-3 mb-1 text-foreground">{renderInline(line.slice(2))}</h2>);
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
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [activeConversation, setActiveConversation] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [previousCode, setPreviousCode] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<{ selector: string; tagName: string; textPreview: string; outerHtmlPreview: string } | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [previewingVersionId, setPreviewingVersionId] = useState<number | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authStep, setAuthStep] = useState<1 | 2>(1);
  const [authType, setAuthType] = useState<"google" | "email" | "both">("google");
  const [authAppTitle, setAuthAppTitle] = useState("");
  const [firebaseConfig, setFirebaseConfig] = useState({ apiKey: "", authDomain: "", projectId: "" });
  const [injectingAuth, setInjectingAuth] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
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
  const [showFileTree, setShowFileTree] = useState(false);
  const [openedFile, setOpenedFile] = useState<ProjectFile | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qcMain = useQueryClient();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importZipFile, setImportZipFile] = useState<File | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importZipRef = useRef<HTMLInputElement>(null);
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem("afroai_github_token") || "");
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubExportMode, setGithubExportMode] = useState<"gist" | "repo">("gist");
  const [githubRepoName, setGithubRepoName] = useState("");
  const [githubExporting, setGithubExporting] = useState(false);
  const [githubResultUrl, setGithubResultUrl] = useState<string | null>(null);
  const [githubImportUrl, setGithubImportUrl] = useState("");

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

  // Resume an existing conversation via ?conversation=ID deep link (from dashboard "Continue" tile)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("conversation");
    if (resumeId) {
      const idNum = parseInt(resumeId, 10);
      if (!isNaN(idNum)) {
        setActiveConversation(idNum);
        window.history.replaceState({}, "", "/chat");
      }
    }
  }, []);

  const { data: conversations, isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: activeConvo, isLoading: loadingMessages } = useQuery<ConversationWithMessages>({
    queryKey: ["/api/conversations", activeConversation],
    enabled: !!activeConversation,
  });

  const { data: appVersionsList, refetch: refetchVersions } = useQuery<{ id: number; conversationId: number; htmlContent: string; label: string | null; createdAt: string }[]>({
    queryKey: ["/api/conversations", activeConversation, "versions"],
    queryFn: async () => {
      if (!activeConversation) return [];
      const res = await fetch(`/api/conversations/${activeConversation}/versions`, { credentials: "include" });
      return res.json();
    },
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

  // Load saved Firebase config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("afroai_firebase_config");
      if (saved) setFirebaseConfig(JSON.parse(saved));
    } catch {}
  }, []);

  // Auth code generator — wraps any HTML app with Firebase Authentication
  const generateAuthWrappedHtml = (
    originalHtml: string,
    config: { apiKey: string; authDomain: string; projectId: string },
    type: "google" | "email" | "both",
    title: string
  ): string => {
    const appName = title || "My App";
    const hasGoogle = type === "google" || type === "both";
    const hasEmail = type === "email" || type === "both";

    const googleBtn = hasGoogle ? `
      <button onclick="signInWithGoogle()" style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:12px 20px;background:#fff;color:#333;border:1.5px solid #e2e8f0;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s;margin-bottom:12px;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">
        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Continue with Google
      </button>` : "";

    const emailForm = hasEmail ? `
      <div id="email-form" style="width:100%;">
        <input id="auth-email" type="email" placeholder="Email address" style="width:100%;padding:12px 16px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:15px;background:#fff;color:#1e293b;box-sizing:border-box;margin-bottom:10px;outline:none;" onfocus="this.style.borderColor='#f59e0b'" onblur="this.style.borderColor='#e2e8f0'"/>
        <input id="auth-password" type="password" placeholder="Password" style="width:100%;padding:12px 16px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:15px;background:#fff;color:#1e293b;box-sizing:border-box;margin-bottom:12px;outline:none;" onfocus="this.style.borderColor='#f59e0b'" onblur="this.style.borderColor='#e2e8f0'"/>
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <button onclick="signInWithEmail()" style="flex:1;padding:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;">Sign In</button>
          <button onclick="registerWithEmail()" style="flex:1;padding:12px;background:transparent;color:#f59e0b;border:1.5px solid #f59e0b;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;">Register</button>
        </div>
        <button onclick="forgotPassword()" style="width:100%;background:none;border:none;color:#94a3b8;font-size:13px;cursor:pointer;text-decoration:underline;">Forgot password?</button>
      </div>` : "";

    const divider = hasGoogle && hasEmail ? `<div style="display:flex;align-items:center;gap:12px;margin:4px 0 14px;"><div style="flex:1;height:1px;background:#e2e8f0;"></div><span style="color:#94a3b8;font-size:13px;">or</span><div style="flex:1;height:1px;background:#e2e8f0;"></div></div>` : "";

    const firebaseSDKs = `
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"><\/script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"><\/script>`;

    const authScript = `
<script>
  const __fbConfig = ${JSON.stringify(config)};
  firebase.initializeApp(__fbConfig);
  const __auth = firebase.auth();

  __auth.onAuthStateChanged(function(user) {
    var overlay = document.getElementById('__auth_overlay__');
    var app = document.getElementById('__app_content__');
    var badge = document.getElementById('__user_badge__');
    if (user) {
      if (overlay) overlay.style.display = 'none';
      if (app) { app.style.display = 'block'; app.style.opacity = '1'; }
      if (badge) {
        badge.style.display = 'flex';
        var img = badge.querySelector('img');
        var name = badge.querySelector('.uname');
        if (img && user.photoURL) img.src = user.photoURL;
        if (name) name.textContent = user.displayName || user.email || 'User';
      }
    } else {
      if (overlay) overlay.style.display = 'flex';
      if (app) app.style.display = 'none';
      if (badge) badge.style.display = 'none';
    }
  });

  function signInWithGoogle() {
    var provider = new firebase.auth.GoogleAuthProvider();
    __auth.signInWithPopup(provider).catch(function(e) { showAuthError(e.message); });
  }
  function signInWithEmail() {
    var email = document.getElementById('auth-email').value;
    var pass = document.getElementById('auth-password').value;
    __auth.signInWithEmailAndPassword(email, pass).catch(function(e) { showAuthError(e.message); });
  }
  function registerWithEmail() {
    var email = document.getElementById('auth-email').value;
    var pass = document.getElementById('auth-password').value;
    __auth.createUserWithEmailAndPassword(email, pass).catch(function(e) { showAuthError(e.message); });
  }
  function forgotPassword() {
    var email = document.getElementById('auth-email').value;
    if (!email) { showAuthError('Enter your email first.'); return; }
    __auth.sendPasswordResetEmail(email).then(function() { showAuthError('Reset link sent! Check your email.'); }).catch(function(e) { showAuthError(e.message); });
  }
  function signOut() { __auth.signOut(); }
  function showAuthError(msg) {
    var el = document.getElementById('__auth_error__');
    if (el) { el.textContent = msg; el.style.display = 'block'; setTimeout(function(){ el.style.display='none'; }, 5000); }
  }
<\/script>`;

    // Inject Firebase SDKs into <head> and wrap body
    let result = originalHtml;
    if (result.includes("</head>")) {
      result = result.replace("</head>", `${firebaseSDKs}\n</head>`);
    } else {
      result = firebaseSDKs + result;
    }

    const overlay = `
<div id="__auth_overlay__" style="position:fixed;inset:0;z-index:99999;background:linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#78350f 100%);display:flex;align-items:center;justify-content:center;padding:20px;">
  <div style="background:#fff;border-radius:20px;padding:36px 32px;width:100%;max-width:400px;box-shadow:0 25px 60px rgba(0,0,0,0.4);">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="width:56px;height:56px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:26px;">🔐</div>
      <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f172a;">${appName}</h2>
      <p style="margin:0;color:#64748b;font-size:14px;">Sign in to access this app</p>
    </div>
    ${googleBtn}
    ${divider}
    ${emailForm}
    <div id="__auth_error__" style="display:none;margin-top:12px;padding:10px 14px;background:#fef2f2;color:#dc2626;border-radius:8px;font-size:13px;text-align:center;"></div>
    <p style="text-align:center;margin:16px 0 0;color:#94a3b8;font-size:12px;">Secured with Firebase Authentication · Built with Afro AI</p>
  </div>
</div>

<div id="__user_badge__" style="position:fixed;bottom:16px;right:16px;z-index:99998;display:none;align-items:center;gap:8px;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);padding:8px 14px 8px 8px;border-radius:50px;color:#fff;font-size:13px;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
  <img style="width:28px;height:28px;border-radius:50%;object-fit:cover;background:#f59e0b;" src="" alt="User"/>
  <span class="uname" style="font-weight:500;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
  <button onclick="signOut()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;padding:4px 10px;border-radius:20px;font-size:12px;cursor:pointer;margin-left:4px;">Sign out</button>
</div>`;

    // Wrap body content
    if (result.includes("<body")) {
      result = result.replace(/(<body[^>]*>)([\s\S]*)(<\/body>)/i, `$1\n${overlay}\n<div id="__app_content__" style="display:none;">$2</div>\n${authScript}\n$3`);
    } else {
      result = `${overlay}\n<div id="__app_content__" style="display:none;">${result}</div>\n${authScript}`;
    }

    return result;
  };

  const handleInjectAuth = () => {
    if (!previewCode) return;
    localStorage.setItem("afroai_firebase_config", JSON.stringify(firebaseConfig));
    setInjectingAuth(true);
    setTimeout(() => {
      const wrapped = generateAuthWrappedHtml(previewCode, firebaseConfig, authType, authAppTitle);
      setPreviousCode(previewCode);
      setPreviewCode(wrapped);
      setShowPreview(true);
      setInjectingAuth(false);
      setShowAuthModal(false);
      setAuthStep(1);
      toast({ title: "Login added!", description: "Your app now requires sign-in. Publish it to go live." });
    }, 600);
  };

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

  // Auto-save project files to D1 whenever new code is generated
  useEffect(() => {
    if (previewCode && activeConversation) {
      saveProjectFiles(activeConversation, previewCode).then(() => {
        qcMain.invalidateQueries({ queryKey: ["/api/d1/project-files", activeConversation] });
      });
    }
  }, [previewCode, activeConversation]);

  const handleFileOpen = (file: ProjectFile) => {
    setOpenedFile(file);
    setEditorContent(file.content || "");
    setEditorDirty(false);
  };

  const handleEditorSave = useCallback(async (contentToSave?: string) => {
    if (!openedFile) return;
    const saveContent = contentToSave ?? editorContent;
    try {
      setAutoSaveStatus("saving");
      await apiRequest("PUT", `/api/d1/project-files/${openedFile.id}`, { content: saveContent });
      setEditorDirty(false);
      setAutoSaveStatus("saved");
      setOpenedFile(prev => prev ? { ...prev, content: saveContent } : null);
      qcMain.invalidateQueries({ queryKey: ["/api/d1/project-files", activeConversation] });
      setTimeout(() => setAutoSaveStatus("idle"), 2000);
    } catch {
      setAutoSaveStatus("idle");
    }
  }, [openedFile, editorContent, activeConversation, qcMain]);

  const handleEditorChange = useCallback((value: string) => {
    setEditorContent(value);
    setEditorDirty(true);
    setAutoSaveStatus("idle");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      handleEditorSave(value);
    }, 2000);
  }, [handleEditorSave]);

  const uploadFiles = async (files: File[] | FileList) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      for (const f of list) formData.append("files", f);
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
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Drag-and-drop into the chat input area. We accept any file the /api/upload
  // endpoint already accepts (images, video, PDFs etc — server enforces type/size).
  const dragCounterRef = useRef(0);
  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragOver(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragOver(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) await uploadFiles(files);
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
      apiRequest("POST", "/api/zip-exports", { projectName, conversationId: activeConversation, fileCount: files.length }).catch(() => {});
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
      apiRequest("POST", "/api/zip-exports", { projectName, conversationId: activeConversation, fileCount: 1 }).catch(() => {});
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

  const handleGithubExport = (mode: "gist" | "repo") => {
    setGithubExportMode(mode);
    setGithubResultUrl(null);
    setShowGithubModal(true);
  };

  const handleGistExport = async () => {
    if (!previewCode) return;
    setGithubExporting(true);
    try {
      const titleMatch = previewCode.match(/<title>([^<]+)<\/title>/i);
      const title = titleMatch?.[1]?.trim() || "My Afro AI App";
      const filename = title.replace(/[^a-z0-9]/gi, "-").toLowerCase() + ".html";
      const res = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers: { "Authorization": `token ${githubToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          description: `${title} — built with Afro AI`,
          public: true,
          files: { [filename]: { content: previewCode } },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create Gist");
      setGithubResultUrl(data.html_url);
      localStorage.setItem("afroai_github_token", githubToken);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setGithubExporting(false);
    }
  };

  const handleRepoExport = async () => {
    if (!previewCode || !githubRepoName.trim()) return;
    setGithubExporting(true);
    try {
      const userRes = await fetch("https://api.github.com/user", {
        headers: { "Authorization": `token ${githubToken}` },
      });
      const userData = await userRes.json();
      if (!userRes.ok) throw new Error(userData.message || "Invalid GitHub token");
      const username = userData.login;
      const repoName = githubRepoName.trim().replace(/\s+/g, "-").toLowerCase();

      const repoCheck = await fetch(`https://api.github.com/repos/${username}/${repoName}`, {
        headers: { "Authorization": `token ${githubToken}` },
      });
      if (!repoCheck.ok) {
        const createRes = await fetch("https://api.github.com/user/repos", {
          method: "POST",
          headers: { "Authorization": `token ${githubToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: repoName, description: "Built with Afro AI", auto_init: false }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.message || "Could not create repository");
      }

      const fileCheck = await fetch(`https://api.github.com/repos/${username}/${repoName}/contents/index.html`, {
        headers: { "Authorization": `token ${githubToken}` },
      });
      const fileData = fileCheck.ok ? await fileCheck.json() : null;
      const content = btoa(unescape(encodeURIComponent(previewCode)));

      const pushRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/contents/index.html`, {
        method: "PUT",
        headers: { "Authorization": `token ${githubToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Update app — built with Afro AI",
          content,
          ...(fileData?.sha ? { sha: fileData.sha } : {}),
        }),
      });
      const pushData = await pushRes.json();
      if (!pushRes.ok) throw new Error(pushData.message || "Failed to push file");
      setGithubResultUrl(`https://github.com/${username}/${repoName}`);
      localStorage.setItem("afroai_github_token", githubToken);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setGithubExporting(false);
    }
  };

  const handleGithubImport = async () => {
    if (!githubImportUrl.trim()) return;
    setImportLoading(true);
    try {
      let rawUrl = githubImportUrl.trim();
      let filename = "app.html";

      if (/gist\.github\.com\/[^/]+\/[a-f0-9]+/.test(rawUrl)) {
        const match = rawUrl.match(/gist\.github\.com\/[^/]+\/([a-f0-9]+)/);
        if (match) {
          const gistRes = await fetch(`https://api.github.com/gists/${match[1]}`);
          const gistData = await gistRes.json();
          if (!gistRes.ok) throw new Error("Could not fetch Gist");
          const files = Object.values(gistData.files) as any[];
          const htmlFile = files.find(f => f.filename?.endsWith(".html")) || files[0];
          filename = htmlFile.filename;
          const html = htmlFile.content || await fetch(htmlFile.raw_url).then(r => r.text());
          setPreviewCode(html);
          setShowPreview(true);
          setImportSuccess(`Loaded "${filename}" from GitHub Gist`);
          setInput(`I've imported my app from a GitHub Gist. Please help me continue building it.`);
          return;
        }
      }

      if (rawUrl.includes("github.com") && rawUrl.includes("/blob/")) {
        rawUrl = rawUrl.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
      }

      if (!rawUrl.startsWith("http")) throw new Error("Please enter a valid GitHub URL");
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error("Could not fetch file from GitHub");
      const html = await res.text();
      filename = rawUrl.split("/").pop()?.split("?")[0] || "app.html";
      setPreviewCode(html);
      setShowPreview(true);
      setImportSuccess(`Loaded "${filename}" from GitHub`);
      setInput(`I've imported my app from GitHub. Please help me continue building it.`);
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

  // === FIX 1: Auto-Fix sends directly to AI without requiring user to press Send ===
  const sendDirectMessage = async (text: string) => {
    if (!activeConversation || isStreaming) return;
    setIsStreaming(true);
    setStreamingContent("");

    const optimisticMsg: Message = {
      id: Date.now(),
      conversationId: activeConversation,
      role: "user",
      content: text,
      createdAt: new Date(),
    };
    queryClient.setQueryData<ConversationWithMessages>(
      ["/api/conversations", activeConversation],
      (old) => old ? { ...old, messages: [...(old.messages || []), optimisticMsg] } : old
    );

    try {
      const response = await fetch(`/api/conversations/${activeConversation}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: text, language }),
      });
      if (!response.ok) {
        const errText = await response.text();
        inspectQuota(response, errText);
        throw new Error("Failed");
      }
      inspectQuota(response);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No body");
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
            if (data.content) { fullResponse += data.content; setStreamingContent(fullResponse); }
            if (data.done) {
              setStreamingContent("");
              setIsStreaming(false);
              queryClient.invalidateQueries({ queryKey: ["/api/conversations", activeConversation] });
              queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
              const generatedCode = extractAllCodeBlocks(fullResponse);
              if (generatedCode) runAutoTestAndPublish(generatedCode);
            }
          } catch {}
        }
      }
    } catch {
      toast({ title: "Error", description: "Auto-fix failed. Please try again.", variant: "destructive" });
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  const handleAutoFix = (errors: string[]) => {
    const errorList = errors.slice(0, 5).map(e => `- ${e}`).join("\n");
    sendDirectMessage(`Fix these JavaScript errors detected in my app:\n${errorList}\n\nFind the root cause of each error and fix it without changing the design or layout. Return the complete corrected HTML file.`);
  };

  const handleSend = async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || !activeConversation || isStreaming) return;

    const baseMessage = input.trim() || "Check these attachments";
    const currentAttachments = [...pendingAttachments];
    const targetedSel = selectedElement;
    const userMessage = targetedSel
      ? `[TARGETED EDIT — change ONLY this element, leave the rest of the app untouched]\nSelector: ${targetedSel.selector}\nElement: <${targetedSel.tagName}>\nCurrent text: ${targetedSel.textPreview || "(no text)"}\nCurrent HTML snippet: ${targetedSel.outerHtmlPreview}\n\nUser request: ${baseMessage}`
      : baseMessage;
    setInput("");
    setPendingAttachments([]);
    setSelectedElement(null);
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
          language,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        inspectQuota(response, errText);
        throw new Error("Failed to send message");
      }
      inspectQuota(response);

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
                // Refetch version history after a short delay to allow server to finish saving
                setTimeout(() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/conversations", activeConversation, "versions"] });
                }, 1500);
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
    let textOnly = removeCodeBlock(content);

    // === FIX 3: Extract structured blocks and render as visual cards ===
    const planResult = extractBlock(textOnly, "BUILD PLAN");
    const planContent = planResult.content;
    if (planContent) textOnly = planResult.rest;

    const reqResult = extractBlock(textOnly, "REQUIREMENTS CHECK");
    const reqContent = reqResult.content;
    if (reqContent) textOnly = reqResult.rest;

    const vibeParsed = parseVibeMarkers(textOnly);
    textOnly = vibeParsed.cleanText;

    // Final safety net: if a reply was truncated (token cap, network) and left
    // a dangling [BUILD PLAN] open tag with no close, the extractor above
    // won't have matched. Strip any such stragglers so users never see raw
    // markers like "[BUILD PLAN] Building: …" or trailing "```html".
    textOnly = stripStructuredMarkers(textOnly);

    return (
      <div className="space-y-3">
        {reqContent && <RequirementsCheckCard content={reqContent} />}
        {planContent && <BuildPlanCard content={planContent} />}
        <VibePanel text={content} code={code} />
        {textOnly && <MarkdownText text={textOnly} />}
        {code && (
          <>
            <BuildProgress code={code} isComplete={true} onStepClick={() => handleViewCode(content)} />
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

      {/* File Tree Sidebar */}
      {showFileTree && activeConversation && (
        <FileTreeSidebar
          conversationId={activeConversation}
          openedFileId={openedFile?.id ?? null}
          onFileOpen={handleFileOpen}
          onClose={() => { setShowFileTree(false); setOpenedFile(null); }}
        />
      )}

      <div className="flex-1 flex">
        <div className={`flex flex-col ${previewCode && showPreview ? `${mobileView === "preview" ? "hidden" : "flex"} lg:flex lg:w-1/2 lg:min-w-[320px]` : "flex-1"} ${previewCode ? "pb-14 lg:pb-0" : ""}`}>
          {activeConversation ? (
            <>
              {previewCode && (
                <div className="hidden lg:flex items-center justify-between gap-2 px-4 py-2 border-b bg-card/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Code2 className="w-4 h-4 text-primary" />
                    <span>Building Mode</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Toggle file tree"
                      onClick={() => setShowFileTree(!showFileTree)}
                      data-testid="button-toggle-filetree"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setShowPreview(!showPreview)}
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
                            {stripStructuredMarkers(removeCodeBlock(streamingContent)) && (
                              <p className="whitespace-pre-wrap break-words">{stripStructuredMarkers(removeCodeBlock(streamingContent))}</p>
                            )}
                            <StreamingBuildProgress
                              content={streamingContent}
                              onStepClick={() => {
                                // First try the strict extractor (works once a code block is closed)
                                let partialCode = extractAllCodeBlocks(streamingContent);
                                // Fallback for in-progress streams: grab everything from the opening fence/tag onwards
                                if (!partialCode) {
                                  const c = streamingContent;
                                  const fenceIdx = c.indexOf("```html");
                                  const docIdx = c.indexOf("<!DOCTYPE");
                                  const htmlIdx = c.indexOf("<html");
                                  const start =
                                    fenceIdx >= 0
                                      ? fenceIdx + 7
                                      : Math.min(
                                          docIdx >= 0 ? docIdx : Number.POSITIVE_INFINITY,
                                          htmlIdx >= 0 ? htmlIdx : Number.POSITIVE_INFINITY,
                                        );
                                  if (Number.isFinite(start)) {
                                    let raw = c.substring(start as number).trim();
                                    // Auto-close so the iframe can render the partial document
                                    if (!/<\/html>/i.test(raw)) {
                                      if (!/<\/body>/i.test(raw)) raw += "\n</body>";
                                      raw += "\n</html>";
                                    }
                                    partialCode = raw;
                                  }
                                }
                                if (partialCode) {
                                  setPreviewCode(partialCode);
                                  setShowPreview(true);
                                  setMobileView("preview");
                                }
                              }}
                            />
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

              <div
                className="border-t p-3 bg-background relative"
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                data-testid="dropzone-chat-input"
              >
                {isDragOver && (
                  <div
                    className="absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm pointer-events-none"
                    data-testid="overlay-drop-active"
                  >
                    <div className="flex flex-col items-center gap-2 text-primary">
                      <Paperclip className="w-8 h-8" />
                      <p className="text-sm font-medium">Drop files to attach</p>
                      <p className="text-xs text-muted-foreground">Images, video, PDFs and more</p>
                    </div>
                  </div>
                )}
                <div className="max-w-2xl mx-auto space-y-2">
                  {pendingAttachments.some(a => a.mimetype.startsWith("image/")) && (
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300"
                      data-testid="hint-screenshot-to-site"
                    >
                      <span className="text-base leading-none">✨</span>
                      <span>
                        I'll recreate this layout in your Afro AI theme — just tell me what business it's for.
                      </span>
                    </div>
                  )}
                  {selectedElement && (
                    <div
                      className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/40 text-xs"
                      data-testid="chip-selected-element"
                    >
                      <MousePointerClick className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-amber-700 dark:text-amber-300">
                          Editing just this element: <code className="font-mono bg-amber-500/15 px-1 py-0.5 rounded">&lt;{selectedElement.tagName}&gt;</code>
                        </div>
                        {selectedElement.textPreview && (
                          <div className="text-amber-700/80 dark:text-amber-300/80 truncate mt-0.5">
                            "{selectedElement.textPreview}"
                          </div>
                        )}
                        <div className="text-amber-600/70 dark:text-amber-400/70 text-[10px] mt-0.5">
                          Tell me what to change — the rest of your app stays untouched.
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedElement(null)}
                        className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 flex-shrink-0"
                        data-testid="button-clear-selected-element"
                        title="Cancel targeted edit"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
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
            <div className="flex-1 overflow-y-auto min-h-0" data-testid="welcome-screen">
            <div className="flex flex-col items-center justify-center min-h-full p-4 md:p-6 gap-6 md:gap-8">

              {/* Greeting — beginner mode is bigger & friendlier */}
              {(() => {
                const isBeginner = user?.experienceLevel === "beginner";
                const greetings: Record<string, { hi: string; ask: string; beginnerAsk: string }> = {
                  en: { hi: "Hi", ask: "what do you want to make?", beginnerAsk: "what shall we build today? Just tell me in your own words." },
                  sw: { hi: "Habari", ask: "unataka kutengeneza nini?", beginnerAsk: "tutengeneze nini leo? Niambie tu kwa maneno yako." },
                  fr: { hi: "Salut", ask: "que veux-tu créer ?", beginnerAsk: "qu'est-ce qu'on construit aujourd'hui ? Dis-le-moi simplement avec tes propres mots." },
                  ar: { hi: "مرحبا", ask: "ماذا تريد أن تصنع؟", beginnerAsk: "ماذا سنبني اليوم؟ فقط أخبرني بكلماتك." },
                  pt: { hi: "Olá", ask: "o que queres criar?", beginnerAsk: "o que vamos construir hoje? Diz-me apenas pelas tuas palavras." },
                  yo: { hi: "Bawo", ask: "kini o fẹ kọ?", beginnerAsk: "kini a máa kọ́ lónìí? Sọ fún mi lọ́nà tirẹ." },
                  ha: { hi: "Sannu", ask: "me kake son ginawa?", beginnerAsk: "me za mu gina yau? Ka gaya min cikin kalmominka." },
                  zu: { hi: "Sawubona", ask: "ufuna ukwakha ini?", beginnerAsk: "sizokwakha ini namuhla? Ngitshele ngamagama akho." },
                  lg: { hi: "Ki kati", ask: "oyagala kuzimba ki?", beginnerAsk: "tuzimbe ki leero? Ŋŋamba mu bigambo byo." },
                  tw: { hi: "Akwaaba", ask: "dɛn na wopɛ sɛ woyɛ?", beginnerAsk: "dɛn na yɛbɛyɛ ɛnnɛ? Ka kyerɛ me wɔ wo nsɛm mu." },
                  hi: { hi: "नमस्ते", ask: "आप क्या बनाना चाहते हैं?", beginnerAsk: "आज हम क्या बनाएँ? अपने शब्दों में बताइए।" },
                  es: { hi: "Hola", ask: "¿qué quieres crear?", beginnerAsk: "¿qué construimos hoy? Cuéntamelo con tus propias palabras." },
                  zh: { hi: "你好", ask: "你想创建什么？", beginnerAsk: "今天我们建什么？用你自己的话告诉我就行。" },
                  gu: { hi: "નમસ્તે", ask: "તમે શું બનાવવા માંગો છો?", beginnerAsk: "આજે આપણે શું બનાવીએ? તમારા શબ્દોમાં મને કહો." },
                  ta: { hi: "வணக்கம்", ask: "என்ன உருவாக்க விரும்புகிறீர்கள்?", beginnerAsk: "இன்று என்ன கட்டுவோம்? உங்கள் வார்த்தைகளில் சொல்லுங்கள்." },
                };
                const g = greetings[language] || greetings.en;
                const firstName = user?.name?.split(" ")[0] || "";
                return (
                  <div className="text-center space-y-2">
                    <h1 className={`${isBeginner ? "text-4xl md:text-5xl" : "text-3xl md:text-4xl"} font-light text-foreground/90 tracking-tight`} data-testid="text-chat-welcome">
                      {g.hi}{firstName ? ` ${firstName}` : ""},
                    </h1>
                    <h2 className={`${isBeginner ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl"} font-light text-foreground/60 tracking-tight`}>
                      {isBeginner ? g.beginnerAsk : g.ask}
                    </h2>
                  </div>
                );
              })()}

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
                    placeholder={(() => {
                      const isBeginner = user?.experienceLevel === "beginner";
                      const ph: Record<string, { norm: string; beg: string }> = {
                        en: { norm: "Describe your idea, Afro AI will bring it to life...", beg: "e.g. 'I want a small website for my shop in Kampala that shows my prices and my WhatsApp number'" },
                        sw: { norm: "Eleza wazo lako, Afro AI itaifanya kuwa hai...", beg: "mfano: 'Nataka tovuti ndogo ya duka langu Dar inayoonyesha bei zangu na namba yangu ya WhatsApp'" },
                        fr: { norm: "Décris ton idée, Afro AI va la réaliser...", beg: "ex : 'Je veux un petit site pour ma boutique à Dakar avec mes prix et mon numéro WhatsApp'" },
                        ar: { norm: "صف فكرتك، وسيقوم Afro AI بإنشائها...", beg: "مثال: 'أريد موقع صغير لمتجري يعرض أسعاري ورقم واتساب الخاص بي'" },
                        pt: { norm: "Descreve a tua ideia, o Afro AI vai criá-la...", beg: "ex: 'Quero um pequeno site para a minha loja em Maputo com os preços e o meu WhatsApp'" },
                        yo: { norm: "Ṣàlàyé èrò rẹ, Afro AI yóò mú u wáyé...", beg: "àpẹẹrẹ: 'Mo fẹ́ ojú-òpó kékeré fún ile-iṣẹ́ mi ní Lagos pẹ̀lú owó àwọn nǹkan àti nọ́mbà WhatsApp mi'" },
                        ha: { norm: "Bayyana ra'ayinka, Afro AI zai gina shi...", beg: "misali: 'Ina son ƙaramin gidan yanar gizo don shagona a Kano da farashin kayana da lambar WhatsApp dina'" },
                        zu: { norm: "Chaza umqondo wakho, i-Afro AI izowuphilisa...", beg: "isib: 'Ngifuna iwebhusayithi encane yesitolo sami enamanani nenombolo yami ye-WhatsApp'" },
                        lg: { norm: "Nnyonnyola ekirowoozo kyo, Afro AI ajja kukikola...", beg: "ekyokulabirako: 'Njagala wansayiti ntono ey'edduka lyange erambika emiwendo ne nnamba ya WhatsApp'" },
                        tw: { norm: "Kyerɛkyerɛ w'adwene mu, Afro AI bɛyɛ...", beg: "nhwɛsoɔ: 'Mepɛ wɛbsaet ketewa bi ma me dwadwa a ɛkyerɛ me bo ne me WhatsApp number'" },
                        hi: { norm: "अपना आइडिया बताइए, Afro AI बना देगा...", beg: "उदा: 'मुझे अपनी दुकान के लिए छोटी वेबसाइट चाहिए जिसमें मेरे दाम और WhatsApp नंबर हों'" },
                        es: { norm: "Describe tu idea, Afro AI le dará vida...", beg: "ej: 'Quiero un sitio pequeño para mi tienda con mis precios y mi WhatsApp'" },
                        zh: { norm: "描述你的想法，Afro AI 会帮你实现……", beg: "例如：'我想为我在内罗毕的商店做一个简单网站，显示我的产品价格和微信/WhatsApp号码'" },
                        gu: { norm: "તમારો વિચાર જણાવો, Afro AI બનાવી દેશે...", beg: "ઉદા: 'મારે મારી દુકાન માટે નાની વેબસાઇટ જોઈએ જે મારા ભાવ અને WhatsApp નંબર બતાવે'" },
                        ta: { norm: "உங்கள் யோசனையை சொல்லுங்கள், Afro AI உருவாக்கும்...", beg: "உதா: 'எனது கடைக்கான சிறிய வலைத்தளம் வேண்டும், விலை மற்றும் WhatsApp எண் காட்ட வேண்டும்'" },
                      };
                      const p = ph[language] || ph.en;
                      return isBeginner ? p.beg : p.norm;
                    })()}
                    className={`${user?.experienceLevel === "beginner" ? "min-h-[120px] text-lg" : "min-h-[80px] text-base"} border-0 bg-transparent resize-none focus-visible:ring-0 p-0 placeholder:text-muted-foreground/50`}
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
                  {(() => {
                    const isBeginner = user?.experienceLevel === "beginner";
                    const beginnerSets: Record<string, { text: string; icon: any }[]> = {
                      en: [
                        { text: "A simple shop website that shows my products and WhatsApp number", icon: Globe },
                        { text: "A restaurant menu page with prices and a 'Call to order' button", icon: Globe },
                        { text: "A booking page where customers pick a time and pay with M-Pesa", icon: Smartphone },
                        { text: "A page about me/my business that I can share on WhatsApp", icon: Globe },
                      ],
                      sw: [
                        { text: "Tovuti ndogo ya duka inayoonyesha bidhaa zangu na namba ya WhatsApp", icon: Globe },
                        { text: "Ukurasa wa menyu ya mgahawa na bei na kitufe cha 'Piga simu kuagiza'", icon: Globe },
                        { text: "Ukurasa wa kuhifadhi ambapo wateja wanachagua muda na kulipa kwa M-Pesa", icon: Smartphone },
                        { text: "Ukurasa kuhusu mimi/biashara yangu wa kushiriki WhatsApp", icon: Globe },
                      ],
                      fr: [
                        { text: "Un petit site boutique qui montre mes produits et mon WhatsApp", icon: Globe },
                        { text: "Une page menu de restaurant avec prix et bouton 'Appeler pour commander'", icon: Globe },
                        { text: "Une page de réservation où les clients choisissent l'heure et paient", icon: Smartphone },
                        { text: "Une page à propos de mon business à partager sur WhatsApp", icon: Globe },
                      ],
                      ar: [
                        { text: "موقع متجر بسيط يعرض منتجاتي ورقم واتساب", icon: Globe },
                        { text: "صفحة قائمة مطعم بالأسعار وزر 'اتصل للطلب'", icon: Globe },
                        { text: "صفحة حجز يختار فيها العملاء الوقت ويدفعون", icon: Smartphone },
                        { text: "صفحة عني/عن مشروعي لمشاركتها على واتساب", icon: Globe },
                      ],
                      pt: [
                        { text: "Um site simples de loja com produtos e WhatsApp", icon: Globe },
                        { text: "Página de menu de restaurante com preços e botão 'Ligar para pedir'", icon: Globe },
                        { text: "Página de reservas onde clientes escolhem horário e pagam", icon: Smartphone },
                        { text: "Página sobre mim/meu negócio para partilhar no WhatsApp", icon: Globe },
                      ],
                      yo: [
                        { text: "Ojú-òpó ile-iṣẹ́ kékeré tó fi àwọn ẹrù mi àti WhatsApp han", icon: Globe },
                        { text: "Ojú-òpó menu ile-oúnjẹ pẹ̀lú owó àti bọ́tìnì 'Pe láti pàṣẹ'", icon: Globe },
                        { text: "Ojú-òpó ìfipamọ́ tí àwọn alábàárà yan àkókò tí wọ́n sì sanwó", icon: Smartphone },
                        { text: "Ojú-òpó nípa mi/ile-iṣẹ́ mi tí mò lè pín lórí WhatsApp", icon: Globe },
                      ],
                      ha: [
                        { text: "Ƙaramin gidan yanar shago wanda ke nuna kayana da WhatsApp", icon: Globe },
                        { text: "Shafin menu na gidan abinci da farashi da maɓallin 'Kira don oda'", icon: Globe },
                        { text: "Shafin ajiyar inda abokan ciniki ke zaɓar lokaci kuma su biya", icon: Smartphone },
                        { text: "Shafin game da ni/kasuwancina don rabawa a WhatsApp", icon: Globe },
                      ],
                      zu: [
                        { text: "Iwebhusayithi elula yesitolo ekhombisa imikhiqizo nenombolo ye-WhatsApp", icon: Globe },
                        { text: "Ikhasi le-menu lendawo yokudla namanani nenkinobho yokufona", icon: Globe },
                        { text: "Ikhasi lokubhukha lapho amakhasimende ekhetha isikhathi ekhokha", icon: Smartphone },
                        { text: "Ikhasi mayelana nami/ibhizinisi lami lokwabelana ku-WhatsApp", icon: Globe },
                      ],
                      lg: [
                        { text: "Wansayiti omutono ow'edduka olaga ebintu ne nnamba ya WhatsApp", icon: Globe },
                        { text: "Olupapula olw'emmere n'emiwendo ne pulani 'Kuba simu okusalawo'", icon: Globe },
                        { text: "Olupapula olw'okukuuma ekifo abakasitoma we balondamu ekiseera", icon: Smartphone },
                        { text: "Olupapula olukukwatako/olw'ebizinensi lyo okugabana ku WhatsApp", icon: Globe },
                      ],
                      tw: [
                        { text: "Wɛbsaet ketewa bi a ɛkyerɛ me dwadi ne me WhatsApp", icon: Globe },
                        { text: "Restaurant menu page a ɛwɔ bo ne 'Frɛ na to' button", icon: Globe },
                        { text: "Booking page a customers pa bere na wɔtua ka", icon: Smartphone },
                        { text: "Page bi a ɛfa me/m'adwumayɛ ho a metumi de akyɛ wɔ WhatsApp", icon: Globe },
                      ],
                      hi: [
                        { text: "एक सरल दुकान वेबसाइट जो मेरे उत्पाद और WhatsApp नंबर दिखाए", icon: Globe },
                        { text: "रेस्तराँ मेनू पेज दामों और 'ऑर्डर के लिए कॉल करें' बटन के साथ", icon: Globe },
                        { text: "बुकिंग पेज जहाँ ग्राहक समय चुनकर भुगतान करें", icon: Smartphone },
                        { text: "मेरे/मेरे बिजनेस के बारे में पेज जो WhatsApp पर शेयर हो सके", icon: Globe },
                      ],
                      es: [
                        { text: "Un sitio sencillo de tienda con productos y WhatsApp", icon: Globe },
                        { text: "Página de menú de restaurante con precios y botón 'Llamar para pedir'", icon: Globe },
                        { text: "Página de reservas donde clientes eligen hora y pagan", icon: Smartphone },
                        { text: "Página sobre mí/mi negocio para compartir en WhatsApp", icon: Globe },
                      ],
                      zh: [
                        { text: "一个简单的商店网站，展示我的产品和WhatsApp号码", icon: Globe },
                        { text: "餐厅菜单页面，带价格和'电话订餐'按钮", icon: Globe },
                        { text: "预订页面，客户选择时间并通过M-Pesa付款", icon: Smartphone },
                        { text: "关于我/我的生意的页面，可以在WhatsApp上分享", icon: Globe },
                      ],
                      gu: [
                        { text: "મારી દુકાન માટે સાદી વેબસાઇટ જે ઉત્પાદનો અને WhatsApp બતાવે", icon: Globe },
                        { text: "રેસ્ટોરન્ટ મેનુ પેજ ભાવ અને 'ઓર્ડર માટે કોલ' બટન સાથે", icon: Globe },
                        { text: "બુકિંગ પેજ જ્યાં ગ્રાહકો સમય પસંદ કરી M-Pesa થી ચૂકવે", icon: Smartphone },
                        { text: "મારા/મારા ધંધા વિશે પેજ WhatsApp પર શેર કરવા", icon: Globe },
                      ],
                      ta: [
                        { text: "எனது கடையின் தயாரிப்புகள் மற்றும் WhatsApp எண் காட்டும் எளிய வலைத்தளம்", icon: Globe },
                        { text: "உணவகம் மெனு பக்கம், விலை மற்றும் 'ஆர்டர் செய்ய அழை' பொத்தான் உடன்", icon: Globe },
                        { text: "முன்பதிவு பக்கம், வாடிக்கையாளர்கள் நேரம் தேர்வுசெய்து M-Pesa மூலம் பணம் செலுத்துவர்", icon: Smartphone },
                        { text: "எனது/எனது வணிகம் பற்றிய பக்கம், WhatsApp இல் பகிர", icon: Globe },
                      ],
                    };
                    const expertSet = [
                      { text: "Build a football penalty shootout game", icon: Gamepad2 },
                      { text: "Restaurant website with menu & booking", icon: Globe },
                      { text: "African endless runner game", icon: Swords },
                      { text: "Fitness tracking app with charts", icon: Smartphone },
                    ];
                    const list = isBeginner ? (beginnerSets[language] || beginnerSets.en) : expertSet;
                    return list;
                  })().map((s, i) => (
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

        {/* Code Editor Panel — shown when a file is opened from the file tree */}
        {openedFile && (
          <div className={`${isFullscreen ? "" : "w-full lg:w-1/2"} flex flex-col bg-background border-l`} data-testid="code-editor-panel">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-card/80 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Code2 className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm font-mono font-medium truncate">{openedFile.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {autoSaveStatus === "saving" && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-autosave-saving">
                    <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                  </span>
                )}
                {autoSaveStatus === "saved" && (
                  <span className="flex items-center gap-1 text-xs text-green-500" data-testid="text-autosave-saved">
                    <Check className="w-3 h-3" /> Saved to R2 & D1
                  </span>
                )}
                {autoSaveStatus === "idle" && editorDirty && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" data-testid="indicator-unsaved" />
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => handleEditorSave()} disabled={!editorDirty || autoSaveStatus === "saving"} data-testid="button-save-file">
                  Save now
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setOpenedFile(null); setEditorDirty(false); setAutoSaveStatus("idle"); if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); }} data-testid="button-close-editor">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <textarea
                className="w-full h-full min-h-full resize-none bg-[#1e1e1e] text-[#d4d4d4] font-mono text-xs p-4 focus:outline-none leading-relaxed"
                value={editorContent}
                onChange={e => handleEditorChange(e.target.value)}
                onKeyDown={e => { if (e.key === "s" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); handleEditorSave(); } }}
                spellCheck={false}
                data-testid="textarea-code-editor"
              />
            </div>
          </div>
        )}

        {previewCode && showPreview && !openedFile && (
          <div className={`${isFullscreen ? "" : "w-full lg:w-1/2"} ${mobileView === "chat" ? "hidden lg:flex" : "flex"}`}>
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
              onShowHistory={() => setShowHistoryPanel(true)}
              historyCount={appVersionsList?.length ?? 0}
              onAddAuth={() => { setAuthStep(1); setShowAuthModal(true); }}
              onGithubExport={handleGithubExport}
              isSelectMode={isSelectMode}
              onToggleSelectMode={() => {
                setIsSelectMode(prev => {
                  const next = !prev;
                  if (next) setSelectedElement(null);
                  return next;
                });
              }}
              onSelectElement={(el) => {
                setSelectedElement(el);
                setIsSelectMode(false);
                setMobileView("chat");
              }}
            />
          </div>
        )}

        {/* Mobile Chat/Preview tab bar — fixed at bottom, only when preview exists */}
        {previewCode && (
          <div className="fixed bottom-0 left-0 right-0 z-30 flex lg:hidden border-t bg-background/95 backdrop-blur-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <button
              onClick={() => setMobileView("chat")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mobileView === "chat" ? "text-primary border-t-2 border-primary -mt-px" : "text-muted-foreground"}`}
              data-testid="button-mobile-tab-chat"
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </button>
            <button
              onClick={() => { setShowPreview(true); setMobileView("preview"); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mobileView === "preview" ? "text-primary border-t-2 border-primary -mt-px" : "text-muted-foreground"}`}
              data-testid="button-mobile-tab-preview"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
          </div>
        )}

        {/* Version History Panel — slides in from the right */}
        {showHistoryPanel && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowHistoryPanel(false)} />
            <div className="relative w-full max-w-sm bg-background border-l shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-card/80">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Version History</span>
                  {appVersionsList && appVersionsList.length > 0 && (
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{appVersionsList.length}</span>
                  )}
                </div>
                <button onClick={() => setShowHistoryPanel(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" data-testid="button-close-history">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Info bar */}
              <div className="px-4 py-2 bg-primary/5 border-b text-xs text-muted-foreground">
                Every time the AI generates an app, a snapshot is saved automatically. Click any version to preview or restore it.
              </div>

              {/* Version list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {!appVersionsList || appVersionsList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
                    <Clock className="w-10 h-10 text-muted-foreground/30" />
                    <div>
                      <div className="font-medium text-muted-foreground text-sm">No versions yet</div>
                      <div className="text-xs text-muted-foreground/60 mt-1">Versions are saved automatically each time the AI generates a new app.</div>
                    </div>
                  </div>
                ) : (
                  appVersionsList.map((ver, idx) => {
                    const isCurrentPreview = previewCode === ver.htmlContent;
                    const date = new Date(ver.createdAt);
                    const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
                    return (
                      <div
                        key={ver.id}
                        className={`rounded-xl border p-3 space-y-2 transition-all ${isCurrentPreview ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card hover:border-border"}`}
                        data-testid={`card-version-${ver.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${idx === 0 ? "bg-primary" : "bg-muted-foreground/30"}`} />
                            <span className="font-medium text-sm truncate">{ver.label || `Version ${appVersionsList.length - idx}`}</span>
                            {idx === 0 && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">Latest</span>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-muted-foreground">{timeStr}</span>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">{dateStr}</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setPreviewingVersionId(ver.id);
                              setPreviewCode(ver.htmlContent);
                              setShowPreview(true);
                              setShowHistoryPanel(false);
                              toast({ title: `Previewing ${ver.label || "version"}`, description: "Click Restore to make it your current version, or keep browsing." });
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/60 hover:border-primary/40 hover:text-primary text-xs font-medium transition-all"
                            data-testid={`button-preview-version-${ver.id}`}
                          >
                            <Eye className="w-3 h-3" />
                            Preview
                          </button>
                          {!isCurrentPreview && (
                            <button
                              onClick={() => {
                                setPreviousCode(previewCode);
                                setPreviewCode(ver.htmlContent);
                                setPreviewingVersionId(null);
                                setShowPreview(true);
                                setShowHistoryPanel(false);
                                toast({ title: "Version restored", description: `${ver.label || "Version"} is now your active app. The previous version is saved for undo.` });
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-all"
                              data-testid={`button-restore-version-${ver.id}`}
                            >
                              <RotateCcw className="w-3 h-3" />
                              Restore
                            </button>
                          )}
                          {isCurrentPreview && (
                            <div className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              Active
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {previewCode && (
        <PublishDialog
          code={previewCode}
          open={showPublishFromChat}
          onOpenChange={setShowPublishFromChat}
          onAutoFixSecurity={(hint) => sendDirectMessage(hint)}
        />
      )}

      {/* Auth Builder Modal */}
      <Dialog open={showAuthModal} onOpenChange={(open) => { setShowAuthModal(open); if (!open) setAuthStep(1); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              Add Login to Your App
            </DialogTitle>
            <DialogDescription>
              Protect your app with real user authentication powered by Firebase — free and works instantly.
            </DialogDescription>
          </DialogHeader>

          {authStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">App name (shown on login screen)</Label>
                <Input
                  value={authAppTitle}
                  onChange={(e) => setAuthAppTitle(e.target.value)}
                  placeholder="My Awesome App"
                  data-testid="input-auth-app-title"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Authentication method</Label>
                <div className="grid gap-2">
                  {[
                    { value: "google", icon: <svg className="w-4 h-4" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>, label: "Google Sign-In", desc: "One-click login — most popular & easiest for users" },
                    { value: "email", icon: <Mail className="w-4 h-4 text-blue-500" />, label: "Email & Password", desc: "Traditional email/password with registration & forgot password" },
                    { value: "both", icon: <UserCheck className="w-4 h-4 text-green-500" />, label: "Both (recommended)", desc: "Give users the choice of Google or email sign-in" },
                  ].map(({ value, icon, label, desc }) => (
                    <button
                      key={value}
                      onClick={() => setAuthType(value as "google" | "email" | "both")}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${authType === value ? "border-amber-400/60 bg-amber-50/10" : "border-border/60 hover:border-border"}`}
                      data-testid={`button-auth-type-${value}`}
                    >
                      <div className="mt-0.5 shrink-0">{icon}</div>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {label}
                          {authType === value && <Check className="w-3.5 h-3.5 text-amber-500" />}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <Button className="w-full gap-2" onClick={() => setAuthStep(2)} data-testid="button-auth-next">
                Next: Set up Firebase
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {authStep === 2 && (
            <div className="space-y-4 py-2">
              {/* Firebase setup guide */}
              <div className="rounded-xl border border-amber-400/30 bg-amber-50/5 p-4 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-sm text-amber-600 dark:text-amber-400">
                  <KeyRound className="w-4 h-4" />
                  How to get your Firebase config (free)
                </div>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  {[
                    <>Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">console.firebase.google.com</a> → Create a project</>,
                    <>Click <strong>Add app</strong> → choose Web ({"</>"})</>,
                    <>Under <strong>Authentication</strong> → Enable {authType === "google" ? "Google" : authType === "email" ? "Email/Password" : "Google + Email/Password"} providers</>,
                    <>Go back to Project Settings → copy the <strong>firebaseConfig</strong> values below</>,
                  ].map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">API Key <span className="text-red-400">*</span></Label>
                  <Input value={firebaseConfig.apiKey} onChange={(e) => setFirebaseConfig(f => ({ ...f, apiKey: e.target.value }))} placeholder="AIzaSy..." data-testid="input-firebase-api-key" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Auth Domain <span className="text-red-400">*</span></Label>
                  <Input value={firebaseConfig.authDomain} onChange={(e) => setFirebaseConfig(f => ({ ...f, authDomain: e.target.value }))} placeholder="your-project.firebaseapp.com" data-testid="input-firebase-auth-domain" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Project ID <span className="text-red-400">*</span></Label>
                  <Input value={firebaseConfig.projectId} onChange={(e) => setFirebaseConfig(f => ({ ...f, projectId: e.target.value }))} placeholder="your-project-id" data-testid="input-firebase-project-id" />
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
                Your Firebase config is embedded directly into your app's code — it's never stored on Afro AI's servers. Firebase has a generous free tier.
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAuthStep(1)} className="flex-1" data-testid="button-auth-back">Back</Button>
                <Button
                  className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={handleInjectAuth}
                  disabled={!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || injectingAuth}
                  data-testid="button-inject-auth"
                >
                  {injectingAuth ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                  {injectingAuth ? "Adding login..." : "Add Login Now"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
                <TabsTrigger value="github" className="flex-1 gap-2" data-testid="tab-import-github">
                  <Github className="w-4 h-4" /> GitHub
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

              {/* ---- GITHUB TAB ---- */}
              <TabsContent value="github" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="github-import-url">GitHub URL</Label>
                  <Input
                    id="github-import-url"
                    value={githubImportUrl}
                    onChange={(e) => setGithubImportUrl(e.target.value)}
                    placeholder="https://gist.github.com/user/abc123 or raw GitHub URL"
                    data-testid="input-github-import-url"
                    onKeyDown={(e) => e.key === "Enter" && githubImportUrl.trim() && handleGithubImport()}
                  />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium">Supported formats:</p>
                    <ul className="ml-3 space-y-0.5 list-disc">
                      <li>GitHub Gist URL — gist.github.com/user/id</li>
                      <li>GitHub file URL — github.com/user/repo/blob/main/index.html</li>
                      <li>Raw file URL — raw.githubusercontent.com/...</li>
                    </ul>
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={!githubImportUrl.trim() || importLoading}
                  onClick={handleGithubImport}
                  data-testid="button-github-import-submit"
                >
                  {importLoading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Fetching from GitHub…</>
                    : <><Github className="w-4 h-4 mr-2" />Import from GitHub</>}
                </Button>
              </TabsContent>

            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* GitHub Export Modal */}
      <Dialog open={showGithubModal} onOpenChange={(o) => { setShowGithubModal(o); if (!o) { setGithubResultUrl(null); setGithubRepoName(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="w-5 h-5" />
              {githubExportMode === "gist" ? "Export as GitHub Gist" : "Push to GitHub Repository"}
            </DialogTitle>
            <DialogDescription>
              {githubExportMode === "gist"
                ? "Create a public shareable Gist with your app's code on GitHub."
                : "Push your app's code to a GitHub repository. Enable GitHub Pages to get a free live URL."}
            </DialogDescription>
          </DialogHeader>

          {githubResultUrl ? (
            <div className="space-y-4 py-2">
              <div className="flex flex-col items-center gap-3 text-center py-2">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <div>
                  <p className="font-semibold">{githubExportMode === "gist" ? "Gist created!" : "Pushed to GitHub!"}</p>
                  <p className="text-sm text-muted-foreground mt-1">Your app code is now on GitHub.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border text-sm">
                <span className="flex-1 truncate text-xs font-mono">{githubResultUrl}</span>
                <Button size="icon" variant="ghost" className="shrink-0 h-7 w-7" onClick={() => { navigator.clipboard.writeText(githubResultUrl); toast({ title: "Copied!" }); }} data-testid="button-copy-github-url">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              {githubExportMode === "repo" && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-50/5 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-amber-500">Get a free live URL with GitHub Pages:</p>
                  <ol className="ml-3 list-decimal space-y-0.5">
                    <li>Open your repo on GitHub</li>
                    <li>Settings → Pages → Deploy from branch → main</li>
                    <li>App goes live at <span className="font-mono">username.github.io/repo-name</span></li>
                  </ol>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowGithubModal(false)} data-testid="button-github-close">Done</Button>
                <Button className="flex-1 gap-2" onClick={() => window.open(githubResultUrl, "_blank")} data-testid="button-github-open">
                  <ExternalLink className="w-4 h-4" /> View on GitHub
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-sm">GitHub Personal Access Token <span className="text-red-400">*</span></Label>
                <Input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  data-testid="input-github-token"
                />
                <p className="text-xs text-muted-foreground">
                  Get one at <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" className="text-primary underline">github.com/settings/tokens</a> — needs <strong>gist</strong>{githubExportMode === "repo" ? " and repo" : ""} scope. Saved in your browser only, never sent to Afro AI.
                </p>
              </div>

              {githubExportMode === "repo" && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Repository name <span className="text-red-400">*</span></Label>
                  <Input
                    value={githubRepoName}
                    onChange={(e) => setGithubRepoName(e.target.value)}
                    placeholder="my-afro-ai-app"
                    data-testid="input-github-repo-name"
                  />
                  <p className="text-xs text-muted-foreground">Created automatically if it doesn't exist yet.</p>
                </div>
              )}

              <Button
                className="w-full gap-2"
                disabled={!githubToken || (githubExportMode === "repo" && !githubRepoName.trim()) || githubExporting}
                onClick={githubExportMode === "gist" ? handleGistExport : handleRepoExport}
                data-testid="button-github-export-submit"
              >
                {githubExporting
                  ? <><Loader2 className="w-4 h-4 animate-spin" />{githubExportMode === "gist" ? "Creating Gist…" : "Pushing to GitHub…"}</>
                  : <><Github className="w-4 h-4" />{githubExportMode === "gist" ? "Create Gist" : "Push to GitHub"}</>}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
