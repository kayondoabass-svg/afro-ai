import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Smartphone, Download, Code2, CheckCircle2, Wifi, BatteryCharging, Globe, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PublishedApp {
  id: number;
  appName: string;
  subdomain: string;
  appStatus: string;
}

interface PwaResult {
  manifest: object;
  serviceWorker: string;
  pwaSnippet: string;
  appName: string;
}

export default function PwaBuilderPage() {
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [pwaResult, setPwaResult] = useState<PwaResult | null>(null);
  const { toast } = useToast();

  const { data: myApps } = useQuery<PublishedApp[]>({
    queryKey: ["/api/published-apps"],
  });

  const generateMutation = useMutation({
    mutationFn: (publishedAppId: number) =>
      apiRequest("POST", "/api/pwa/generate", { publishedAppId }).then(r => r.json()),
    onSuccess: (data: PwaResult) => {
      setPwaResult(data);
      toast({ title: "PWA files generated!", description: "Copy the snippets into your app." });
    },
    onError: () => toast({ title: "Error", description: "Failed to generate PWA", variant: "destructive" }),
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  };

  const downloadFile = (content: string, filename: string, mime = "text/plain") => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeApps = myApps?.filter(a => a.appStatus === "active") || [];

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Smartphone className="w-8 h-8 text-yellow-400" />
            PWA Builder
          </h1>
          <p className="text-muted-foreground mt-1">Convert your published app into an installable Progressive Web App</p>
        </div>

        {/* Benefits */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Wifi, color: "text-blue-400", bg: "bg-blue-400/10", title: "Offline Ready", desc: "Works without internet via service worker caching" },
            { icon: Smartphone, color: "text-green-400", bg: "bg-green-400/10", title: "Installable", desc: "Users can add it to their home screen like a native app" },
            { icon: BatteryCharging, color: "text-yellow-400", bg: "bg-yellow-400/10", title: "Faster Load", desc: "Cached assets load instantly on repeat visits" },
          ].map(f => (
            <Card key={f.title} className="border-white/10 bg-white/5">
              <CardContent className="pt-4">
                <div className={`w-9 h-9 rounded-lg ${f.bg} flex items-center justify-center mb-3`}>
                  <f.icon className={`w-5 h-5 ${f.color}`} />
                </div>
                <h3 className="font-semibold text-sm">{f.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Generator */}
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-lg">Generate PWA Files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select your published app</label>
              {activeApps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active published apps found. Publish an app first.</p>
              ) : (
                <div className="flex gap-3">
                  <Select value={selectedAppId} onValueChange={setSelectedAppId}>
                    <SelectTrigger data-testid="select-pwa-app" className="bg-white/5 border-white/10 flex-1">
                      <SelectValue placeholder="Choose an app..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeApps.map(app => (
                        <SelectItem key={app.id} value={String(app.id)}>
                          {app.appName || app.subdomain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    data-testid="button-generate-pwa"
                    onClick={() => generateMutation.mutate(parseInt(selectedAppId))}
                    disabled={!selectedAppId || generateMutation.isPending}
                    className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold gap-2"
                  >
                    <Smartphone className="w-4 h-4" />
                    {generateMutation.isPending ? "Generating..." : "Generate PWA"}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {pwaResult && (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <h2 className="text-lg font-semibold">PWA files generated for <span className="text-yellow-400">{pwaResult.appName}</span></h2>
            </div>

            <Tabs defaultValue="snippet">
              <TabsList className="bg-white/5 border border-white/10">
                <TabsTrigger value="snippet" data-testid="tab-snippet">HTML Snippet</TabsTrigger>
                <TabsTrigger value="manifest" data-testid="tab-manifest">manifest.json</TabsTrigger>
                <TabsTrigger value="sw" data-testid="tab-sw">sw.js</TabsTrigger>
                <TabsTrigger value="howto" data-testid="tab-howto">How to Install</TabsTrigger>
              </TabsList>

              <TabsContent value="snippet" className="mt-4">
                <Card className="border-white/10 bg-white/5">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">Add this to your app's &lt;head&gt; section</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(pwaResult.pwaSnippet, "Snippet")} className="gap-2">
                      <Copy className="w-4 h-4" /> Copy
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-black/40 border border-white/10 rounded-lg p-4 overflow-x-auto text-green-300">
                      {pwaResult.pwaSnippet}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="manifest" className="mt-4">
                <Card className="border-white/10 bg-white/5">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">manifest.json</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(JSON.stringify(pwaResult.manifest, null, 2), "Manifest")} className="gap-2">
                        <Copy className="w-4 h-4" /> Copy
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => downloadFile(JSON.stringify(pwaResult.manifest, null, 2), "manifest.json", "application/json")} className="gap-2">
                        <Download className="w-4 h-4" /> Download
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-black/40 border border-white/10 rounded-lg p-4 overflow-x-auto text-blue-300">
                      {JSON.stringify(pwaResult.manifest, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="sw" className="mt-4">
                <Card className="border-white/10 bg-white/5">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">sw.js (Service Worker)</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(pwaResult.serviceWorker, "Service Worker")} className="gap-2">
                        <Copy className="w-4 h-4" /> Copy
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => downloadFile(pwaResult.serviceWorker, "sw.js")} className="gap-2">
                        <Download className="w-4 h-4" /> Download
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-black/40 border border-white/10 rounded-lg p-4 overflow-x-auto text-purple-300 whitespace-pre-wrap break-all">
                      {pwaResult.serviceWorker}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="howto" className="mt-4">
                <Card className="border-white/10 bg-white/5">
                  <CardContent className="pt-5 space-y-4">
                    {[
                      { step: "1", title: "Add the HTML snippet", desc: 'Copy the HTML Snippet and paste it inside the <head> tag of your published app.' },
                      { step: "2", title: "Host the manifest.json", desc: "Download and host manifest.json at the root of your app (e.g., /manifest.json)." },
                      { step: "3", title: "Host the service worker", desc: "Download and host sw.js at the root of your app. It must be served from the same origin." },
                      { step: "4", title: "Test your PWA", desc: "Open Chrome DevTools → Application tab → Manifest to verify everything is set up correctly." },
                      { step: "5", title: "Install prompt", desc: "On mobile, users will see an 'Add to Home Screen' prompt. On desktop Chrome, a browser install button appears in the address bar." },
                    ].map(s => (
                      <div key={s.step} className="flex gap-4">
                        <div className="w-7 h-7 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-yellow-400">
                          {s.step}
                        </div>
                        <div>
                          <h4 className="text-sm font-medium">{s.title}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <Card className="border-yellow-500/20 bg-yellow-500/5">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <Globe className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Your app lives at</p>
                    <p className="text-xs text-yellow-400 font-mono mt-0.5">
                      {activeApps.find(a => a.id === parseInt(selectedAppId))?.subdomain}.afroaigroup.com
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      For full PWA functionality, users will need the manifest and service worker files at the same domain. Consider editing your app's HTML directly to embed these files inline.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
