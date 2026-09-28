import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, inspectQuota, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain,
  Plus,
  Trash2,
  RefreshCw,
  FileText,
  Link2,
  Loader2,
  Sparkles,
  Send,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import type { KnowledgeDocument } from "@shared/schema";
import { KnowledgeAudio, fileBase64 } from "@/components/knowledge-audio";

interface AskSource {
  documentId: number;
  title: string;
  score: number;
  excerpt: string;
}
interface AskResult {
  answer: string;
  sources: AskSource[];
  usedTools: string[];
  webSources?: Array<{ title: string; url: string; snippet?: string }>;
  toolResults?: Array<{ tool: string; ok: boolean; error?: { code: string; message: string }; data?: unknown }>;
}

interface KnowledgeCapabilities {
  afroAvailable: boolean;
  webSearchAvailable: boolean;
}

type AskProvider = "default" | "afro-test";

function safeWebUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export default function KnowledgePage() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [question, setQuestion] = useState("");
  const [askResult, setAskResult] = useState<AskResult | null>(null);
  const [provider, setProvider] = useState<AskProvider>("default");
  const [searchKnowledge, setSearchKnowledge] = useState(true);
  const [calculate, setCalculate] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");
  const askController = useRef<AbortController | null>(null);

  useEffect(() => () => askController.current?.abort(), []);

  const { data: capabilities, isError: capabilitiesError } = useQuery<KnowledgeCapabilities>({
    queryKey: ["/api/knowledge/capabilities"],
    retry: false,
  });

  useEffect(() => {
    if (!capabilities?.afroAvailable) setProvider("default");
    if (!capabilities?.webSearchAvailable) setWebSearch(false);
  }, [capabilities]);

  const { data: docs, isLoading } = useQuery<KnowledgeDocument[]>({
    queryKey: ["/api/knowledge"],
    refetchInterval: (query) => {
      const list = query.state.data as KnowledgeDocument[] | undefined;
      return list?.some((d) => d.status === "processing") ? 3000 : false;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (tab === "file") {
        if (!uploadFile || !uploadFile.size || uploadFile.size > 5 * 1024 * 1024) throw new Error("Choose a non-empty file up to 5 MB.");
        return apiRequest("POST", "/api/knowledge/upload", {
          name: uploadFile.name, title, data: await fileBase64(uploadFile),
        });
      }
      const payload =
        tab === "url"
          ? { title: title.trim() || url.trim(), sourceType: "url", url: url.trim() }
          : { title: title.trim() || "Untitled", sourceType: "text", content };
      return apiRequest("POST", "/api/knowledge", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      setAddOpen(false);
      setTitle("");
      setContent("");
      setUrl("");
      setUploadFile(null);
      toast({ title: t("knowledge.added"), description: t("knowledge.addedDesc") });
    },
    onError: (e: any) => toast({ title: t("knowledge.error"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/knowledge/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      toast({ title: t("knowledge.deleted") });
    },
    onError: (e: any) => toast({ title: t("knowledge.error"), description: e.message, variant: "destructive" }),
  });

  const reindexMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/knowledge/${id}/reindex`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      toast({ title: t("knowledge.reindexing") });
    },
    onError: (e: any) => toast({ title: t("knowledge.error"), description: e.message, variant: "destructive" }),
  });

  async function ask() {
    if (asking || !question.trim() || (searchKnowledge && readyDocs === 0)) return;
    const controller = new AbortController();
    askController.current = controller;
    setAsking(true);
    setAskResult(null);
    setAskError("");
    try {
      const enabledTools = [
        ...(searchKnowledge ? ["search_knowledge"] : []),
        ...(calculate ? ["calculate"] : []),
        ...(webSearch && capabilities?.webSearchAvailable ? ["web_search"] : []),
      ];
      const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/knowledge/ask`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          provider: provider === "afro-test" && capabilities?.afroAvailable ? "afro-test" : "default",
          enabledTools,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        inspectQuota(res, text);
        let message = text || res.statusText;
        try { message = JSON.parse(text).message || message; } catch { /* plain-text response */ }
        throw new Error(message);
      }
      inspectQuota(res);
      const result = (await res.json()) as AskResult;
      if (!controller.signal.aborted) setAskResult(result);
    } catch (e) {
      if (!controller.signal.aborted) setAskError(e instanceof Error ? e.message : t("knowledge.error"));
    } finally {
      if (askController.current === controller) {
        askController.current = null;
        setAsking(false);
      }
    }
  }

  function cancelAsk() {
    askController.current?.abort();
    askController.current = null;
    setAsking(false);
  }

  const readyDocs = (docs || []).filter((d) => d.status === "ready").length;

  function statusBadge(status: string) {
    if (status === "ready")
      return (
        <Badge variant="secondary" className="gap-1" data-testid={`status-ready`}>
          <CheckCircle2 className="h-3 w-3 text-green-500" /> {t("knowledge.statusReady")}
        </Badge>
      );
    if (status === "error")
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" /> {t("knowledge.statusError")}
        </Badge>
      );
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> {t("knowledge.statusProcessing")}
      </Badge>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Brain className="h-6 w-6 text-primary" /> {t("knowledge.title")}
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">{t("knowledge.subtitle")}</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-knowledge" className="gap-2">
              <Plus className="h-4 w-4" /> {t("knowledge.addButton")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("knowledge.addButton")}</DialogTitle>
              <DialogDescription>{t("knowledge.addDialogDesc")}</DialogDescription>
            </DialogHeader>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="text" data-testid="tab-text" className="gap-2">
                  <FileText className="h-4 w-4" /> {t("knowledge.tabText")}
                </TabsTrigger>
                <TabsTrigger value="url" data-testid="tab-url" className="gap-2">
                  <Link2 className="h-4 w-4" /> {t("knowledge.tabUrl")}
                </TabsTrigger>
                <TabsTrigger value="file" data-testid="tab-file">Upload file</TabsTrigger>
              </TabsList>
              <div className="space-y-3 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="kb-title">{t("knowledge.fieldTitle")}</Label>
                  <Input
                    id="kb-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("knowledge.fieldTitlePlaceholder")}
                    data-testid="input-title"
                  />
                </div>
                <TabsContent value="text" className="mt-0 space-y-1.5">
                  <Label htmlFor="kb-content">{t("knowledge.fieldContent")}</Label>
                  <Textarea
                    id="kb-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={t("knowledge.fieldContentPlaceholder")}
                    rows={8}
                    data-testid="input-content"
                  />
                </TabsContent>
                <TabsContent value="file" className="mt-0 space-y-1.5">
                  <Label htmlFor="kb-file">Document file</Label>
                  <Input id="kb-file" type="file" accept=".pdf,.txt,.md,.csv,.json" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                  <p className="text-xs text-muted-foreground">PDF, TXT, Markdown, CSV or JSON, up to 5 MB. Text extraction is limited to 12,000 characters (CSV: first 200 rows). Scanned PDFs are not supported.</p>
                </TabsContent>
                <TabsContent value="url" className="mt-0 space-y-1.5">
                  <Label htmlFor="kb-url">{t("knowledge.fieldUrl")}</Label>
                  <Input
                    id="kb-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/about"
                    data-testid="input-url"
                  />
                </TabsContent>
              </div>
            </Tabs>
            <DialogFooter>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || (tab === "file" ? !uploadFile : tab === "url" ? !url.trim() : !content.trim())}
                data-testid="button-submit-knowledge"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("knowledge.addSubmit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Ask your knowledge */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" /> {t("knowledge.askTitle")}
          </CardTitle>
          <CardDescription>{t("knowledge.askDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="knowledge-provider">{t("knowledge.model")}</Label>
            <select
              id="knowledge-provider"
              data-testid="select-knowledge-provider"
              className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={provider}
              onChange={(e) => setProvider(e.target.value as AskProvider)}
              disabled={asking}
            >
              <option value="default">{t("knowledge.defaultModel")}</option>
              {capabilities?.afroAvailable && <option value="afro-test">{t("knowledge.afroTestModel")}</option>}
            </select>
            {!capabilities?.afroAvailable && (
              <p className="text-xs text-muted-foreground">{t("knowledge.afroUnavailable")}</p>
            )}
            {capabilitiesError && (
              <p className="text-xs text-destructive" role="alert">{t("knowledge.capabilitiesError")}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="knowledge-search"
                data-testid="toggle-search-knowledge"
                checked={searchKnowledge}
                onCheckedChange={(checked) => setSearchKnowledge(checked === true)}
                disabled={asking}
              />
              <Label htmlFor="knowledge-search">{t("knowledge.searchTool")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="knowledge-calculate"
                data-testid="toggle-calculate"
                checked={calculate}
                onCheckedChange={(checked) => setCalculate(checked === true)}
                disabled={asking}
              />
              <Label htmlFor="knowledge-calculate">{t("knowledge.calculateTool")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="knowledge-web-search"
                data-testid="toggle-web-search"
                checked={webSearch}
                onCheckedChange={(checked) => setWebSearch(checked === true)}
                disabled={asking || !capabilities?.webSearchAvailable}
              />
              <Label htmlFor="knowledge-web-search">{t("knowledge.webSearchTool")}</Label>
              {!capabilities?.webSearchAvailable && (
                <span className="text-xs text-muted-foreground">{t("knowledge.webUnavailable")}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void ask();
              }}
              placeholder={t("knowledge.askPlaceholder")}
              data-testid="input-question"
              disabled={asking}
            />
            <Button
              onClick={() => void ask()}
              disabled={asking || !question.trim() || (searchKnowledge && readyDocs === 0)}
              data-testid="button-ask"
              className="gap-2"
            >
              {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>{t("knowledge.askSubmit")}</span>
            </Button>
            {asking && (
              <Button variant="outline" onClick={cancelAsk} data-testid="button-cancel-ask">
                {t("knowledge.cancel")}
              </Button>
            )}
          </div>
          {readyDocs === 0 && searchKnowledge && <p className="text-sm text-muted-foreground">{t("knowledge.askEmpty")}</p>}
          {asking && <p className="text-sm text-muted-foreground" role="status">{t("knowledge.searching")}</p>}
          {askError && <p className="text-sm text-destructive" role="alert">{askError}</p>}
          {askResult && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/30" data-testid="text-answer">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{askResult.answer}</p>
              {(askResult.sources || []).length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground">{t("knowledge.sources")}</p>
                  {askResult.sources.map((s, i) => (
                    <div key={i} className="text-xs rounded bg-background p-2 border" data-testid={`source-${i}`}>
                      <span className="font-medium">{s.title}</span>{" "}
                      <span className="text-muted-foreground">({Math.round(s.score * 100)}%)</span>
                      <p className="text-muted-foreground mt-0.5 line-clamp-2">{s.excerpt}</p>
                    </div>
                  ))}
                </div>
              )}
              {(askResult.webSources || []).length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground">{t("knowledge.webSources")}</p>
                  {askResult.webSources?.map((source, i) => {
                    const href = safeWebUrl(source.url);
                    return (
                      <div key={i} className="text-xs rounded bg-background p-2 border" data-testid={`web-source-${i}`}>
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline inline-flex items-center gap-1 break-all">
                            {source.title || href} <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : <span className="font-medium">{source.title}</span>}
                        {source.snippet && <p className="text-muted-foreground mt-0.5">{source.snippet}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
              {(askResult.toolResults || []).length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground">{t("knowledge.toolResults")}</p>
                  {askResult.toolResults?.map((tool, i) => (
                    <div key={i} className="text-xs rounded bg-background p-2 border" data-testid={`tool-result-${i}`}>
                      <span className="font-medium">{tool.tool || t("knowledge.toolResult")}</span>
                      {tool.error && <p className="text-destructive mt-1" role="alert">{tool.error.message || tool.error.code}</p>}
                      {tool.data != null && (
                        <p className="text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                          {typeof tool.data === "string" ? tool.data : JSON.stringify(tool.data)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <KnowledgeAudio afroAvailable={Boolean(capabilities?.afroAvailable)} />
      {/* Document list */}
      <div className="space-y-3">
        <h2 className="font-semibold text-lg">{t("knowledge.documents")}</h2>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : (docs || []).length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Brain className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>{t("knowledge.emptyState")}</p>
            </CardContent>
          </Card>
        ) : (
          (docs || []).map((doc) => (
            <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {doc.sourceType === "url" ? (
                      <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="font-medium truncate" data-testid={`text-doc-title-${doc.id}`}>
                      {doc.title}
                    </span>
                    {statusBadge(doc.status)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {doc.status === "error" && doc.error
                      ? doc.error
                      : t("knowledge.chunkInfo", { chunks: doc.chunkCount, chars: doc.charCount.toLocaleString() })}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => reindexMutation.mutate(doc.id)}
                    disabled={reindexMutation.isPending || doc.status === "processing"}
                    data-testid={`button-reindex-${doc.id}`}
                    title={t("knowledge.reindex")}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(doc.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-${doc.id}`}
                    title={t("knowledge.delete")}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
