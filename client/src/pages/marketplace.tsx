import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Store, Search, Download, Tag, Plus, Trash2, Globe, Code2, Gamepad2, BarChart2, Wrench, ArrowUpRight, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface MarketplaceListing {
  id: number;
  userId: string;
  title: string;
  description: string | null;
  category: string;
  htmlContent: string;
  tags: string[] | null;
  price: number;
  downloads: number;
  status: string;
  createdAt: string;
}

interface PublishedApp {
  id: number;
  appName: string;
  subdomain: string;
  htmlContent: string;
}

const CATEGORIES = [
  { value: "all", label: "All", icon: Store },
  { value: "website", label: "Website", icon: Globe },
  { value: "app", label: "Web App", icon: Code2 },
  { value: "game", label: "Game", icon: Gamepad2 },
  { value: "dashboard", label: "Dashboard", icon: BarChart2 },
  { value: "tool", label: "Tool", icon: Wrench },
];

export default function MarketplacePage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishForm, setPublishForm] = useState({ title: "", description: "", category: "website", tags: "" });
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: listings, isLoading } = useQuery<MarketplaceListing[]>({
    queryKey: ["/api/marketplace", category, search],
    queryFn: () => fetch(`/api/marketplace?category=${category}&search=${encodeURIComponent(search)}`).then(r => r.json()),
  });

  const { data: myListings } = useQuery<MarketplaceListing[]>({
    queryKey: ["/api/marketplace/mine"],
  });

  const { data: myApps } = useQuery<PublishedApp[]>({
    queryKey: ["/api/published-apps"],
  });

  const publishMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/marketplace", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/mine"] });
      setPublishOpen(false);
      setPublishForm({ title: "", description: "", category: "website", tags: "" });
      toast({ title: "Published to Marketplace!", description: "Your app is now listed." });
    },
    onError: () => toast({ title: "Error", description: "Failed to publish", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/marketplace/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/mine"] });
      toast({ title: "Listing removed" });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/marketplace/${id}/clone`, {}),
    onSuccess: async (res: any) => {
      const data = await res.json();
      const prompt = `I want to customize this existing app called "${data.title}". Here is the complete HTML code:\n\n\`\`\`html\n${data.htmlContent}\n\`\`\`\n\nPlease help me modify and improve it.`;
      sessionStorage.setItem("builder_prompt", prompt);
      toast({ title: "Cloning app...", description: "Opening in AI chat" });
      setTimeout(() => setLocation("/chat"), 300);
    },
    onError: () => toast({ title: "Error", description: "Failed to clone", variant: "destructive" }),
  });

  const handlePublish = () => {
    if (!selectedAppId) return toast({ title: "Select an app", variant: "destructive" });
    if (!publishForm.title.trim()) return toast({ title: "Enter a title", variant: "destructive" });
    const app = myApps?.find(a => a.id === parseInt(selectedAppId));
    if (!app) return;
    publishMutation.mutate({
      ...publishForm,
      htmlContent: app.htmlContent,
      tags: publishForm.tags ? publishForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    });
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Store className="w-8 h-8 text-yellow-400" />
              Marketplace
            </h1>
            <p className="text-muted-foreground mt-1">Browse, clone, and share apps built with Afro AI</p>
          </div>
          <Button
            data-testid="button-publish-listing"
            onClick={() => setPublishOpen(true)}
            className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold gap-2"
          >
            <Plus className="w-4 h-4" />
            Publish App
          </Button>
        </div>

        <Tabs defaultValue="browse">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="browse" data-testid="tab-browse">Browse</TabsTrigger>
            <TabsTrigger value="mine" data-testid="tab-mine">My Listings</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-6 mt-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  data-testid="input-search"
                  placeholder="Search apps..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 bg-white/5 border-white/10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map(cat => (
                  <Button
                    key={cat.value}
                    data-testid={`button-category-${cat.value}`}
                    variant={category === cat.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCategory(cat.value)}
                    className={category === cat.value ? "bg-yellow-500 text-black" : "border-white/10 bg-white/5"}
                  >
                    <cat.icon className="w-3.5 h-3.5 mr-1" />
                    {cat.label}
                  </Button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <Card key={i} className="border-white/10 bg-white/5 animate-pulse h-48" />
                ))}
              </div>
            ) : listings && listings.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {listings.map(listing => (
                  <Card
                    key={listing.id}
                    data-testid={`card-listing-${listing.id}`}
                    className="border-white/10 bg-white/5 hover:border-yellow-400/30 hover:bg-yellow-400/5 transition-all duration-200 group"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400/20 to-orange-400/20 border border-yellow-400/20 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-5 h-5 text-yellow-400" />
                        </div>
                        <Badge variant="outline" className="text-xs border-white/10 text-muted-foreground capitalize">
                          {listing.category}
                        </Badge>
                      </div>
                      <CardTitle className="text-sm font-semibold mt-2 line-clamp-1">{listing.title}</CardTitle>
                      {listing.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{listing.description}</p>
                      )}
                    </CardHeader>
                    <CardContent>
                      {listing.tags && listing.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {listing.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-xs bg-white/5 border border-white/10 rounded px-1.5 py-0.5 flex items-center gap-1">
                              <Tag className="w-2.5 h-2.5" />{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Download className="w-3 h-3" />
                          {listing.downloads} clones
                        </div>
                        <Button
                          data-testid={`button-clone-${listing.id}`}
                          size="sm"
                          onClick={() => cloneMutation.mutate(listing.id)}
                          disabled={cloneMutation.isPending}
                          className="bg-yellow-500 hover:bg-yellow-400 text-black text-xs gap-1"
                        >
                          <ArrowUpRight className="w-3 h-3" />
                          Clone
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="py-16 text-center">
                  <Store className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No listings yet</h3>
                  <p className="text-muted-foreground text-sm mb-4">Be the first to publish an app to the marketplace!</p>
                  <Button onClick={() => setPublishOpen(true)} className="bg-yellow-500 hover:bg-yellow-400 text-black gap-2">
                    <Plus className="w-4 h-4" /> Publish Your App
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="mine" className="mt-6">
            {myListings && myListings.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {myListings.map(listing => (
                  <Card key={listing.id} data-testid={`card-my-listing-${listing.id}`} className="border-white/10 bg-white/5">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold line-clamp-1">{listing.title}</CardTitle>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-red-400 hover:text-red-300"
                          data-testid={`button-delete-listing-${listing.id}`}
                          onClick={() => deleteMutation.mutate(listing.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <Badge variant="outline" className="text-xs w-fit border-white/10 capitalize">{listing.category}</Badge>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Download className="w-3.5 h-3.5" />
                        {listing.downloads} clones
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="py-16 text-center">
                  <p className="text-muted-foreground">You haven't published any listings yet.</p>
                  <Button onClick={() => setPublishOpen(true)} className="mt-4 bg-yellow-500 hover:bg-yellow-400 text-black gap-2">
                    <Plus className="w-4 h-4" /> Publish Now
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Publish Dialog */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="border-white/10 bg-zinc-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publish App to Marketplace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select App</Label>
              <Select value={selectedAppId} onValueChange={setSelectedAppId}>
                <SelectTrigger data-testid="select-app" className="bg-white/5 border-white/10 mt-1">
                  <SelectValue placeholder="Choose a published app..." />
                </SelectTrigger>
                <SelectContent>
                  {myApps?.map(app => (
                    <SelectItem key={app.id} value={String(app.id)}>{app.appName || app.subdomain}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Listing Title</Label>
              <Input
                data-testid="input-listing-title"
                value={publishForm.title}
                onChange={e => setPublishForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. African Restaurant Website Template"
                className="bg-white/5 border-white/10 mt-1"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                data-testid="input-listing-description"
                value={publishForm.description}
                onChange={e => setPublishForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Describe what this app does..."
                className="bg-white/5 border-white/10 mt-1"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={publishForm.category} onValueChange={v => setPublishForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger data-testid="select-category" className="bg-white/5 border-white/10 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="app">Web App</SelectItem>
                    <SelectItem value="game">Game</SelectItem>
                    <SelectItem value="dashboard">Dashboard</SelectItem>
                    <SelectItem value="tool">Tool</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tags (comma separated)</Label>
                <Input
                  data-testid="input-tags"
                  value={publishForm.tags}
                  onChange={e => setPublishForm(p => ({ ...p, tags: e.target.value }))}
                  placeholder="e.g. africa, restaurant"
                  className="bg-white/5 border-white/10 mt-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-confirm-publish"
              onClick={handlePublish}
              disabled={publishMutation.isPending}
              className="bg-yellow-500 hover:bg-yellow-400 text-black"
            >
              {publishMutation.isPending ? "Publishing..." : "Publish to Marketplace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
