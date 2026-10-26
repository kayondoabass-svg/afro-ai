import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Sparkles, Save, Globe, TrendingUp, AlertCircle, CheckCircle, Image } from "lucide-react";

interface PublishedApp { id: number; title: string; subdomain: string; }
interface AppSeo {
  seoTitle?: string; seoDescription?: string; seoKeywords?: string;
  ogImage?: string; ogTitle?: string; robots?: string;
}
interface AnalysisResult {
  score: number;
  issues: { issue: string; fix: string }[];
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedKeywords: string;
}

const ROBOTS_OPTIONS = [
  { value: "index, follow", label: "Index & Follow (default)" },
  { value: "noindex, follow", label: "No Index" },
  { value: "index, nofollow", label: "No Follow" },
  { value: "noindex, nofollow", label: "No Index, No Follow" },
];

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  const r = 36, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="absolute inset-0 w-24 h-24 -rotate-90">
        <circle cx="48" cy="48" r={r} strokeWidth="6" stroke="#1a1a1a" fill="none" />
        <circle cx="48" cy="48" r={r} strokeWidth="6" stroke={color} fill="none" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease" }} />
      </svg>
      <span className="text-2xl font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

export default function SeoToolsPage() {
  const { toast } = useToast();
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [form, setForm] = useState<AppSeo>({ seoTitle: "", seoDescription: "", seoKeywords: "", ogImage: "", ogTitle: "", robots: "index, follow" });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const { data: apps = [] } = useQuery<PublishedApp[]>({ queryKey: ["/api/published-apps"] });

  const { data: seo, isLoading: loadingSeo } = useQuery<AppSeo>({
    queryKey: ["/api/seo", selectedAppId],
    queryFn: () => apiRequest("GET", `/api/seo/${selectedAppId}`).then(r => r.json()),
    enabled: !!selectedAppId,
  });

  useEffect(() => {
    if (seo) setForm({ seoTitle: seo.seoTitle || "", seoDescription: seo.seoDescription || "", seoKeywords: seo.seoKeywords || "", ogImage: seo.ogImage || "", ogTitle: seo.ogTitle || "", robots: seo.robots || "index, follow" });
  }, [seo]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/seo/${selectedAppId}`, form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/seo", selectedAppId] }); toast({ title: "SEO settings saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function handleAnalyze() {
    if (!selectedAppId) return;
    setAnalyzing(true);
    try {
      const res = await apiRequest("POST", `/api/seo/${selectedAppId}/analyze`, {});
      const data = await res.json();
      setAnalysis(data);
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  function applyAiSuggestions() {
    if (!analysis) return;
    setForm(f => ({
      ...f,
      seoTitle: analysis.suggestedTitle || f.seoTitle,
      seoDescription: analysis.suggestedDescription || f.seoDescription,
      seoKeywords: analysis.suggestedKeywords || f.seoKeywords,
    }));
    toast({ title: "AI suggestions applied" });
  }

  const selectedApp = apps.find(a => a.id === selectedAppId);
  const titleLen = (form.seoTitle || "").length;
  const descLen = (form.seoDescription || "").length;

  const seoScore = (() => {
    let s = 0;
    if (form.seoTitle && titleLen <= 60) s += 25;
    else if (form.seoTitle) s += 15;
    if (form.seoDescription && descLen <= 160) s += 25;
    else if (form.seoDescription) s += 15;
    if (form.seoKeywords) s += 15;
    if (form.ogImage) s += 20;
    if (form.ogTitle) s += 15;
    return Math.min(100, s);
  })();

  return (
    <div className="flex-1 overflow-auto min-h-0 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Search className="w-6 h-6 text-primary" /> SEO Tools
          </h1>
          <p className="text-muted-foreground mt-1">Optimize your published apps for search engines. Get AI-powered suggestions to rank higher.</p>
        </div>

        {/* App Selector */}
        <Card className="border-border">
          <CardContent className="pt-4">
            <Label className="mb-2 block">Select Published App</Label>
            <Select value={selectedAppId?.toString() || ""} onValueChange={v => { setSelectedAppId(parseInt(v)); setAnalysis(null); setForm({ seoTitle: "", seoDescription: "", seoKeywords: "", ogImage: "", ogTitle: "", robots: "index, follow" }); }}>
              <SelectTrigger data-testid="select-seo-app">
                <SelectValue placeholder="Choose an app to optimize…" />
              </SelectTrigger>
              <SelectContent>
                {apps.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.title} ({a.subdomain}.afroaigroup.com)</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedApp && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Form */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Meta Tags</CardTitle>
                  <CardDescription>These appear in Google search results</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <Label>SEO Title</Label>
                      <span className={`text-xs ${titleLen > 60 ? "text-destructive" : "text-muted-foreground"}`}>{titleLen}/60</span>
                    </div>
                    <Input value={form.seoTitle || ""} onChange={e => setForm(f => ({ ...f, seoTitle: e.target.value }))} placeholder={selectedApp.title} data-testid="input-seo-title" maxLength={80} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <Label>Meta Description</Label>
                      <span className={`text-xs ${descLen > 160 ? "text-destructive" : "text-muted-foreground"}`}>{descLen}/160</span>
                    </div>
                    <Textarea value={form.seoDescription || ""} onChange={e => setForm(f => ({ ...f, seoDescription: e.target.value }))} placeholder="A compelling description of your app…" rows={3} data-testid="input-seo-description" maxLength={200} />
                  </div>
                  <div className="space-y-1">
                    <Label>Keywords (comma-separated)</Label>
                    <Input value={form.seoKeywords || ""} onChange={e => setForm(f => ({ ...f, seoKeywords: e.target.value }))} placeholder="africa, business, web app" data-testid="input-seo-keywords" />
                  </div>
                  <div className="space-y-1">
                    <Label>Robots</Label>
                    <Select value={form.robots || "index, follow"} onValueChange={v => setForm(f => ({ ...f, robots: v }))}>
                      <SelectTrigger data-testid="select-seo-robots"><SelectValue /></SelectTrigger>
                      <SelectContent>{ROBOTS_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Social Preview (Open Graph)</CardTitle>
                  <CardDescription>How your app looks when shared on social media</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <Label>OG Title (optional)</Label>
                    <Input value={form.ogTitle || ""} onChange={e => setForm(f => ({ ...f, ogTitle: e.target.value }))} placeholder={form.seoTitle || selectedApp.title} data-testid="input-seo-ogtitle" />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1"><Image className="w-3.5 h-3.5" /> OG Image URL</Label>
                    <Input value={form.ogImage || ""} onChange={e => setForm(f => ({ ...f, ogImage: e.target.value }))} placeholder="https://example.com/image.jpg" data-testid="input-seo-ogimage" />
                  </div>
                  {form.ogImage && (
                    <div className="rounded-lg border border-border overflow-hidden">
                      <img src={form.ogImage} alt="OG Preview" className="w-full h-40 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div className="p-3 bg-muted">
                        <p className="text-xs text-muted-foreground">{selectedApp.subdomain}.afroaigroup.com</p>
                        <p className="text-sm font-semibold">{form.ogTitle || form.seoTitle || selectedApp.title}</p>
                        {form.seoDescription && <p className="text-xs text-muted-foreground line-clamp-2">{form.seoDescription}</p>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Google Search Preview */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Google Search Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-white rounded-lg p-4 space-y-0.5">
                    <p className="text-xs text-green-700 font-mono">{selectedApp.subdomain}.afroaigroup.com</p>
                    <p className="text-blue-700 text-lg font-normal hover:underline cursor-pointer line-clamp-1">
                      {form.seoTitle || selectedApp.title || "Page Title"}
                    </p>
                    <p className="text-gray-600 text-sm line-clamp-2">
                      {form.seoDescription || "No description set. Add a meta description to improve click-through rates from search results."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full" data-testid="button-save-seo">
                <Save className="w-4 h-4 mr-2" />{saveMutation.isPending ? "Saving…" : "Save SEO Settings"}
              </Button>
            </div>

            {/* Right: Score + AI */}
            <div className="space-y-4">
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">SEO Score</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-3">
                  <ScoreRing score={analysis?.score ?? seoScore} />
                  <div className="w-full space-y-2 text-xs">
                    {[
                      { label: "Title", ok: !!form.seoTitle && titleLen <= 60 },
                      { label: "Description", ok: !!form.seoDescription && descLen <= 160 },
                      { label: "Keywords", ok: !!form.seoKeywords },
                      { label: "OG Image", ok: !!form.ogImage },
                      { label: "Social Title", ok: !!form.ogTitle },
                    ].map(({ label, ok }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{label}</span>
                        {ok ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />AI Analysis</CardTitle>
                  <CardDescription>Get AI-powered SEO recommendations for your app</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button onClick={handleAnalyze} disabled={analyzing} className="w-full" variant="outline" data-testid="button-analyze-seo">
                    <Sparkles className="w-4 h-4 mr-2" />{analyzing ? "Analyzing…" : "Analyze with AI"}
                  </Button>
                  {analysis && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        {analysis.issues.map((issue, i) => (
                          <div key={i} className="p-2 bg-muted/50 rounded-lg text-xs space-y-1">
                            <p className="font-medium text-foreground">{issue.issue}</p>
                            <p className="text-muted-foreground">{issue.fix}</p>
                          </div>
                        ))}
                      </div>
                      <Button size="sm" onClick={applyAiSuggestions} className="w-full" data-testid="button-apply-seo-suggestions">
                        Apply AI Suggestions
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {!selectedApp && (
          <Card className="border-dashed border-2 border-border bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <TrendingUp className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Select an app to optimize</h3>
              <p className="text-muted-foreground max-w-sm">Choose a published app above to set meta tags, social previews, and get AI-powered SEO recommendations.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
