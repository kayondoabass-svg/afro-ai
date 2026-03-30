import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Folder, Image, Film, FileArchive, Download, Trash2, Copy, Check,
  ExternalLink, Search, Library, Package, Globe, Zap, Code2,
  BarChart3, Smartphone, Palette, Box, Layers, Music2, Cpu,
  Map, Clock, RefreshCw, HardDrive, FileText,
} from "lucide-react";
import type { UserFile, ZipExport } from "@shared/schema";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const CDN_LIBRARIES = [
  {
    category: "CSS Frameworks",
    icon: Palette,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    items: [
      { name: "Tailwind CSS", desc: "Utility-first CSS framework", tag: `<script src="https://cdn.tailwindcss.com"></script>` },
      { name: "Bootstrap 5", desc: "Popular responsive CSS framework", tag: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">\n<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>` },
      { name: "Bulma", desc: "Modern CSS framework based on Flexbox", tag: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css">` },
      { name: "Materialize CSS", desc: "Material Design CSS framework", tag: `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/css/materialize.min.css">\n<script src="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/js/materialize.min.js"></script>` },
    ],
  },
  {
    category: "Icons",
    icon: Layers,
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    items: [
      { name: "Font Awesome 6", desc: "The most popular icon library", tag: `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">` },
      { name: "Bootstrap Icons", desc: "Official Bootstrap icon library (2000+ icons)", tag: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">` },
      { name: "Boxicons", desc: "High quality web icons library", tag: `<link href="https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css" rel="stylesheet">` },
      { name: "Remix Icon", desc: "Open source icon system for designers", tag: `<link href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css" rel="stylesheet">` },
    ],
  },
  {
    category: "JavaScript",
    icon: Code2,
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    items: [
      { name: "jQuery 3", desc: "Fast, small, feature-rich JavaScript library", tag: `<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>` },
      { name: "Alpine.js", desc: "Lightweight JS framework for HTML", tag: `<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>` },
      { name: "Vue 3", desc: "Progressive JavaScript framework", tag: `<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>` },
      { name: "React 18 (CDN)", desc: "JavaScript library for UIs", tag: `<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>\n<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>` },
      { name: "Lodash", desc: "Useful JavaScript utility functions", tag: `<script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>` },
    ],
  },
  {
    category: "Animations",
    icon: Zap,
    color: "text-pink-400",
    bg: "bg-pink-400/10",
    items: [
      { name: "Animate.css", desc: "Cross-browser CSS animation library", tag: `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">` },
      { name: "AOS — Animate on Scroll", desc: "Scroll animation library", tag: `<link rel="stylesheet" href="https://unpkg.com/aos@2.3.1/dist/aos.css">\n<script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>\n<script>AOS.init();</script>` },
      { name: "GSAP", desc: "Professional-grade animation library", tag: `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>` },
      { name: "Typed.js", desc: "Type-writer effect animation library", tag: `<script src="https://unpkg.com/typed.js@2.1.0/dist/typed.umd.js"></script>` },
      { name: "Particles.js", desc: "Animated particle backgrounds", tag: `<script src="https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js"></script>` },
    ],
  },
  {
    category: "Charts & Data",
    icon: BarChart3,
    color: "text-green-400",
    bg: "bg-green-400/10",
    items: [
      { name: "Chart.js", desc: "Simple yet flexible charting library", tag: `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>` },
      { name: "ApexCharts", desc: "Modern interactive chart library", tag: `<script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>` },
      { name: "D3.js", desc: "Data-driven document visualization", tag: `<script src="https://d3js.org/d3.v7.min.js"></script>` },
      { name: "ECharts", desc: "Powerful charting library by Apache", tag: `<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>` },
    ],
  },
  {
    category: "3D & Graphics",
    icon: Box,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    items: [
      { name: "Three.js", desc: "3D library for the browser", tag: `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>` },
      { name: "p5.js", desc: "Creative coding and visual art library", tag: `<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js"></script>` },
      { name: "Pixi.js", desc: "Fast 2D WebGL renderer", tag: `<script src="https://pixijs.download/release/pixi.min.js"></script>` },
      { name: "Babylon.js", desc: "Powerful 3D game engine", tag: `<script src="https://cdn.babylonjs.com/babylon.js"></script>` },
    ],
  },
  {
    category: "UI Components",
    icon: Smartphone,
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    items: [
      { name: "Swiper.js", desc: "Mobile-friendly slider & carousel", tag: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">\n<script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>` },
      { name: "Lottie Web", desc: "Render After Effects animations on web", tag: `<script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js"></script>` },
      { name: "SweetAlert2", desc: "Beautiful, responsive popup boxes", tag: `<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>` },
      { name: "noUiSlider", desc: "Lightweight range slider", tag: `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.1/nouislider.min.css">\n<script src="https://cdnjs.cloudflare.com/ajax/libs/noUiSlider/15.7.1/nouislider.min.js"></script>` },
    ],
  },
  {
    category: "Maps & Geo",
    icon: Map,
    color: "text-teal-400",
    bg: "bg-teal-400/10",
    items: [
      { name: "Leaflet.js", desc: "Open-source interactive maps", tag: `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">\n<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>` },
      { name: "OpenLayers", desc: "High-performance mapping library", tag: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol/ol.css">\n<script src="https://cdn.jsdelivr.net/npm/ol/dist/ol.js"></script>` },
    ],
  },
  {
    category: "Utilities",
    icon: Cpu,
    color: "text-red-400",
    bg: "bg-red-400/10",
    items: [
      { name: "Day.js", desc: "Lightweight date manipulation library", tag: `<script src="https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js"></script>` },
      { name: "Moment.js", desc: "Parse, validate, and format dates", tag: `<script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js"></script>` },
      { name: "Axios", desc: "Promise-based HTTP client", tag: `<script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>` },
      { name: "Socket.io Client", desc: "Real-time event-based communication", tag: `<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>` },
      { name: "QRCode.js", desc: "QR code generation library", tag: `<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>` },
    ],
  },
];

export default function FilesPage() {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fileSearch, setFileSearch] = useState("");

  const { data: files = [], isLoading: filesLoading } = useQuery<UserFile[]>({ queryKey: ["/api/files"] });
  const { data: exports = [], isLoading: exportsLoading } = useQuery<ZipExport[]>({ queryKey: ["/api/zip-exports"] });

  const deleteFileMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/files/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      toast({ title: "File deleted" });
    },
  });

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "Copied to clipboard!" });
  };

  const totalStorage = files.reduce((sum, f) => sum + f.size, 0);

  const filteredFiles = fileSearch
    ? files.filter(f => f.originalName.toLowerCase().includes(fileSearch.toLowerCase()) || f.mimetype.includes(fileSearch.toLowerCase()))
    : files;

  const filteredLibs = search
    ? CDN_LIBRARIES.map(cat => ({ ...cat, items: cat.items.filter(lib => lib.name.toLowerCase().includes(search.toLowerCase()) || lib.desc.toLowerCase().includes(search.toLowerCase())) })).filter(cat => cat.items.length > 0)
    : CDN_LIBRARIES;

  return (
    <div className="flex-1 overflow-auto min-h-0 p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <HardDrive className="w-6 h-6 text-primary" />
          Files & Storage
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your uploaded files, downloaded ZIPs, and browse code libraries.
        </p>
      </div>

      {/* Storage summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Image className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Uploaded Files</p>
              <p className="text-xl font-bold" data-testid="text-file-count">{files.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/10 flex items-center justify-center flex-shrink-0">
              <FileArchive className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ZIP Downloads</p>
              <p className="text-xl font-bold" data-testid="text-zip-count">{exports.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-400/10 flex items-center justify-center flex-shrink-0">
              <HardDrive className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Storage Used</p>
              <p className="text-xl font-bold" data-testid="text-storage-used">{formatBytes(totalStorage)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-400/10 flex items-center justify-center flex-shrink-0">
              <Library className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Libraries</p>
              <p className="text-xl font-bold">{CDN_LIBRARIES.reduce((s, c) => s + c.items.length, 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="files" className="flex flex-col">
        <TabsList className="w-full md:w-auto grid grid-cols-3">
          <TabsTrigger value="files" className="gap-1.5" data-testid="tab-files">
            <Folder className="w-4 h-4" />Files
          </TabsTrigger>
          <TabsTrigger value="downloads" className="gap-1.5" data-testid="tab-downloads">
            <FileArchive className="w-4 h-4" />Downloads
          </TabsTrigger>
          <TabsTrigger value="libraries" className="gap-1.5" data-testid="tab-libraries">
            <Library className="w-4 h-4" />Libraries
          </TabsTrigger>
        </TabsList>

        {/* ── FILES TAB ── */}
        <TabsContent value="files" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={fileSearch}
                onChange={e => setFileSearch(e.target.value)}
                className="pl-9"
                data-testid="input-file-search"
              />
            </div>
          </div>

          {filesLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <Folder className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-medium text-muted-foreground">No files yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Files you upload in the AI chat will appear here automatically
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredFiles.map(file => (
                <div key={file.id} className="group relative rounded-xl border border-border/60 bg-card overflow-hidden hover:border-primary/40 transition-all" data-testid={`card-file-${file.id}`}>
                  {file.mimetype.startsWith("image/") ? (
                    <div className="aspect-square bg-muted/30 overflow-hidden">
                      <img src={file.url} alt={file.originalName} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  ) : file.mimetype.startsWith("video/") ? (
                    <div className="aspect-square bg-muted/30 flex items-center justify-center">
                      <Film className="w-10 h-10 text-muted-foreground/50" />
                    </div>
                  ) : (
                    <div className="aspect-square bg-muted/30 flex items-center justify-center">
                      <FileText className="w-10 h-10 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="p-2 space-y-1">
                    <p className="text-xs font-medium truncate" title={file.originalName}>{file.originalName}</p>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyToClipboard(window.location.origin + file.url, `file-${file.id}`)}
                          className="p-1 rounded hover:bg-muted transition-colors"
                          title="Copy link"
                          data-testid={`button-copy-file-${file.id}`}
                        >
                          {copied === `file-${file.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                        </button>
                        <a href={file.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted transition-colors" title="Open" data-testid={`link-open-file-${file.id}`}>
                          <ExternalLink className="w-3 h-3 text-muted-foreground" />
                        </a>
                        <button
                          onClick={() => deleteFileMutation.mutate(file.id)}
                          className="p-1 rounded hover:bg-destructive/10 transition-colors"
                          title="Delete"
                          data-testid={`button-delete-file-${file.id}`}
                        >
                          <Trash2 className="w-3 h-3 text-destructive/70" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60">{formatDate(file.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── DOWNLOADS TAB ── */}
        <TabsContent value="downloads" className="mt-4 space-y-4">
          {exportsLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : exports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <FileArchive className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-medium text-muted-foreground">No ZIP downloads yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  When you download your built app as a ZIP in the AI chat, it will be logged here
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {exports.map(exp => (
                <div key={exp.id} className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 hover:border-border transition-all" data-testid={`card-export-${exp.id}`}>
                  <div className="w-10 h-10 rounded-xl bg-amber-400/10 flex items-center justify-center flex-shrink-0">
                    <FileArchive className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{exp.projectName}.zip</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {formatDate(exp.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {exp.fileCount} {exp.fileCount === 1 ? "file" : "files"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── LIBRARIES TAB ── */}
        <TabsContent value="libraries" className="mt-4 space-y-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search libraries (e.g. chart, animation, map)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-library-search"
            />
          </div>

          <div className="space-y-6">
            {filteredLibs.map(category => (
              <div key={category.category}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-7 h-7 rounded-lg ${category.bg} flex items-center justify-center`}>
                    <category.icon className={`w-4 h-4 ${category.color}`} />
                  </div>
                  <h3 className="font-semibold text-sm">{category.category}</h3>
                  <span className="text-xs text-muted-foreground">({category.items.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {category.items.map(lib => (
                    <Card key={lib.name} className="border-border/60 hover:border-primary/30 transition-all" data-testid={`card-library-${lib.name.replace(/\s+/g, "-").toLowerCase()}`}>
                      <CardContent className="p-4 space-y-3">
                        <div>
                          <p className="font-semibold text-sm">{lib.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{lib.desc}</p>
                        </div>
                        <div className="relative">
                          <pre className="text-[10px] bg-muted/50 rounded-lg p-2 overflow-x-auto text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap break-all">{lib.tag}</pre>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1.5 text-xs"
                            onClick={() => copyToClipboard(lib.tag, `lib-${lib.name}`)}
                            data-testid={`button-copy-lib-${lib.name.replace(/\s+/g, "-").toLowerCase()}`}
                          >
                            {copied === `lib-${lib.name}` ? <><Check className="w-3 h-3 text-green-500" />Copied!</> : <><Copy className="w-3 h-3" />Copy Tag</>}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="gap-1.5 text-xs"
                            onClick={() => {
                              const prompt = `Add ${lib.name} to my app using this CDN tag: ${lib.tag.split('\n')[0]}`;
                              window.location.href = `/chat?prompt=${encodeURIComponent(prompt)}`;
                            }}
                            data-testid={`button-add-to-chat-${lib.name.replace(/\s+/g, "-").toLowerCase()}`}
                          >
                            <Zap className="w-3 h-3" />Add to App
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
